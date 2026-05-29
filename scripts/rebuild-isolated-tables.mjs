#!/usr/bin/env node

// Rebuild every partitioned user table in TARGET so its physical column
// order matches the TS-declaration order in ponder.schema.ts.
//
// Why: Ponder issues several positional writes that assume the user
// table's physical column order equals Object.values(getTableColumns(t))
// — e.g. `COPY <table> FROM STDIN` with values streamed in TS order
// (indexing-store/cache.ts), `INSERT INTO <table> SELECT col1, col2, ...`
// with no target column list (database/actions.ts revert path), etc.
// When the physical order diverges from TS order — which happens when
// the source table was extended over time via ALTER ADD COLUMN and our
// migration replicated it via CREATE TABLE LIKE — values land in the
// wrong columns and Postgres rejects with type-mismatch errors.
//
// This script:
//   1. Statically parses ponder.schema.ts to read the TS-declaration
//      order of columns per onchainTable.
//   2. Introspects the target schema for current column types/defaults
//      and PKs.
//   3. Emits SQL to drop each user table and recreate it column-by-column
//      in TS order, then move data per chain with explicit column lists.
//
// After running, also re-run --phase reorg and --phase indexes of the
// .mjs generator — the reorg shadows and secondary indexes were dropped
// along with the old parent and need to be rebuilt against the new
// layout.
//
// Usage:
//   DATABASE_URL=... node scripts/rebuild-isolated-tables.mjs \
//     --source <source-schema> --target prod_isolated --chains 1,143,8453 \
//     > rebuild.sql
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f rebuild.sql
//   node scripts/generate-isolated-migration.mjs \
//     --source <source-schema> --target prod_isolated --phase reorg \
//     | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -
//   node scripts/generate-isolated-migration.mjs \
//     --source <source-schema> --target prod_isolated --phase indexes \
//     | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_CHAINS = [1, 143, 8453];

function parseArgs(argv) {
  const args = {
    source: null,
    target: null,
    chains: DEFAULT_CHAINS,
    schemaPath: "ponder.schema.ts",
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--source":
        args.source = next;
        i += 1;
        break;
      case "--target":
        args.target = next;
        i += 1;
        break;
      case "--chains":
        args.chains = next.split(",").map((s) => {
          const n = Number(s.trim());
          if (!Number.isInteger(n)) {
            throw new Error(`Invalid chain id: ${s}`);
          }
          return n;
        });
        i += 1;
        break;
      case "--schema-path":
        args.schemaPath = next;
        i += 1;
        break;
      case "--database-url":
        args.databaseUrl = next;
        i += 1;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.source) throw new Error("--source is required");
  if (!args.target) throw new Error("--target is required");
  if (!args.databaseUrl) {
    throw new Error("Provide --database-url or set DATABASE_URL");
  }
  if (args.source === args.target) {
    throw new Error("--source and --target must differ");
  }
  return args;
}

function printHelp() {
  process.stderr.write(
    "Usage: node scripts/rebuild-isolated-tables.mjs \\\n" +
      "  --source <schema> --target <schema> \\\n" +
      "  [--chains 1,143,8453] [--schema-path ponder.schema.ts] \\\n" +
      "  [--database-url postgres://...]\n",
  );
}

// ── Identifier helpers ──

