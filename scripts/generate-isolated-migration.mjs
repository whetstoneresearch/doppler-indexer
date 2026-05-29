#!/usr/bin/env node

// Emit SQL that converts a Ponder schema (ordering: "multichain") into a
// chain-partitioned copy compatible with ordering: "experimental_isolated",
// without re-indexing from scratch.
//
// Reads structure from the SOURCE schema in a live Postgres and emits DDL
// (+ optional data-copy + post-load index creation) for a new TARGET schema
// where every user table is PARTITION BY LIST (chain_id) with one child
// partition per configured chain.
//
// Phases:
//   schema   CREATE SCHEMA / partitioned parents / per-chain partitions /
//            _ponder_meta / _ponder_checkpoint / _reorg__ shadows / sequence.
//            Secondary indexes are intentionally NOT created here — building
//            them after data load is dramatically faster on millions of rows.
//   data     INSERT statements that copy rows from source -> target. Writes
//            directly to each child partition (one INSERT per (table, chain))
//            so multiple chains can be loaded in parallel from separate psql
//            sessions. _reorg__ shadows and _ponder_meta + _ponder_checkpoint
//            are handled separately so they can be ordered around the chain
//            loads.
//   indexes  CREATE INDEX statements for every secondary index on user and
//            _reorg__ tables, with the ON clause rewritten to the target
//            schema. Run last so each index is built in one batched sort
//            instead of per-row maintenance during the data load.
//   pk       ALTER TABLE ... ADD PRIMARY KEY (...) for every user table.
//            Standalone remediation for targets created before the schema
//            phase emitted PKs. Bounded by total row count per table.
//   all      schema, then data (no --chain), then indexes.
//
// Data-phase scopes (pick one when running --phase data):
//   default       all chains' partition INSERTs + reorg shadows + meta tables
//   --chain N     only chain N's partition INSERTs and chain N's reorg rows
//                 (use to fan out parallel per-chain loaders)
//   --meta-only   only _ponder_meta + _ponder_checkpoint + sequence setval
//                 (run LAST, after every chain's data is in place — see below)
//
// Live-indexer interference (running the data phase while the source-schema
// Ponder indexer keeps writing):
//   * Source-side locks are ACCESS SHARE only, so source-table writers are
//     not blocked.
//   * Each (table, chain) INSERT is emitted as its own implicit transaction,
//     so individual snapshots are short. Long single transactions inhibit
//     VACUUM on the source — splitting per chain limits the duration.
//   * Buffer cache and I/O are shared with the live indexer. Run during a
//     low-traffic window if possible, or sequentially rather than parallel.
//   * Meta MUST be copied LAST. Once _ponder_checkpoint is in target, the
//     new indexer (pointed at target) will resume from that checkpoint and
//     trust that all data <= checkpoint is already present. If you copy meta
//     before data finishes, the new indexer will skip blocks whose rows you
//     hadn't yet copied.
//
// What you still need to do manually after running all phases:
//   1. Patch _ponder_meta.value->>'build_id' in the target schema to match
//      what `ponder start` computes for the new isolated config, OR
//      start once with PONDER_EXPERIMENTAL_DB=platform to bypass the check.
//   2. The `reorg` and `live_query` triggers on the source-schema tables
//      can stay in place while you verify the new schema — they only fire
//      on writes to the source tables and do not touch the target. Drop
//      them at promotion time if you wish.

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
    chain: null,
    metaOnly: false,
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
        if (!["schema", "data", "indexes", "pk", "all"].includes(next)) {
          throw new Error(
            `--phase must be schema|data|indexes|pk|all, got ${next}`,
          );
        }
        args.phase = next;
        i += 1;
        break;
      case "--chain": {
        const n = Number(next);
        if (!Number.isInteger(n)) {
          throw new Error(`--chain must be an integer, got ${next}`);
        }
        args.chain = n;
        i += 1;
        break;
      }
      case "--meta-only":
        args.metaOnly = true;
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
  if (args.chain !== null && args.metaOnly) {
    throw new Error("--chain and --meta-only are mutually exclusive");
  }
  if ((args.chain !== null || args.metaOnly) && args.phase !== "data") {
    throw new Error("--chain and --meta-only are only valid with --phase data");
  }
  if (args.chain !== null && !args.chains.includes(args.chain)) {
    throw new Error(
      `--chain ${args.chain} is not in --chains (${args.chains.join(", ")})`,
    );
  }
  return args;
}

function printHelp() {
  process.stderr.write(
    `Usage: node scripts/generate-isolated-migration.mjs \\\n` +
      `  --source <schema> --target <schema> \\\n` +
      `  [--chains 1,143,8453] [--phase schema|data|indexes|pk|all] \\\n` +
      `  [--chain N] [--meta-only] [--database-url postgres://...]\n`,
  );
}

