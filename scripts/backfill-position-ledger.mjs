#!/usr/bin/env node

/**
 * Reconstructs position_ledger from historical PoolManager.ModifyLiquidity logs.
 *
 * Why this exists: the DopplerHookInitializer:ModifyLiquidity handler was added
 * in commit fe3d42f (event-sourced ledger). Pools whose seeding happened before
 * that landed in production have no ledger entries. The newer DopplerHookInitializer
 * (0xBDF938...) only re-emits ModifyLiquidity for rare lifecycle events — per-pool
 * seeding goes through PoolManager directly and is never echoed by the initializer,
 * so even with the handler in place those pools' ledgers stay empty.
 *
 * The PoolManager always emits ModifyLiquidity for every position modification.
 * Filtering by sender = each registered DopplerHookInitializer address yields a
 * single chronological stream of every dhook seeding event.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base, mainnet } from "viem/chains";

const CHAIN_DEFAULTS = {
  8453: {
    chain: base,
    rpcEnvVars: ["PONDER_RPC_URL_8453", "BASE_RPC"],
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    fromBlock: 30822164n,
    initializers: [
      "0xaa096f558f3d4c9226de77e7cc05f18e180b2544",
      "0xbdf938149ac6a781f94faa0ed45e6a0e984c6544",
    ],
  },
  1: {
    chain: mainnet,
    rpcEnvVars: ["PONDER_RPC_URL_1", "MAINNET_RPC"],
    poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
    fromBlock: 24326115n,
    initializers: [
      "0xaa096f558f3d4c9226de77e7cc05f18e180b2544",
      "0xbdf938149ac6a781f94faa0ed45e6a0e984c6544",
    ],
  },
};

const MODIFY_LIQUIDITY_EVENT = parseAbiItem(
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"
);

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));
loadDotEnv(resolve(process.cwd(), ".env.local"));

function parseArgs(argv) {
  const args = {
    apply: false,
    chainId: 8453,
    chunkSize: 9000n,
    concurrency: 5,
    fromBlock: undefined,
    toBlock: undefined,
    senders: undefined,
    schema: undefined,
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    poolManager: undefined,
    applyBatchSize: 500,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--verbose") args.verbose = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${a}`);
      }
      if (key === "chain-id") args.chainId = Number(value);
      else if (key === "chunk-size") args.chunkSize = BigInt(value);
      else if (key === "concurrency") args.concurrency = Number(value);
      else if (key === "from-block") args.fromBlock = BigInt(value);
      else if (key === "to-block") args.toBlock = BigInt(value);
      else if (key === "senders") args.senders = value.split(",").map((s) => s.trim().toLowerCase());
      else if (key === "schema") args.schema = value;
      else if (key === "rpc-url") args.rpcUrl = value;
      else if (key === "database-url") args.databaseUrl = value;
      else if (key === "pool-manager") args.poolManager = value.toLowerCase();
      else if (key === "apply-batch-size") args.applyBatchSize = Number(value);
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-position-ledger.mjs [options]

Reconstructs position_ledger from historical PoolManager.ModifyLiquidity logs
filtered by sender = each registered DopplerHookInitializer address. Run once
to repair the ledger for pools whose seeding events were never indexed.

Options:
  --database-url <url>      Postgres URL. Defaults to DATABASE_URL.
  --schema <schema>         Ponder schema containing position_ledger and pool.
  --rpc-url <url>           RPC URL. Defaults to PONDER_RPC_URL_<chainId>.
  --chain-id <id>           Chain ID. Defaults to 8453 (Base).
  --pool-manager <addr>     PoolManager address. Defaults to chain default.
  --senders <list>          Comma-separated sender addresses to filter by.
                            Defaults to chain's DopplerHookInitializer addresses.
  --from-block <n>          Lower bound for log scan. Defaults to v4 start.
  --to-block <n>            Upper bound. Defaults to latest.
  --chunk-size <n>          Blocks per getLogs call. Defaults to 9000.
  --concurrency <n>         Concurrent getLogs calls. Defaults to 5.
  --apply-batch-size <n>    Upsert rows per transaction. Defaults to 500.
  --verbose                 Print per-pool aggregation summary.
  --apply                   Write to position_ledger. Without this, dry-run only.

Examples:
  node scripts/backfill-position-ledger.mjs --schema public
  node scripts/backfill-position-ledger.mjs --schema public --apply
`);
}

function psqlJson(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  ).trim();
  return JSON.parse(stdout || "[]");
}

function psqlExec(databaseUrl, sql) {
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function qi(id) { return `"${String(id).replaceAll('"', '""')}"`; }
function ql(v) { return `'${String(v).replaceAll("'", "''")}'`; }
function hexNoPrefix(v) { return String(v).toLowerCase().replace(/^0x/, ""); }

function resolveTable(databaseUrl, schema, tableName) {
  const filter = schema
    ? `and table_schema = ${ql(schema)}`
    : "and table_schema not in ('pg_catalog', 'information_schema')";
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select table_schema, table_name from information_schema.tables
       where table_name = ${ql(tableName)} ${filter}
       order by table_schema limit 2
     ) q`,
  );
  if (rows.length === 0) {
    throw new Error(`Table ${tableName} not found${schema ? ` in schema ${schema}` : ""}`);
  }
  if (rows.length > 1) {
    throw new Error(`Multiple ${tableName} tables found; pass --schema explicitly.`);
  }
  return rows[0];
}

function getColumnType(databaseUrl, table, columnName) {
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select data_type from information_schema.columns
       where table_schema = ${ql(table.table_schema)}
         and table_name = ${ql(table.table_name)}
         and column_name = ${ql(columnName)}
       limit 1
     ) q`,
  );
  if (rows.length === 0) {
    throw new Error(`Column ${columnName} not found in ${table.table_schema}.${table.table_name}`);
  }
  return rows[0].data_type;
}

function loadKnownPoolIds({ databaseUrl, poolTable, addressType, chainId }) {
  const qualified = `${qi(poolTable.table_schema)}.${qi(poolTable.table_name)}`;
  const expr = addressType === "bytea"
    ? `concat('0x', encode(${qi("address")}, 'hex'))`
    : `lower(${qi("address")}::text)`;
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${expr} as address
       from ${qualified}
       where ${qi("chain_id")}::numeric = ${Number(chainId)}
     ) q`,
  );
  const set = new Set();
  for (const r of rows) set.add(String(r.address).toLowerCase());
  return set;
}

async function scanSender({ client, poolManager, sender, fromBlock, toBlock, chunkSize, concurrency, onChunk }) {
  const ranges = [];
  for (let cur = fromBlock; cur <= toBlock; cur += chunkSize) {
    const end = cur + chunkSize - 1n > toBlock ? toBlock : cur + chunkSize - 1n;
    ranges.push([cur, end]);
  }
  console.log(`  scanning sender=${sender}: blocks [${fromBlock}, ${toBlock}], ${ranges.length} chunks`);

  let processed = 0;
  let logsFound = 0;
  for (let i = 0; i < ranges.length; i += concurrency) {
    const slice = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map(([from, to]) =>
        client.getLogs({
          address: poolManager,
          event: MODIFY_LIQUIDITY_EVENT,
          args: { sender },
          fromBlock: from,
          toBlock: to,
        }).catch((err) => {
          console.warn(`    chunk [${from}, ${to}] failed: ${err.shortMessage ?? err.message}; retrying single`);
          return client.getLogs({
            address: poolManager,
            event: MODIFY_LIQUIDITY_EVENT,
            args: { sender },
            fromBlock: from,
            toBlock: to,
          });
        }),
      ),
    );
    for (const logs of results) {
      logsFound += logs.length;
      onChunk(logs);
    }
    processed += slice.length;
    if (processed % 100 === 0 || processed === ranges.length) {
      console.log(`    progress: ${processed}/${ranges.length} chunks, ${logsFound} logs so far`);
    }
  }
  console.log(`  done sender=${sender}: ${logsFound} logs across ${ranges.length} chunks`);
  return logsFound;
}

function aggregate(map, log) {
  const id = log.args.id.toLowerCase();
  const tickLower = Number(log.args.tickLower);
  const tickUpper = Number(log.args.tickUpper);
  const delta = log.args.liquidityDelta;
  const key = `${id}|${tickLower}|${tickUpper}`;
  const prev = map.get(key);
  map.set(key, prev !== undefined ? prev + delta : delta);
}

function buildUpsertSql({ schema, table, addressType, chainId, batch }) {
  const qualified = `${qi(schema)}.${qi(table)}`;
  const poolIdExpr = addressType === "bytea"
    ? "decode(v.pool_hex, 'hex')"
    : "concat('0x', v.pool_hex)";
  const values = batch
    .map(({ poolId, tickLower, tickUpper, liquidity }) =>
      `(${ql(hexNoPrefix(poolId))}, ${tickLower}, ${tickUpper}, ${ql(liquidity.toString())}::numeric)`,
    )
    .join(",\n");
  return `begin;
insert into ${qualified} (${qi("pool_id")}, ${qi("tick_lower")}, ${qi("tick_upper")}, ${qi("liquidity")}, ${qi("chain_id")})
select ${poolIdExpr}, v.tick_lower, v.tick_upper, v.liquidity, ${Number(chainId)}
from (values ${values}) as v(pool_hex, tick_lower, tick_upper, liquidity)
on conflict (${qi("pool_id")}, ${qi("tick_lower")}, ${qi("tick_upper")}, ${qi("chain_id")})
do update set ${qi("liquidity")} = excluded.${qi("liquidity")};
commit;
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const chainCfg = CHAIN_DEFAULTS[args.chainId];
  if (!chainCfg) throw new Error(`No defaults for chain ${args.chainId}; pass --pool-manager and --senders explicitly.`);
  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");

  const rpcUrl = args.rpcUrl ??
    chainCfg.rpcEnvVars.map((v) => process.env[v]).find(Boolean);
  if (!rpcUrl) throw new Error(`Missing --rpc-url or one of: ${chainCfg.rpcEnvVars.join(", ")}`);

  const poolManager = (args.poolManager ?? chainCfg.poolManager).toLowerCase();
  const senders = (args.senders ?? chainCfg.initializers).map((s) => s.toLowerCase());
  if (senders.length === 0) throw new Error(`No senders configured; pass --senders explicitly.`);

  const ledgerTable = resolveTable(args.databaseUrl, args.schema, "position_ledger");
  const poolTable = resolveTable(args.databaseUrl, args.schema, "pool");
  const ledgerPoolIdType = getColumnType(args.databaseUrl, ledgerTable, "pool_id");
  const poolAddressType = getColumnType(args.databaseUrl, poolTable, "address");

  const client = createPublicClient({
    chain: chainCfg.chain,
    transport: http(rpcUrl, { batch: false }),
  });

  const fromBlock = args.fromBlock ?? chainCfg.fromBlock;
  const toBlock = args.toBlock ?? (await client.getBlockNumber());

  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
  console.log(`Chain: ${args.chainId}`);
  console.log(`PoolManager: ${poolManager}`);
  console.log(`Senders: ${senders.length}`);
  for (const s of senders) console.log(`  - ${s}`);
  console.log(`Block range: [${fromBlock}, ${toBlock}]`);
  console.log(`Ledger table: ${ledgerTable.table_schema}.${ledgerTable.table_name} (pool_id type=${ledgerPoolIdType})`);
  console.log(`Pool table: ${poolTable.table_schema}.${poolTable.table_name} (address type=${poolAddressType})`);

  console.log("\nLoading known pool IDs...");
  const knownPools = loadKnownPoolIds({
    databaseUrl: args.databaseUrl,
    poolTable,
    addressType: poolAddressType,
    chainId: args.chainId,
  });
  console.log(`  ${knownPools.size} pools in pool table for chain ${args.chainId}`);

  const aggMap = new Map();
  let totalLogs = 0;
  let unknownIds = 0;
  for (const sender of senders) {
    await scanSender({
      client, poolManager, sender,
      fromBlock, toBlock, chunkSize: args.chunkSize, concurrency: args.concurrency,
      onChunk: (logs) => {
        for (const log of logs) {
          totalLogs++;
          const id = log.args.id.toLowerCase();
          if (!knownPools.has(id)) { unknownIds++; continue; }
          aggregate(aggMap, log);
        }
      },
    });
  }

  console.log(`\nProcessed ${totalLogs} logs (${unknownIds} for unknown pools).`);
  console.log(`Aggregated into ${aggMap.size} (poolId, tickLower, tickUpper) entries.`);

  const rows = [];
  let zeroEntries = 0;
  for (const [key, liquidity] of aggMap) {
    if (liquidity === 0n) { zeroEntries++; continue; }
    const [poolId, tlStr, tuStr] = key.split("|");
    rows.push({ poolId, tickLower: Number(tlStr), tickUpper: Number(tuStr), liquidity });
  }
  rows.sort((a, b) => (a.poolId === b.poolId ? a.tickLower - b.tickLower : a.poolId.localeCompare(b.poolId)));
  console.log(`Final rows: ${rows.length} (${zeroEntries} zero-liquidity entries skipped).`);

  const touchedPools = new Set(rows.map((r) => r.poolId));
  console.log(`Distinct pools touched: ${touchedPools.size}.`);

  if (args.verbose) {
    const perPool = new Map();
    for (const r of rows) perPool.set(r.poolId, (perPool.get(r.poolId) ?? 0) + 1);
    const sample = [...perPool.entries()].slice(0, 20);
    for (const [pid, n] of sample) console.log(`  ${pid}: ${n} ranges`);
  }

  if (args.apply && rows.length > 0) {
    let applied = 0;
    for (let i = 0; i < rows.length; i += args.applyBatchSize) {
      const batch = rows.slice(i, i + args.applyBatchSize);
      psqlExec(args.databaseUrl, buildUpsertSql({
        schema: ledgerTable.table_schema,
        table: ledgerTable.table_name,
        addressType: ledgerPoolIdType,
        chainId: args.chainId,
        batch,
      }));
      applied += batch.length;
      if (i % (args.applyBatchSize * 10) === 0 || applied === rows.length) {
        console.log(`Applied ${applied}/${rows.length}`);
      }
    }
    console.log(`Done. Applied ${applied} ledger upserts.`);
  } else if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write.");
  }
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exitCode = 1;
});