function qi(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Byte-for-byte replica of Drizzle's toSnakeCase (drizzle-orm/casing.js):
// matches lowercase/digit runs, all-caps abbreviation runs, and
// CapitalizedWords; joins with underscore. This is exactly how Ponder
// snake-cases column names in onchainTable, so the names we produce here
// match Ponder's own SQL identifiers byte-for-byte.
function toSnakeCase(input) {
  const words =
    input
      .replace(/['’]/g, "")
      .match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];
  return words.map((w) => w.toLowerCase()).join("_");
}

// ── Postgres introspection (via psql) ──

function psqlJson(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
  ).trim();
  return JSON.parse(stdout || "[]");
}

function getColumns(databaseUrl, schema, table) {
  const sql = `
    select coalesce(json_agg(json_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'notNull', a.attnotnull,
      'default', pg_get_expr(ad.adbin, ad.adrelid)
    ) order by a.attnum), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where n.nspname = ${literal(schema)}
      and c.relname = ${literal(table)}
  `;
  return psqlJson(databaseUrl, sql);
}

function getPrimaryKey(databaseUrl, schema, table) {
  const sql = `
    select coalesce(json_agg(att.attname order by k.ord), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_index i on i.indrelid = c.oid and i.indisprimary
    join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on true
    join pg_attribute att on att.attrelid = c.oid and att.attnum = k.attnum
    where n.nspname = ${literal(schema)} and c.relname = ${literal(table)}
  `;
  return psqlJson(databaseUrl, sql);
}

// ── TS schema parser ──
//
// We only care about extracting the SQL table name and the ordered list
// of column JS keys from each onchainTable("name", (t) => ({ ... })) call.
// We don't try to understand types or values; the column object's keys at
// depth 0 are what we want, in source order.
//
// The parser is deliberately conservative: it tokenizes string literals,
// /* */ + // comments, and parenthesis/brace/bracket nesting, and only
// records identifiers immediately followed by ":" while at depth 0 inside
// the column object. Anything fancier (computed keys, spread, etc.) gets
// skipped.

function stripComments(content) {
  let out = "";
  let i = 0;
  let stringChar = null;
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (stringChar) {
      out += ch;
      if (ch === "\\") {
        if (i + 1 < content.length) out += next;
        i += 2;
        continue;
      }
      if (ch === stringChar) stringChar = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      stringChar = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      const nl = content.indexOf("\n", i);
      if (nl === -1) return out;
      // preserve newline so line numbers in error messages stay stable
      out += "\n";
      i = nl + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = content.indexOf("*/", i + 2);
      if (end === -1) return out;
      i = end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function skipWhitespace(content, pos) {
  while (pos < content.length && /\s/.test(content[pos])) pos += 1;
  return pos;
}

function parseStringLiteral(content, pos) {
  const quote = content[pos];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let value = "";
  let i = pos + 1;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "\\") {
      value += content[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === quote) return { value, end: i + 1 };
    value += ch;
    i += 1;
  }
  return null;
}

// Extract top-level keys from an object literal. Caller passes the
// position right AFTER the opening "{". Returns the ordered keys and the
// position just AFTER the matching "}".
function extractObjectKeys(content, startPos) {
  const keys = [];
  let i = startPos;
  let stringChar = null;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let currentKey = "";
  let expectingKey = true;

  while (i < content.length) {
    const ch = content[i];

    if (stringChar) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === stringChar) stringChar = null;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      // A string literal can appear as a quoted key OR as a value. If it
      // appears immediately where we were expecting a key, consume it as
      // a string-quoted key.
      const lit = parseStringLiteral(content, i);
      if (lit && expectingKey) {
        const after = skipWhitespace(content, lit.end);
        if (content[after] === ":") {
          keys.push(lit.value);
          i = after + 1;
          expectingKey = false;
          currentKey = "";
          continue;
        }
      }
      stringChar = ch;
      i += 1;
      continue;
    }

    const atDepthZero =
      braceDepth === 0 && parenDepth === 0 && bracketDepth === 0;

    if (ch === "{") {
      braceDepth += 1;
      expectingKey = false;
      currentKey = "";
      i += 1;
      continue;
    }
    if (ch === "}") {
      if (atDepthZero) return { keys, end: i + 1 };
      braceDepth -= 1;
      i += 1;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      expectingKey = false;
      currentKey = "";
      i += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth -= 1;
      i += 1;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      expectingKey = false;
      currentKey = "";
      i += 1;
      continue;
    }
    if (ch === "]") {
      bracketDepth -= 1;
      i += 1;
      continue;
    }

    if (!atDepthZero) {
      i += 1;
      continue;
    }

    if (ch === ":" && currentKey.trim() !== "") {
      keys.push(currentKey.trim());
      currentKey = "";
      expectingKey = false;
      i += 1;
      continue;
    }
    if (ch === ",") {
      currentKey = "";
      expectingKey = true;
      i += 1;
      continue;
    }
    if (expectingKey && /[\w$]/.test(ch)) {
      currentKey += ch;
    } else if (!/\s/.test(ch)) {
      // any other non-space char ends the "expecting a key" state
      expectingKey = false;
      currentKey = "";
    }
    i += 1;
  }

  // Fell off end without finding the closing brace
  return { keys, end: i };
}