function qi(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

function hasColumn(databaseUrl, schema, table, column) {
  const sql = `
    select coalesce(json_agg(column_name), '[]'::json)
    from information_schema.columns
    where table_schema = ${literal(schema)}
      and table_name = ${literal(table)}
      and column_name = ${literal(column)}
  `;
  return psqlJson(databaseUrl, sql).length > 0;
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

// ── DDL emission helpers ──

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
  //
  // Identifiers can be quoted or bare depending on whether quote_identifier
  // decided they needed escaping (reserved words like "user", "position",
  // "module" come back quoted). The alternation here matches the full
  // quoted form OR a bare form with a non-word lookahead — we must not use
  // an optional `"?...?"` because the trailing optional quote can backtrack
  // to zero, eating only the opening quote and leaving the closing one
  // dangling next to the replacement, which corrupts the next statement.
  const escSchema = sourceSchema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ident = (name) => `(?:"${name}"|${name}(?![\\w$]))`;
  const pattern = new RegExp(
    String.raw`\bON\s+(?:${ident(escSchema)}\.)?${ident(escTable)}`,
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
    `-- Phase: ${args.phase}` +
      (args.chain !== null ? ` (chain=${args.chain})` : "") +
      (args.metaOnly ? " (meta-only)" : ""),
    `-- Generated at: ${new Date().toISOString()}`,
    ``,
    `\\set ON_ERROR_STOP on`,
    ``,
  ];
  return lines.join("\n");
}

function reorgUserTableName(reorgTable) {
  return reorgTable.replace(/^_reorg__/, "");
}

// ── Schema phase ──

function collectUserPks(databaseUrl, source, userTables) {
  // Introspect PK column order for every user table and bail out if any
  // table is not isolation-ready. The PK is needed in two places: the
  // sanity-check on chain_id membership, and the ALTER TABLE ADD PRIMARY
  // KEY we emit after each CREATE TABLE — `LIKE ... INCLUDING CONSTRAINTS`
  // does not copy PRIMARY KEY (only CHECK/NOT NULL), so we have to put it
  // back explicitly or `ON CONFLICT (pk_cols)` writes during crashRecovery
  // and live indexing have no matching unique constraint to target.
  const pks = new Map();
  const violations = [];
  for (const table of userTables) {
    const pk = getPrimaryKey(databaseUrl, source, table);
    if (pk.length === 0) {
      violations.push(`${table}: no primary key`);
      continue;
    }
    if (!pk.includes("chain_id")) {
      violations.push(`${table}: PK is (${pk.join(", ")}) — missing chain_id`);
      continue;
    }
    pks.set(table, pk);
  }
  if (violations.length > 0) {
    throw new Error(
      `Cannot proceed; the following tables are not isolation-ready:\n  - ${violations.join("\n  - ")}`,
    );
  }
  return pks;
}

function emitSchemaPhase(args, intro) {
  const { databaseUrl, source, target, chains } = args;
  const tables = listTables(databaseUrl, source);
  if (tables.length === 0) {
    throw new Error(`No tables found in source schema "${source}"`);
  }
  const { reorg, meta, user } = classify(tables);
  const pks = collectUserPks(databaseUrl, source, user);

  const out = [];
  out.push(intro);
  out.push(`-- === schema phase ===`);
  out.push(``);
  out.push(`CREATE SCHEMA IF NOT EXISTS ${qi(target)};`);
  out.push(``);

  if (sequenceExists(databaseUrl, source, OPERATION_ID_SEQUENCE)) {
    out.push(
      `CREATE SEQUENCE IF NOT EXISTS ${qi(target)}.${qi(OPERATION_ID_SEQUENCE)};`,
    );
    out.push(``);
  }

  // Meta tables — plain LIKE-ALL copy. These are tiny, so we keep their
  // (single) PK index up front rather than deferring.
  for (const table of meta) {
    out.push(
      `CREATE TABLE ${qi(target)}.${qi(table)} (LIKE ${qi(source)}.${qi(table)} INCLUDING ALL);`,
    );
  }
  if (meta.length > 0) out.push(``);

  // User tables — partitioned parent + child per chain. The primary key is
  // added with ALTER TABLE since LIKE INCLUDING CONSTRAINTS does not copy
  // it. Secondary indexes are still deferred to the indexes phase.
  for (const table of user) {
    out.push(`-- ${table}`);
    out.push(
      `CREATE TABLE ${qi(target)}.${qi(table)} ` +
        `(LIKE ${qi(source)}.${qi(table)} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ` +
        `PARTITION BY LIST (chain_id);`,
    );
    const pkCols = pks.get(table).map(qi).join(", ");
    out.push(
      `ALTER TABLE ${qi(target)}.${qi(table)} ADD PRIMARY KEY (${pkCols});`,
    );
    for (const chainId of chains) {
      const partition = `${table}_${chainId}`;
      out.push(
        `CREATE TABLE ${qi(target)}.${qi(partition)} ` +
          `PARTITION OF ${qi(target)}.${qi(table)} ` +
          `FOR VALUES IN (${chainId});`,
      );
    }
    out.push(``);
  }

  // Reorg shadow tables — plain non-partitioned, defaults + constraints
  // only (the checkpoint index is recreated in the indexes phase).
  for (const table of reorg) {
    out.push(
      `CREATE TABLE ${qi(target)}.${qi(table)} ` +
        `(LIKE ${qi(source)}.${qi(table)} INCLUDING DEFAULTS INCLUDING CONSTRAINTS);`,
    );
  }
  if (reorg.length > 0) out.push(``);

  return out.join("\n");
}

// ── PK-only phase (remediation for schemas built before PKs were emitted) ──

function emitPkPhase(args, intro) {
  const { databaseUrl, source, target } = args;
  const tables = listTables(databaseUrl, source);
  const { user } = classify(tables);
  const pks = collectUserPks(databaseUrl, source, user);

  const out = [];
  out.push(intro);
  out.push(`-- === pk phase ===`);
  out.push(``);
  out.push(
    `-- Adds the missing PRIMARY KEY to each partitioned parent in the`,
  );
  out.push(
    `-- target schema. Each ALTER scans every partition once to build the`,
  );
  out.push(
    `-- unique index, so this is bounded by total row count. Each is its`,
  );
  out.push(`-- own implicit transaction.`);
  out.push(``);

  for (const table of user) {
    const pkCols = pks.get(table).map(qi).join(", ");
    out.push(
      `ALTER TABLE ${qi(target)}.${qi(table)} ADD PRIMARY KEY (${pkCols});`,
    );
  }
  out.push(``);

  return out.join("\n");
}

// ── Data phase ──

function emitChainPartitionInsert({
  source,
  target,
  table,
  chainId,
  columns,
}) {
  const partition = `${table}_${chainId}`;
  const colList = columns.map(qi).join(", ");
  return (
    `INSERT INTO ${qi(target)}.${qi(partition)} (${colList}) ` +
    `SELECT ${colList} FROM ${qi(source)}.${qi(table)} ` +
    `WHERE chain_id = ${chainId};`
  );
}

function emitReorgChainInsert({
  source,
  target,
  table,
  chainId,
  columns,
  filterByChain,
}) {
  const colList = columns.map(qi).join(", ");
  const whereClause = filterByChain ? ` WHERE chain_id = ${chainId}` : "";
  return (
    `INSERT INTO ${qi(target)}.${qi(table)} (${colList}) ` +
    `SELECT ${colList} FROM ${qi(source)}.${qi(table)}${whereClause};`
  );
}

function emitMetaInserts({ databaseUrl, source, target, meta }) {
  const lines = [];
  for (const table of meta) {
    const cols = getColumns(databaseUrl, source, table).map((c) => c.name);
    if (cols.length === 0) {
      throw new Error(`No columns found for ${source}.${table}`);
    }
    const colList = cols.map(qi).join(", ");
    lines.push(
      `INSERT INTO ${qi(target)}.${qi(table)} (${colList}) ` +
        `SELECT ${colList} FROM ${qi(source)}.${qi(table)};`,
    );
  }
  return lines;
}

function emitSequenceSync({ databaseUrl, source, target }) {
  if (!sequenceExists(databaseUrl, source, OPERATION_ID_SEQUENCE)) return [];
  return [
    `SELECT setval(${literal(`${target}.${OPERATION_ID_SEQUENCE}`)}, ` +
      `(SELECT last_value FROM ${qi(source)}.${qi(OPERATION_ID_SEQUENCE)}));`,
  ];
}

function emitDataPhase(args, intro) {
  const { databaseUrl, source, target, chains, chain, metaOnly } = args;
  const tables = listTables(databaseUrl, source);
  const { reorg, meta, user } = classify(tables);

  const out = [];
  out.push(intro);

  if (metaOnly) {
    out.push(`-- === data phase: meta only ===`);
    out.push(``);
    out.push(`-- Run AFTER every chain's data INSERTs have committed.`);
    out.push(`-- Copies _ponder_meta + _ponder_checkpoint and syncs the`);
    out.push(`-- operation_id sequence. Wrapped in one transaction since`);
    out.push(`-- these tables are tiny and the writes need to land together.`);
    out.push(``);
    out.push(`BEGIN;`);
    for (const line of emitMetaInserts({ databaseUrl, source, target, meta })) {
      out.push(line);
    }
    for (const line of emitSequenceSync({ databaseUrl, source, target })) {
      out.push(line);
    }
    out.push(`COMMIT;`);
    out.push(``);
    return out.join("\n");
  }

  const targetChains = chain !== null ? [chain] : chains;
  const scopeLabel =
    chain !== null ? `chain ${chain}` : `chains ${chains.join(", ")}`;

  out.push(`-- === data phase: ${scopeLabel} ===`);
  out.push(``);
  out.push(`-- Each INSERT runs as its own implicit transaction so a single`);
  out.push(`-- table/chain failure rolls back small and can be retried.`);
  out.push(
    `-- Inserts target the per-chain child partition directly to skip`,
  );
  out.push(`-- partition routing and to enable parallelism across chains.`);
  if (chain === null) {
    out.push(``);
    out.push(`-- Meta tables (_ponder_meta, _ponder_checkpoint) are NOT`);
    out.push(`-- emitted here. Run with --meta-only AFTER all chain data has`);
    out.push(`-- landed, so the new indexer's resume checkpoint is consistent.`);
  }
  out.push(``);
  out.push(
    `-- Speed knob (optional, per session running this script):`,
  );
  out.push(`--   SET synchronous_commit = off;`);
  out.push(``);

  for (const table of user) {
    const cols = getColumns(databaseUrl, source, table).map((c) => c.name);
    if (cols.length === 0) {
      throw new Error(`No columns found for ${source}.${table}`);
    }
    for (const chainId of targetChains) {
      out.push(
        emitChainPartitionInsert({
          source,
          target,
          table,
          chainId,
          columns: cols,
        }),
      );
    }
  }
  if (user.length > 0) out.push(``);

  for (const table of reorg) {
    const cols = getColumns(databaseUrl, source, table).map((c) => c.name);
    if (cols.length === 0) {
      throw new Error(`No columns found for ${source}.${table}`);
    }
    // Reorg tables are not partitioned, but each row has a chain_id, so we
    // filter by chain when running in chain-scoped mode. When the user
    // table's chain_id column exists (always true here), the reorg shadow
    // mirrors it.
    const filterByChain =
      chain !== null && hasColumn(databaseUrl, source, table, "chain_id");
    for (const chainId of targetChains) {
      out.push(
        emitReorgChainInsert({
          source,
          target,
          table,
          chainId,
          columns: cols,
          filterByChain,
        }),
      );
      // In whole-table mode (no --chain) we only emit one INSERT per reorg
      // table — break after the first iteration.
      if (chain === null) break;
    }
  }
  if (reorg.length > 0) out.push(``);

  return out.join("\n");
}

// ── Index phase ──

function emitIndexPhase(args, intro) {
  const { databaseUrl, source, target } = args;
  const tables = listTables(databaseUrl, source);
  const { reorg, user } = classify(tables);

  const out = [];
  out.push(intro);
  out.push(`-- === indexes phase ===`);
  out.push(``);
  out.push(
    `-- CREATE INDEX on a partitioned parent automatically builds the`,
  );
  out.push(
    `-- matching partitioned index on each child. Each statement is its own`,
  );
  out.push(
    `-- implicit transaction; expect each to take time proportional to the`,
  );
  out.push(`-- table size.`);
  out.push(``);

  const targetsInOrder = [...user, ...reorg];
  for (const table of targetsInOrder) {
    const indexes = getNonPrimaryIndexDefs(databaseUrl, source, table);
    if (indexes.length === 0) continue;
    out.push(`-- ${table}`);
    for (const idx of indexes) {
      const rewritten = rewriteIndexDef(idx.indexdef, source, target, table);
      out.push(`${rewritten};`);
    }
    out.push(``);
  }

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
      if (args.phase === "all") {
        // In all-mode we still need the meta inserts after the chain loads.
        const metaArgs = { ...args, metaOnly: true };
        process.stdout.write(emitDataPhase(metaArgs, emitHeader(metaArgs)));
        process.stdout.write("\n");
      }
    }
    if (args.phase === "indexes" || args.phase === "all") {
      process.stdout.write(emitIndexPhase(args, intro));
      process.stdout.write("\n");
    }
    if (args.phase === "pk") {
      process.stdout.write(emitPkPhase(args, intro));
      process.stdout.write("\n");
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
