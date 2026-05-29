#!/usr/bin/env node

// Emit SQL that converts a Ponder schema (ordering: "multichain") into a
// chain-partitioned copy compatible with ordering: "experimental_isolated",
// without re-indexing from scratch.
//
// Reads structure from the SOURCE schema in a live Postgres and emits DDL
// (+ optional data-copy) for a new TARGET schema where every user table is
// PARTITION BY LIST (chain_id) with one child partition per configured chain.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/generate-isolated-migration.mjs \
//     --source prod --target prod_isolated --chains 1,143,8453 \
//     --phase schema > migrate-schema.sql
//
//   DATABASE_URL=postgres://... node scripts/generate-isolated-migration.mjs \
//     --source prod --target prod_isolated --phase data > migrate-data.sql
//
// Phases:
//   schema  emit CREATE SCHEMA / CREATE TABLE / partitions / indexes /
//           reorg shadows / _ponder_meta / _ponder_checkpoint / operation_id
//   data    emit INSERT SELECT statements to copy rows from source -> target
//   all     both phases, schema first
//
// What you still need to do manually after running both phases:
//   1. Patch _ponder_meta.value->>'build_id' in the target schema to match
//      what `ponder start` computes for the new isolated config, OR
//      start once with PONDER_EXPERIMENTAL_DB=platform to bypass the check.
//   2. Drop the `reorg` and `live_query` triggers from the source-schema
//      tables before pointing the new indexer at the target. Ponder will
//      recreate them on each partition when the chain transitions to live.

import { execFileSync } from "node:child_process";
import process from "node:process";

const DEFAULT_CHAINS = [1, 143, 8453];
const SYSTEM_TABLES = new Set(["_ponder_meta", "_ponder_checkpoint"]);
const OPERATION_ID_SEQUENCE = "operation_id";

function parseArgs(argv) {
  const args = {
    source: null,
    target: null,
    chains: DEFAULT_CHAINS,
    phase: "schema",
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--source":
      case "--source-schema":
        args.source = next;
        i += 1;
        break;
      case "--target":
      case "--target-schema":
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
      case "--phase":
        if (!["schema", "data", "all"].includes(next)) {
          throw new Error(`--phase must be schema|data|all, got ${next}`);
        }
        args.phase = next;
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
    `Usage: node scripts/generate-isolated-migration.mjs \\\n` +
      `  --source <schema> --target <schema> \\\n` +
      `  [--chains 1,143,8453] [--phase schema|data|all] \\\n` +
      `  [--database-url postgres://...]\n`,
  );
}

function qi(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function psqlJson(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
  ).trim();
  return JSON.parse(stdout || "[]");
}

// ── Introspection ──