function parseSchemaForOrderedColumns(content) {
  const tables = new Map();
  const stripped = stripComments(content);
  let i = 0;
  while (i < stripped.length) {
    const idx = stripped.indexOf("onchainTable(", i);
    if (idx === -1) break;
    let pos = idx + "onchainTable(".length;
    pos = skipWhitespace(stripped, pos);

    // First argument: table name string literal.
    const nameLit = parseStringLiteral(stripped, pos);
    if (!nameLit) {
      i = idx + 1;
      continue;
    }
    pos = skipWhitespace(stripped, nameLit.end);
    if (stripped[pos] !== ",") {
      i = idx + 1;
      continue;
    }
    pos = skipWhitespace(stripped, pos + 1);

    // Second argument: an arrow function `(t) => ({ ...cols })`. Skip the
    // arrow function parameter list (one or more identifiers in parens),
    // skip "=>", and land on the opening "(" of the parenthesized object
    // literal.
    if (stripped[pos] !== "(") {
      i = idx + 1;
      continue;
    }
    // skip "(...)"
    let parenDepth = 1;
    pos += 1;
    while (pos < stripped.length && parenDepth > 0) {
      const ch = stripped[pos];
      if (ch === "(") parenDepth += 1;
      else if (ch === ")") parenDepth -= 1;
      pos += 1;
    }
    pos = skipWhitespace(stripped, pos);
    if (stripped.slice(pos, pos + 2) !== "=>") {
      i = idx + 1;
      continue;
    }
    pos = skipWhitespace(stripped, pos + 2);
    if (stripped.slice(pos, pos + 2) !== "({") {
      i = idx + 1;
      continue;
    }
    pos += 2;

    const { keys, end } = extractObjectKeys(stripped, pos);
    tables.set(nameLit.value, keys.map(toSnakeCase));
    i = end;
  }
  return tables;
}

// ── DDL emission ──

