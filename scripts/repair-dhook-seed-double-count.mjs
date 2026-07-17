#!/usr/bin/env node

/**
 * Repairs dhook/rehype pools whose position_ledger double-counted the seed mint.
 *
 * The bug (fixed in indexer-dhook.ts): a dhook/rehype pool's create-tx seed
 * ModifyLiquidity logs were written to position_ledger by BOTH the live
 * PoolManager:ModifyLiquidity handler (via its isDHookLiquiditySender branch) AND
 * seedPositionLedgerFromCreateTx replaying the same logs. upsertPositionLedger
 * SUMS deltas, so every seeded range ended up ~2x its true liquidity. That makes
 * computeReservesFromPositions return base reserves > total supply, so
 * dollarLiquidity (base leg = reserves*price) exceeds marketCap — impossible for a
 * single-sided bonding curve.
 *
 * This script rebuilds each pool's ledger from the deduplicated on-chain
 * ModifyLiquidity history (each log counted exactly once) and writes the corrected
 * ABSOLUTE liquidity per (tickLower, tickUpper) range — mirroring how a clean
 * re-index would build it. It reports, per pool, the old vs corrected total ledger
 * liquidity so you can see which pools were over-counted (double-counted pools show
 * a ~2x drop). Reserves0/reserves1 and dollarLiquidity are DOWNSTREAM of the
 * ledger: processDHookSwap recomputes them from the ledger on every swap, so an
 * actively-traded pool self-heals on its next trade. For idle pools, follow up with
 * scripts/backfill-negative-reserves.mjs then scripts/recompute-dhook-dollar-liquidity.mjs.
 *
 * Dry-run by default; pass --apply to write. Scope to one pool with --pool <id>.
 *
 * Usage (robinhood):
 *   node scripts/repair-dhook-seed-double-count.mjs --schema prod_1 --chain-id 4663
 *   node scripts/repair-dhook-seed-double-count.mjs --schema prod_1 --chain-id 4663 --apply
 *   node scripts/repair-dhook-seed-double-count.mjs --schema prod_1 --chain-id 4663 \
 *     --pool 0x3d9f9086a504ac3efabacedd9ba1ac83263c0b7d5c80d55f913de8b1459d9bf0 --apply
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http, parseAbiItem } from "viem";
import { base, mainnet } from "viem/chains";

// Robinhood is not in viem/chains; a minimal object suffices (transport is
// supplied explicitly via http(rpcUrl)).
const robinhood = {
  id: 4663,
  name: "robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [] } },
};

// Per-chain PoolManager + the initializer addresses that emit seed mints as
// sender. Must match src/config/chains/*.ts and scripts/backfill-position-ledger.mjs.
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
  4663: {
    chain: robinhood,
    rpcEnvVars: ["PONDER_RPC_URL_4663", "ROBINHOOD_RPC"],
    poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    fromBlock: 367349n,
    // On robinhood the DopplerHookInitializer is itself the pool hook, so the
    // seeding ModifyLiquidity events on PoolManager carry sender = initializer.
    initializers: [
      "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544",
      "0x6f02324d20cc679d0e585290caa6b16bacbc0f77",
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
    chainId: 4663,
    chunkSize: 9000n,
    concurrency: 5,
    fromBlock: undefined,
    toBlock: undefined,
    senders: undefined,
    schema: undefined,
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    poolManager: undefined,
    pool: undefined,
    applyBatchSize: 500,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${a}`);
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
      else if (key === "pool") args.pool = value.toLowerCase();
      else if (key === "apply-batch-size") args.applyBatchSize = Number(value);
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/repair-dhook-seed-double-count.mjs [options]

Rebuilds position_ledger for dhook/rehype pools from the deduplicated on-chain
ModifyLiquidity history and writes the corrected absolute per-range liquidity,
undoing the seed double-count. Reserves0/1 and dollarLiquidity are downstream of
the ledger and refresh on each pool's next swap (or via backfill-negative-reserves.mjs
+ recompute-dhook-dollar-liquidity.mjs for idle pools).

Options:
  --database-url <url>      Postgres URL. Defaults to DATABASE_URL.
  --schema <schema>         Ponder schema containing position_ledger and pool.
  --rpc-url <url>           RPC URL. Defaults to PONDER_RPC_URL_<chainId>.
  --chain-id <id>           Chain ID. Defaults to 4663 (robinhood).
  --pool <poolId>           Repair only this v4 poolId. Default: all dhook/rehype pools.
  --pool-manager <addr>     PoolManager address. Defaults to chain default.
  --senders <list>          Comma-separated seed sender addresses. Defaults to
                            the chain's DopplerHookInitializer addresses.
  --from-block <n>          Lower bound for log scan. Defaults to v4 start.
  --to-block <n>            Upper bound. Defaults to latest.
  --chunk-size <n>          Blocks per getLogs call. Defaults to 9000.
  --concurrency <n>         Concurrent getLogs calls. Defaults to 5.
  --apply-batch-size <n>    Upsert rows per transaction. Defaults to 500.
  --apply                   Write corrected rows. Without this, dry-run only.
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
  if (rows.length === 0) throw new Error(`Table ${tableName} not found${schema ? ` in schema ${schema}` : ""}`);
  if (rows.length > 1) throw new Error(`Multiple ${tableName} tables found; pass --schema explicitly.`);
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
  if (rows.length === 0) throw new Error(`Column ${columnName} not found in ${table.table_schema}.${table.table_name}`);
  return rows[0].data_type;
}

// address/pool_id can be stored as bytea or 0x-text depending on the Ponder build.
function hexColumnExpr(name, type) {
  return type === "bytea"
    ? `concat('0x', encode(${qi(name)}, 'hex'))`
    : `lower(${qi(name)}::text)`;
}

function loadDhookPoolIds({ databaseUrl, poolTable, addressType, chainId, onePool }) {
  const qualified = `${qi(poolTable.table_schema)}.${qi(poolTable.table_name)}`;
  const addrExpr = hexColumnExpr("address", addressType);
  const poolFilter = onePool ? `and ${addrExpr} = ${ql(onePool.toLowerCase())}` : "";
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${addrExpr} as address
       from ${qualified}
       where ${qi("chain_id")}::numeric = ${Number(chainId)}
         and lower(${qi("type")}::text) in ('dhook', 'rehype')
         ${poolFilter}
     ) q`,
  );
  return new Set(rows.map((r) => String(r.address).toLowerCase()));
}

// Current ledger totals + per-range values, keyed poolId -> Map(range -> liquidity).
function loadCurrentLedger({ databaseUrl, ledgerTable, poolIdType, chainId, poolIds }) {
  const qualified = `${qi(ledgerTable.table_schema)}.${qi(ledgerTable.table_name)}`;
  const idExpr = hexColumnExpr("pool_id", poolIdType);
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${idExpr} as pool_id, ${qi("tick_lower")} as tick_lower,
              ${qi("tick_upper")} as tick_upper, ${qi("liquidity")}::text as liquidity
       from ${qualified}
       where ${qi("chain_id")}::numeric = ${Number(chainId)}
     ) q`,
  );
  const byPool = new Map();
  for (const r of rows) {
    const id = String(r.pool_id).toLowerCase();
    if (!poolIds.has(id)) continue;
    if (!byPool.has(id)) byPool.set(id, new Map());
    byPool.get(id).set(`${Number(r.tick_lower)}|${Number(r.tick_upper)}`, BigInt(r.liquidity));
  }
  return byPool;
}

async function scanSender({ client, poolManager, sender, fromBlock, toBlock, chunkSize, concurrency, onChunk }) {
  const ranges = [];
  for (let cur = fromBlock; cur <= toBlock; cur += chunkSize) {
    const end = cur + chunkSize - 1n > toBlock ? toBlock : cur + chunkSize - 1n;
    ranges.push([cur, end]);
  }
  console.log(`  scanning sender=${sender}: blocks [${fromBlock}, ${toBlock}], ${ranges.length} chunks`);
  let logsFound = 0;
  for (let i = 0; i < ranges.length; i += concurrency) {
    const slice = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map(([from, to]) =>
        client.getLogs({ address: poolManager, event: MODIFY_LIQUIDITY_EVENT, args: { sender }, fromBlock: from, toBlock: to })
          .catch((err) => {
            console.warn(`    chunk [${from}, ${to}] failed: ${err.shortMessage ?? err.message}; retrying`);
            return client.getLogs({ address: poolManager, event: MODIFY_LIQUIDITY_EVENT, args: { sender }, fromBlock: from, toBlock: to });
          }),
      ),
    );
    for (const logs of results) { logsFound += logs.length; onChunk(logs); }
  }
  console.log(`  done sender=${sender}: ${logsFound} logs`);
}

function aggregate(map, log, knownPools) {
  const id = log.args.id.toLowerCase();
  if (!knownPools.has(id)) return;
  const key = `${id}|${Number(log.args.tickLower)}|${Number(log.args.tickUpper)}`;
  const prev = map.get(key);
  map.set(key, prev !== undefined ? prev + log.args.liquidityDelta : log.args.liquidityDelta);
}

function buildUpsertSql({ schema, table, poolIdType, chainId, batch }) {
  const qualified = `${qi(schema)}.${qi(table)}`;
  const poolIdExpr = poolIdType === "bytea" ? "decode(v.pool_hex, 'hex')" : "concat('0x', v.pool_hex)";
  const values = batch
    .map(({ poolId, tickLower, tickUpper, liquidity }) =>
      `(${ql(hexNoPrefix(poolId))}, ${tickLower}, ${tickUpper}, ${ql(liquidity.toString())}::numeric)`)
    .join(",\n");
  return `begin;
set local search_path = ${qi(schema)}, public;
-- Ponder installs an AFTER trigger that inserts into an unqualified
-- live_query_tables; provide a throwaway one so writes don't error when the real
-- live-query bookkeeping table is absent in this schema.
create temporary table if not exists live_query_tables (
  table_name text primary key
) on commit drop;
insert into ${qualified} (${qi("pool_id")}, ${qi("tick_lower")}, ${qi("tick_upper")}, ${qi("liquidity")}, ${qi("chain_id")})
select ${poolIdExpr}, v.tick_lower, v.tick_upper, v.liquidity, ${Number(chainId)}
from (values ${values}) as v(pool_hex, tick_lower, tick_upper, liquidity)
on conflict (${qi("pool_id")}, ${qi("tick_lower")}, ${qi("tick_upper")}, ${qi("chain_id")})
do update set ${qi("liquidity")} = excluded.${qi("liquidity")};
commit;
`;
}

function sumMap(m) {
  let s = 0n;
  for (const v of m.values()) s += v;
  return s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const chainCfg = CHAIN_DEFAULTS[args.chainId];
  if (!chainCfg) throw new Error(`No defaults for chain ${args.chainId}; pass --pool-manager and --senders.`);
  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");

  const rpcUrl = args.rpcUrl ?? chainCfg.rpcEnvVars.map((v) => process.env[v]).find(Boolean);
  if (!rpcUrl) throw new Error(`Missing --rpc-url or one of: ${chainCfg.rpcEnvVars.join(", ")}`);

  const poolManager = (args.poolManager ?? chainCfg.poolManager).toLowerCase();
  const senders = (args.senders ?? chainCfg.initializers).map((s) => s.toLowerCase());

  const ledgerTable = resolveTable(args.databaseUrl, args.schema, "position_ledger");
  const poolTable = resolveTable(args.databaseUrl, args.schema, "pool");
  const poolIdType = getColumnType(args.databaseUrl, ledgerTable, "pool_id");
  const poolAddressType = getColumnType(args.databaseUrl, poolTable, "address");

  const client = createPublicClient({ chain: chainCfg.chain, transport: http(rpcUrl, { batch: false }) });
  const fromBlock = args.fromBlock ?? chainCfg.fromBlock;
  const toBlock = args.toBlock ?? (await client.getBlockNumber());

  console.log(`Mode: ${args.apply ? "APPLY" : "dry-run"}`);
  console.log(`Chain: ${args.chainId}  PoolManager: ${poolManager}`);
  console.log(`Ledger: ${ledgerTable.table_schema}.${ledgerTable.table_name} (pool_id ${poolIdType})`);
  console.log(`Senders: ${senders.join(", ")}`);
  console.log(`Block range: [${fromBlock}, ${toBlock}]`);

  const knownPools = loadDhookPoolIds({
    databaseUrl: args.databaseUrl, poolTable, addressType: poolAddressType,
    chainId: args.chainId, onePool: args.pool,
  });
  if (knownPools.size === 0) throw new Error(args.pool ? `Pool ${args.pool} is not a dhook/rehype pool on chain ${args.chainId}` : "No dhook/rehype pools found");
  console.log(`Target dhook/rehype pools: ${knownPools.size}${args.pool ? ` (--pool ${args.pool})` : ""}`);

  // 1. Rebuild the correct absolute ledger from deduplicated on-chain logs.
  const rebuilt = new Map(); // "id|tl|tu" -> liquidity
  for (const sender of senders) {
    await scanSender({
      client, poolManager, sender, fromBlock, toBlock,
      chunkSize: args.chunkSize, concurrency: args.concurrency,
      onChunk: (logs) => { for (const log of logs) aggregate(rebuilt, log, knownPools); },
    });
  }
  // Fold rebuilt into per-pool maps (dropping zero-liquidity ranges).
  const rebuiltByPool = new Map();
  for (const [key, liq] of rebuilt) {
    if (liq === 0n) continue;
    const [id, tl, tu] = key.split("|");
    if (!rebuiltByPool.has(id)) rebuiltByPool.set(id, new Map());
    rebuiltByPool.get(id).set(`${Number(tl)}|${Number(tu)}`, liq);
  }

  // 2. Load current ledger and diff.
  const currentByPool = loadCurrentLedger({
    databaseUrl: args.databaseUrl, ledgerTable, poolIdType, chainId: args.chainId, poolIds: knownPools,
  });

  const affected = []; // { poolId, rows, oldTotal, newTotal }
  for (const poolId of knownPools) {
    const cur = currentByPool.get(poolId) ?? new Map();
    const next = rebuiltByPool.get(poolId) ?? new Map();
    // Compare every range that appears in either side.
    let differs = false;
    const rangeKeys = new Set([...cur.keys(), ...next.keys()]);
    for (const rk of rangeKeys) {
      if ((cur.get(rk) ?? 0n) !== (next.get(rk) ?? 0n)) { differs = true; break; }
    }
    if (!differs) continue;
    const rows = [...next.entries()].map(([rk, liquidity]) => {
      const [tl, tu] = rk.split("|");
      return { poolId, tickLower: Number(tl), tickUpper: Number(tu), liquidity };
    });
    affected.push({ poolId, rows, oldTotal: sumMap(cur), newTotal: sumMap(next) });
  }

  if (affected.length === 0) {
    console.log("\nNo over-counted pools found — every target pool's ledger already matches the on-chain rebuild.");
    return;
  }

  console.log(`\n${affected.length} pool(s) need repair (current ledger != on-chain rebuild):`);
  console.log("  poolId".padEnd(68) + "old_total_liq".padStart(26) + "new_total_liq".padStart(26) + "  ratio");
  for (const a of affected.sort((x, y) => (x.newTotal === 0n ? 0 : Number(y.oldTotal - x.oldTotal)))) {
    const ratio = a.newTotal === 0n ? "n/a" : (Number(a.oldTotal) / Number(a.newTotal)).toFixed(3);
    console.log(`  ${a.poolId}` + a.oldTotal.toString().padStart(26) + a.newTotal.toString().padStart(26) + `  ${ratio}x`);
  }
  console.log("\n(ratio ~2.000 == classic seed double-count; the corrected value is new_total_liq.)");

  if (!args.apply) {
    console.log("\nDry run only. Re-run with --apply to write corrected ledger rows.");
    return;
  }

  const writeRows = affected.flatMap((a) => a.rows);
  let applied = 0;
  for (let i = 0; i < writeRows.length; i += args.applyBatchSize) {
    const batch = writeRows.slice(i, i + args.applyBatchSize);
    psqlExec(args.databaseUrl, buildUpsertSql({
      schema: ledgerTable.table_schema, table: ledgerTable.table_name,
      poolIdType, chainId: args.chainId, batch,
    }));
    applied += batch.length;
    console.log(`Applied ${applied}/${writeRows.length} corrected ledger rows`);
  }

  console.log(`\nDone. Corrected ${affected.length} pool(s), ${applied} ledger rows.`);
  console.log("reserves0/1 and dollarLiquidity recompute from the ledger on each pool's next swap");
  console.log("(processDHookSwap overwrites them), so actively-traded pools self-heal within seconds.");
  console.log("For pools that won't trade soon, refresh reserves/liquidity directly. An over-counted");
  console.log("pool's reserves are neither negative nor zero, so target it with --pool (or the whole");
  console.log("dhook/rehype fleet with --all):");
  // Pass --pool through when a single pool was repaired; otherwise point at --all.
  const scope = args.pool ? `--pool ${args.pool}` : "--all";
  console.log(`  node scripts/backfill-negative-reserves.mjs --schema ${ledgerTable.table_schema} --types dhook,rehype ${scope} --apply`);
  console.log(`  node scripts/recompute-dhook-dollar-liquidity.mjs --schema ${ledgerTable.table_schema} --chain-id ${args.chainId} --eth-price-usd <chainlink_8dp> ${scope} --apply`);
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exitCode = 1;
});