function listTables(databaseUrl, schema) {
  const sql = `
    select coalesce(json_agg(json_build_object(
      'name', table_name
    ) order by table_name), '[]'::json)
    from information_schema.tables
    where table_schema = ${literal(schema)}
      and table_type = 'BASE TABLE'
  `;
  return psqlJson(databaseUrl, sql).map((row) => row.name);
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

function getColumns(databaseUrl, schema, table) {
  const sql = `
    select coalesce(json_agg(json_build_object(
      'name', column_name,
      'ordinal', ordinal_position
    ) order by ordinal_position), '[]'::json)
    from information_schema.columns
    where table_schema = ${literal(schema)} and table_name = ${literal(table)}
  `;
  return psqlJson(databaseUrl, sql);
}

function getNonPrimaryIndexDefs(databaseUrl, schema, table) {
  // pg_indexes.indexdef gives a textual CREATE INDEX statement that we can
  // re-emit with the schema name rewritten. Filter out the primary key index
  // (re-created via INCLUDING CONSTRAINTS on the partitioned parent).
  const sql = `
    select coalesce(json_agg(json_build_object(
      'name', i.relname,
      'indexdef', pg_get_indexdef(ix.indexrelid)
    ) order by i.relname), '[]'::json)
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
    join pg_index ix on ix.indrelid = t.oid
    join pg_class i on i.oid = ix.indexrelid
    where n.nspname = ${literal(schema)}
      and t.relname = ${literal(table)}
      and not ix.indisprimary
  `;
  return psqlJson(databaseUrl, sql);
}

function sequenceExists(databaseUrl, schema, name) {
  const sql = `
    select coalesce(json_agg(c.relname), '[]'::json)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${literal(schema)}
      and c.relname = ${literal(name)}
      and c.relkind = 'S'
  `;
  return psqlJson(databaseUrl, sql).length > 0;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// ── DDL emission ──

function classify(tables) {
  const reorg = [];
  const meta = [];
  const user = [];
  for (const name of tables) {
    if (SYSTEM_TABLES.has(name)) meta.push(name);
    else if (name.startsWith("_reorg__")) reorg.push(name);
    else user.push(name);
  }
  return { reorg, meta, user };
}

function rewriteIndexDef(indexdef, sourceSchema, targetSchema, table) {
  // pg_get_indexdef emits: CREATE [UNIQUE] INDEX <name> ON <schema>.<table> ...
  // We rewrite the ON clause to point at the target schema. The index name
  // itself can stay (different schema namespace, no collision).
  const escapedSchema = sourceSchema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\bON\\s+(?:"?${escapedSchema}"?\\.)?"?${escapedTable}"?\\b`,
    "i",
  );
  return indexdef.replace(pattern, `ON ${qi(targetSchema)}.${qi(table)}`);
}

function emitHeader(args) {
  const lines = [
    `-- Generated by scripts/generate-isolated-migration.mjs`,
    `-- Source schema: ${args.source}`,
    `-- Target schema: ${args.target}`,
    `-- Chains: ${args.chains.join(", ")}`,
    `-- Phase: ${args.phase}`,
    `-- Generated at: ${new Date().toISOString()}`,
    ``,
    `\\set ON_ERROR_STOP on`,
    ``,
  ];
  return lines.join("\n");
}

function emitSchemaPhase(args, intro) {
  const { databaseUrl, source, target, chains } = args;
  const tables = listTables(databaseUrl, source);
  if (tables.length === 0) {
    throw new Error(`No tables found in source schema "${source}"`);
  }
  const { reorg, meta, user } = classify(tables);

  // Sanity-check every user table has chain_id in its PK before we emit
  // anything. If this fails, the schema is not viable for isolated mode
  // without DDL surgery beyond the scope of this generator.
  const violations = [];
  for (const table of user) {
    const pk = getPrimaryKey(databaseUrl, source, table);
    if (pk.length === 0) {
      violations.push(`${table}: no primary key`);
      continue;
    }
    if (!pk.includes("chain_id")) {
      violations.push(`${table}: PK is (${pk.join(", ")}) — missing chain_id`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Cannot proceed; the following tables are not isolation-ready:\n  - ${violations.join("\n  - ")}`,
    );
  }

  const out = [];
  out.push(intro);
  out.push(`-- === schema phase ===`);
  out.push(``);
  out.push(`CREATE SCHEMA IF NOT EXISTS ${qi(target)};`);
  out.push(``);

  // Sequence for reorg operation ids. Ponder creates this implicitly on
  // boot, but creating it up front means data-copy phase can carry the
  // current value across so trigger-fired rows continue monotonically.
  if (sequenceExists(databaseUrl, source, OPERATION_ID_SEQUENCE)) {
    out.push(
      `CREATE SEQUENCE IF NOT EXISTS ${qi(target)}.${qi(OPERATION_ID_SEQUENCE)};`,
    );
    out.push(``);
  }

  // Meta tables — plain LIKE-ALL copy (no partitioning, no chain key).
  for (const table of meta) {
    out.push(
      `CREATE TABLE ${qi(target)}.${qi(table)} (LIKE ${qi(source)}.${qi(table)} INCLUDING ALL);`,
    );
  }
  if (meta.length > 0) out.push(``);

  // User tables — partitioned parent + child per chain + secondary indexes.
  for (const table of user) {
    out.push(`-- ${table}`);
    out.push(
      `CREATE TABLE ${qi(target)}.${qi(table)} ` +
        `(LIKE ${qi(source)}.${qi(table)} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ` +
        `PARTITION BY LIST (chain_id);`,
    );
    for (const chainId of chains) {
      const partition = `${table}_${chainId}`;
      out.push(
        `CREATE TABLE ${qi(target)}.${qi(partition)} ` +
          `PARTITION OF ${qi(target)}.${qi(table)} ` +
          `FOR VALUES IN (${chainId});`,
      );
    }
    const indexes = getNonPrimaryIndexDefs(databaseUrl, source, table);
    for (const idx of indexes) {
      const rewritten = rewriteIndexDef(idx.indexdef, source, target, table);
      out.push(`${rewritten};`);
    }
    out.push(``);
  }

  // Reorg shadow tables — plain LIKE-ALL copy, not partitioned.
  for (const table of reorg) {
    out.push(
      `CREATE TABLE ${qi(target)}.${qi(table)} (LIKE ${qi(source)}.${qi(table)} INCLUDING ALL);`,
    );
  }
  if (reorg.length > 0) out.push(``);

  return out.join("\n");
}