function emitTableRebuild(args, tableName, tsOrder, out) {
  const targetCols = getColumns(args.databaseUrl, args.target, tableName);
  if (targetCols.length === 0) {
    out.push(`-- skipping ${tableName}: not present in target schema`);
    out.push("");
    return;
  }

  const targetColMap = new Map(targetCols.map((c) => [c.name, c]));

  const missing = tsOrder.filter((n) => !targetColMap.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Target ${args.target}.${tableName} is missing columns the TS ` +
        `schema requires: ${missing.join(", ")}. Source/target may have ` +
        `drifted further than this script can repair.`,
    );
  }

  const extra = targetCols
    .map((c) => c.name)
    .filter((n) => !tsOrder.includes(n));
  if (extra.length > 0) {
    out.push(
      `-- NOTE: target ${tableName} has columns not declared in TS schema: ${extra.join(", ")}`,
    );
    out.push(`-- These will be DROPPED in the rebuild.`);
  }

  const pk = getPrimaryKey(args.databaseUrl, args.target, tableName);
  if (pk.length === 0) {
    throw new Error(`Target ${args.target}.${tableName} has no primary key`);
  }
  if (!pk.includes("chain_id")) {
    throw new Error(
      `Target ${args.target}.${tableName} PK (${pk.join(", ")}) does not include chain_id`,
    );
  }

  // Already-correct fast path: if the target's column order (filtered to
  // TS-declared columns) already equals TS order, skip this table.
  const targetOrderFiltered = targetCols
    .map((c) => c.name)
    .filter((n) => tsOrder.includes(n));
  if (
    targetOrderFiltered.length === tsOrder.length &&
    targetOrderFiltered.every((n, i) => n === tsOrder[i])
  ) {
    out.push(`-- ${tableName}: physical order already matches TS, skipping`);
    out.push("");
    return;
  }

  out.push(`-- === ${tableName} ===`);
  out.push(`BEGIN;`);

  for (const chainId of args.chains) {
    const partition = `${tableName}_${chainId}`;
    out.push(
      `ALTER TABLE ${qi(args.target)}.${qi(tableName)} ` +
        `DETACH PARTITION ${qi(args.target)}.${qi(partition)};`,
    );
  }

  for (const chainId of args.chains) {
    const partition = `${tableName}_${chainId}`;
    const oldName = `${tableName}_old_${chainId}`;
    out.push(
      `ALTER TABLE ${qi(args.target)}.${qi(partition)} RENAME TO ${qi(oldName)};`,
    );
  }

  const reorgTable = `_reorg__${tableName}`;
  out.push(
    `DROP TABLE IF EXISTS ${qi(args.target)}.${qi(reorgTable)} CASCADE;`,
  );

  out.push(`DROP TABLE ${qi(args.target)}.${qi(tableName)};`);

  const columnDefs = tsOrder.map((name) => {
    const col = targetColMap.get(name);
    let def = `${qi(name)} ${col.type}`;
    if (col.notNull) def += " NOT NULL";
    if (col.default !== null) def += ` DEFAULT ${col.default}`;
    return `  ${def}`;
  });
  out.push(
    `CREATE TABLE ${qi(args.target)}.${qi(tableName)} (\n${columnDefs.join(",\n")}\n) PARTITION BY LIST (chain_id);`,
  );

  const pkCols = pk.map(qi).join(", ");
  out.push(
    `ALTER TABLE ${qi(args.target)}.${qi(tableName)} ADD PRIMARY KEY (${pkCols});`,
  );

  for (const chainId of args.chains) {
    const partition = `${tableName}_${chainId}`;
    out.push(
      `CREATE TABLE ${qi(args.target)}.${qi(partition)} ` +
        `PARTITION OF ${qi(args.target)}.${qi(tableName)} ` +
        `FOR VALUES IN (${chainId});`,
    );
  }

  out.push(`COMMIT;`);
  out.push(``);

  // Per-chain data move, outside the schema transaction so each chain
  // can run in its own session if you want to parallelize. Column lists
  // are explicit on both sides so the old (drifted) physical order is
  // irrelevant on the read side.
  const colList = tsOrder.map(qi).join(", ");
  for (const chainId of args.chains) {
    const newPartition = `${tableName}_${chainId}`;
    const oldName = `${tableName}_old_${chainId}`;
    out.push(
      `INSERT INTO ${qi(args.target)}.${qi(newPartition)} (${colList}) ` +
        `SELECT ${colList} FROM ${qi(args.target)}.${qi(oldName)};`,
    );
  }
  out.push(``);

  for (const chainId of args.chains) {
    const oldName = `${tableName}_old_${chainId}`;
    out.push(`DROP TABLE ${qi(args.target)}.${qi(oldName)};`);
  }
  out.push(``);
}

// ── Main ──

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n`);
    printHelp();
    process.exit(2);
  }

  const schemaSource = readFileSync(resolve(args.schemaPath), "utf8");
  const tsTables = parseSchemaForOrderedColumns(schemaSource);
  if (tsTables.size === 0) {
    throw new Error(
      `No onchainTable() calls found in ${args.schemaPath} — parser may have failed`,
    );
  }

  const out = [];
  out.push(`-- Generated by scripts/rebuild-isolated-tables.mjs`);
  out.push(`-- Source schema: ${args.source}`);
  out.push(`-- Target schema: ${args.target}`);
  out.push(`-- Chains: ${args.chains.join(", ")}`);
  out.push(`-- TS schema: ${resolve(args.schemaPath)}`);
  out.push(`-- Tables found: ${tsTables.size}`);
  out.push(`-- Generated at: ${new Date().toISOString()}`);
  out.push(``);
  out.push(`\\set ON_ERROR_STOP on`);
  out.push(``);

  try {
    for (const [tableName, tsOrder] of tsTables) {
      emitTableRebuild(args, tableName, tsOrder, out);
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(out.join("\n"));
  process.stdout.write("\n");
}

main();