function emitDataPhase(args, intro) {
  const { databaseUrl, source, target } = args;
  const tables = listTables(databaseUrl, source);
  const { reorg, meta, user } = classify(tables);

  const out = [];
  out.push(intro);
  out.push(`-- === data phase ===`);
  out.push(``);
  out.push(
    `-- WARNING: run with the source-schema indexer stopped (or otherwise`,
  );
  out.push(
    `-- frozen) so the target schema is a consistent point-in-time snapshot.`,
  );
  out.push(``);
  out.push(`BEGIN;`);
  out.push(``);

  // Meta first so checkpoints exist before any user-row INSERTs would
  // matter, then user tables, then reorg shadows. Order does not strictly
  // matter for correctness (no FKs), but keeps logical grouping.
  for (const table of meta) {
    out.push(
      `INSERT INTO ${qi(target)}.${qi(table)} SELECT * FROM ${qi(source)}.${qi(table)};`,
    );
  }
  if (meta.length > 0) out.push(``);

  for (const table of user) {
    // Each INSERT routes rows into the correct partition by chain_id.
    // Columns are listed explicitly so adds/removes between snapshots don't
    // produce silently-wrong copies.
    const columns = getColumns(databaseUrl, source, table).map((c) => c.name);
    if (columns.length === 0) {
      throw new Error(`No columns found for ${source}.${table}`);
    }
    const colList = columns.map(qi).join(", ");
    out.push(
      `INSERT INTO ${qi(target)}.${qi(table)} (${colList}) ` +
        `SELECT ${colList} FROM ${qi(source)}.${qi(table)};`,
    );
  }
  if (user.length > 0) out.push(``);

  for (const table of reorg) {
    out.push(
      `INSERT INTO ${qi(target)}.${qi(table)} SELECT * FROM ${qi(source)}.${qi(table)};`,
    );
  }
  if (reorg.length > 0) out.push(``);

  if (sequenceExists(databaseUrl, source, OPERATION_ID_SEQUENCE)) {
    out.push(
      `SELECT setval(${literal(`${target}.${OPERATION_ID_SEQUENCE}`)}, ` +
        `(SELECT last_value FROM ${qi(source)}.${qi(OPERATION_ID_SEQUENCE)}));`,
    );
    out.push(``);
  }

  out.push(`COMMIT;`);
  out.push(``);
  out.push(`-- Post-copy reminders:`);
  out.push(
    `--   * Patch _ponder_meta.value->>'build_id' in ${target} to match the`,
  );
  out.push(
    `--     new isolated build_id, or first-boot with PONDER_EXPERIMENTAL_DB=platform.`,
  );
  out.push(
    `--   * Drop \`reorg\` and \`live_query\` triggers on ${source} tables before`,
  );
  out.push(
    `--     starting the new indexer (Ponder will recreate them on partitions).`,
  );

  return out.join("\n");
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

  const intro = emitHeader(args);

  try {
    if (args.phase === "schema" || args.phase === "all") {
      process.stdout.write(emitSchemaPhase(args, intro));
      process.stdout.write("\n");
    }
    if (args.phase === "data" || args.phase === "all") {
      process.stdout.write(emitDataPhase(args, intro));
      process.stdout.write("\n");
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
