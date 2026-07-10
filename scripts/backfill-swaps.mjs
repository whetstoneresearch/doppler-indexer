#!/usr/bin/env node

/**
 * Backfills the swap table from historical logs for the two swap paths that
 * went through SwapOrchestrator.performSwapUpdates, which did not write swap
 * rows before feat/rehype-swaps (PR #78):
 *
 *   1. dhook/rehype bonding pools — DopplerHookInitializer re-emits a
 *      Swap(sender, poolKey, poolId, params, amount0, amount1, hookData)
 *      event for every swap on its pools.
 *   2. migrated v4 pools — canonical PoolManager.Swap events for pool ids in
 *      v4_pools with migrated_from_pool set (swap rows attach to the parent
 *      bonding pool address, mirroring the PoolManager:Swap handler).
 *
 * Row construction mirrors the indexer handlers exactly (amountIn/amountOut
 * signs, buy/sell classification, quote-side USD volume priced from the
 * eth_price / monad_usdc_price tables at the swap's 5-minute bucket).
 * Inserts use ON CONFLICT (tx_hash, chain_id) DO NOTHING, so the script is
 * idempotent and safe to run after the fixed indexer has been deployed.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";
import { base, mainnet } from "viem/chains";

const robinhood = {
  id: 4663,
  name: "robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [] } },
};

const monad = {
  id: 143,
  name: "monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [] } },
};

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
    ethPriceChainId: 8453,
    stables: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // usdc
      "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", // usdt
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
    ethPriceChainId: 1,
    stables: [
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // usdc
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // usdt
    ],
  },
  143: {
    chain: monad,
    rpcEnvVars: ["PONDER_RPC_URL_143", "MONAD_RPC"],
    poolManager: "0x188d586ddcf52439676ca21a244753fa19f9ea8e",
    fromBlock: 34746371n,
    initializers: [
      "0xaa096f558f3d4c9226de77e7cc05f18e180b2544",
      "0x56ea13da5f39863d3b3d54826187306af7ada544",
    ],
    ethPriceChainId: 143,
    stables: [
      "0x754704bc059f8c67012fed69bc8a327a5aafb603", // usdc
      "0xe7cd86e13ac4309349f30b3435a9d337750fc82d", // usdt
    ],
    monAddress: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
  },
  4663: {
    chain: robinhood,
    rpcEnvVars: ["PONDER_RPC_URL_4663", "ROBINHOOD_RPC"],
    poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    fromBlock: 367349n,
    initializers: ["0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544"],
    // Robinhood has no local ETH oracle; the indexer sources ETH price from base.
    ethPriceChainId: 8453,
    stables: [],
  },
};

// DopplerHookInitializer.Swap — poolKey is an indexed tuple, so viem returns
// its topic hash; only poolId and the amounts are consumed.
const DHOOK_SWAP_EVENT = {
  type: "event",
  name: "Swap",
  inputs: [
    { name: "sender", type: "address", indexed: true },
    {
      name: "poolKey", type: "tuple", indexed: true,
      components: [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" },
      ],
    },
    { name: "poolId", type: "bytes32", indexed: true },
    {
      name: "params", type: "tuple",
      components: [
        { name: "zeroForOne", type: "bool" },
        { name: "amountSpecified", type: "int256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    },
    { name: "amount0", type: "int128" },
    { name: "amount1", type: "int128" },
    { name: "hookData", type: "bytes" },
  ],
};

const PM_SWAP_EVENT = {
  type: "event",
  name: "Swap",
  inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "amount0", type: "int128" },
    { name: "amount1", type: "int128" },
    { name: "sqrtPriceX96", type: "uint160" },
    { name: "liquidity", type: "uint128" },
    { name: "tick", type: "int24" },
    { name: "fee", type: "uint24" },
  ],
};

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
    sources: ["dhook", "migrated"],
    chunkSize: 9000n,
    concurrency: 5,
    fromBlock: undefined,
    toBlock: undefined,
    schema: undefined,
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
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
      else if (key === "sources") args.sources = value.split(",").map((s) => s.trim());
      else if (key === "chunk-size") args.chunkSize = BigInt(value);
      else if (key === "concurrency") args.concurrency = Number(value);
      else if (key === "from-block") args.fromBlock = BigInt(value);
      else if (key === "to-block") args.toBlock = BigInt(value);
      else if (key === "schema") args.schema = value;
      else if (key === "rpc-url") args.rpcUrl = value;
      else if (key === "database-url") args.databaseUrl = value;
      else if (key === "apply-batch-size") args.applyBatchSize = Number(value);
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  for (const s of args.sources) {
    if (s !== "dhook" && s !== "migrated") throw new Error(`Unknown source ${s}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-swaps.mjs [options]

Backfills swap rows missed while performSwapUpdates did not write them
(fixed on feat/rehype-swaps). Covers dhook/rehype bonding swaps
(DopplerHookInitializer.Swap) and migrated v4 pool swaps (PoolManager.Swap).
Does not cover v2/v3/v4-dynamic-auction pools.

Options:
  --database-url <url>      Postgres URL. Defaults to DATABASE_URL.
  --schema <schema>         Ponder schema containing swap/pool/v4_pools.
  --rpc-url <url>           RPC URL. Defaults to PONDER_RPC_URL_<chainId>.
  --chain-id <id>           Chain ID. Defaults to 4663 (robinhood).
  --sources <list>          Comma of dhook,migrated. Defaults to both.
  --from-block <n>          Lower bound for log scan. Defaults to v4 start.
  --to-block <n>            Upper bound. Defaults to latest.
  --chunk-size <n>          Blocks per getLogs call. Defaults to 9000.
  --concurrency <n>         Concurrent RPC calls. Defaults to 5.
  --apply-batch-size <n>    Insert rows per transaction. Defaults to 500.
  --verbose                 Print per-pool swap counts.
  --apply                   Write to swap table. Without this, dry-run only.

Examples:
  node scripts/backfill-swaps.mjs --chain-id 4663 --schema public
  node scripts/backfill-swaps.mjs --chain-id 4663 --schema public --apply
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

function hexSelectExpr(columnName, dataType) {
  return dataType === "bytea"
    ? `concat('0x', encode(${qi(columnName)}, 'hex'))`
    : `lower(${qi(columnName)}::text)`;
}

function isPrecompileAddress(address) {
  const value = BigInt(address);
  return value >= 1n && value <= 0x11n;
}

// Mirrors src/utils/getQuoteInfo.ts + oracle.ts for the quote flavors dhook
// and migrated pools actually use. Returns null when the quote can't be
// priced; the row is still inserted with swapValueUsd = 0, matching the
// indexer's `quotePrice ?? 0n` behavior.
function classifyQuote({ quoteToken, isQuoteEth, chainCfg }) {
  if (isQuoteEth) {
    return { kind: "eth", quoteDecimals: 18, priceDecimals: 8 };
  }
  const quote = quoteToken.toLowerCase();
  if (chainCfg.stables.includes(quote)) {
    return { kind: "stable", quoteDecimals: 6, priceDecimals: 8 };
  }
  if (chainCfg.monAddress && quote === chainCfg.monAddress) {
    return { kind: "mon", quoteDecimals: 18, priceDecimals: 18 };
  }
  return null;
}

// Greatest bucket <= rounded timestamp; the indexer's fetch walks back
// 5-minute buckets, which resolves to the same value.
function lookupBucketPrice(sortedBuckets, timestamp) {
  const target = BigInt(Math.floor(Number(timestamp) / 300) * 300);
  let lo = 0;
  let hi = sortedBuckets.length - 1;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedBuckets[mid].timestamp <= target) {
      best = sortedBuckets[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best?.price ?? null;
}

// MarketDataService.calculateVolume with isQuoteUSD = false.
function calculateVolumeUsd({ quoteDelta, price, quoteDecimals, priceDecimals }) {
  if (quoteDelta === 0n) return 0n;
  const scaleFactor = 10n ** BigInt(18 - priceDecimals);
  return (quoteDelta * price * scaleFactor) / 10n ** BigInt(quoteDecimals);
}

async function scanChunks({ label, ranges, concurrency, fetchRange, onLogs }) {
  let processed = 0;
  let logsFound = 0;
  for (let i = 0; i < ranges.length; i += concurrency) {
    const slice = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      slice.map(([from, to]) =>
        fetchRange(from, to).catch((err) => {
          console.warn(`    chunk [${from}, ${to}] failed: ${err.shortMessage ?? err.message}; retrying single`);
          return fetchRange(from, to);
        }),
      ),
    );
    for (const logs of results) {
      logsFound += logs.length;
      onLogs(logs);
    }
    processed += slice.length;
    if (processed % 100 === 0 || processed === ranges.length) {
      console.log(`    ${label}: ${processed}/${ranges.length} chunks, ${logsFound} logs so far`);
    }
  }
  return logsFound;
}

function blockRanges(fromBlock, toBlock, chunkSize) {
  const ranges = [];
  for (let cur = fromBlock; cur <= toBlock; cur += chunkSize) {
    const end = cur + chunkSize - 1n > toBlock ? toBlock : cur + chunkSize - 1n;
    ranges.push([cur, end]);
  }
  return ranges;
}

async function mapConcurrent(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

function buildInsertSql({ table, hexType, chainId, batch }) {
  const qualified = `${qi(table.table_schema)}.${qi(table.table_name)}`;
  const hexExpr = (name) =>
    hexType === "bytea" ? `decode(v.${name}, 'hex')` : `concat('0x', v.${name})`;
  const values = batch
    .map((r) =>
      `(${ql(hexNoPrefix(r.txHash))}, ${ql(hexNoPrefix(r.pool))}, ${ql(hexNoPrefix(r.asset))}, ` +
      `${ql(hexNoPrefix(r.user))}, ${ql(r.type)}, ${r.amountIn.toString()}::numeric, ` +
      `${r.amountOut.toString()}::numeric, ${r.timestamp.toString()}::numeric, ${r.swapValueUsd.toString()}::numeric)`,
    )
    .join(",\n");
  return `begin;
set local search_path = ${qi(table.table_schema)}, public;
-- Ponder installs an AFTER trigger that inserts into an unqualified
-- live_query_tables; provide a throwaway one so writes don't error when the
-- real live-query bookkeeping table is absent in this schema.
create temporary table if not exists live_query_tables (
  table_name text primary key
) on commit drop;
insert into ${qualified} (${qi("tx_hash")}, ${qi("pool")}, ${qi("asset")}, ${qi("user")}, ${qi("type")}, ${qi("amount_in")}, ${qi("amount_out")}, ${qi("timestamp")}, ${qi("swap_value_usd")}, ${qi("chain_id")})
select ${hexExpr("tx_hash")}, ${hexExpr("pool")}, ${hexExpr("asset")}, ${hexExpr("usr")}, v.type, v.amount_in, v.amount_out, v.ts, v.swap_value_usd, ${Number(chainId)}
from (values ${values}) as v(tx_hash, pool, asset, usr, type, amount_in, amount_out, ts, swap_value_usd)
on conflict (${qi("tx_hash")}, ${qi("chain_id")}) do nothing;
commit;
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  const chainCfg = CHAIN_DEFAULTS[args.chainId];
  if (!chainCfg) throw new Error(`No defaults for chain ${args.chainId}`);
  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");

  const rpcUrl = args.rpcUrl ??
    chainCfg.rpcEnvVars.map((v) => process.env[v]).find(Boolean);
  if (!rpcUrl) throw new Error(`Missing --rpc-url or one of: ${chainCfg.rpcEnvVars.join(", ")}`);

  const swapTable = resolveTable(args.databaseUrl, args.schema, "swap");
  const poolTable = resolveTable(args.databaseUrl, args.schema, "pool");
  const v4PoolsTable = resolveTable(args.databaseUrl, args.schema, "v4_pools");
  const ethPriceTable = resolveTable(args.databaseUrl, args.schema, "eth_price");
  const hexType = getColumnType(args.databaseUrl, swapTable, "tx_hash");
  const poolAddrType = getColumnType(args.databaseUrl, poolTable, "address");
  const v4PoolIdType = getColumnType(args.databaseUrl, v4PoolsTable, "pool_id");

  const client = createPublicClient({
    chain: chainCfg.chain,
    transport: http(rpcUrl, { batch: false }),
  });

  const fromBlock = args.fromBlock ?? chainCfg.fromBlock;
  const toBlock = args.toBlock ?? (await client.getBlockNumber());

  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
  console.log(`Chain: ${args.chainId}`);
  console.log(`Sources: ${args.sources.join(", ")}`);
  console.log(`Block range: [${fromBlock}, ${toBlock}]`);
  console.log(`Swap table: ${swapTable.table_schema}.${swapTable.table_name} (hex type=${hexType})`);

  console.log("\nLoading dhook/rehype pools...");
  const poolAddrExpr = hexSelectExpr("address", poolAddrType);
  const dhookPools = psqlJson(
    args.databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${poolAddrExpr} as address,
              ${hexSelectExpr("base_token", poolAddrType)} as base_token,
              ${hexSelectExpr("quote_token", poolAddrType)} as quote_token,
              ${qi("is_token0")} as is_token0, ${qi("is_quote_eth")} as is_quote_eth
       from ${qi(poolTable.table_schema)}.${qi(poolTable.table_name)}
       where ${qi("chain_id")}::numeric = ${args.chainId}
         and ${qi("type")} in ('dhook', 'rehype')
     ) q`,
  );
  const dhookPoolMap = new Map(dhookPools.map((p) => [p.address.toLowerCase(), p]));
  console.log(`  ${dhookPoolMap.size} dhook/rehype pools`);

  console.log("Loading migrated v4 pools...");
  const migratedPools = psqlJson(
    args.databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${hexSelectExpr("pool_id", v4PoolIdType)} as pool_id,
              ${hexSelectExpr("migrated_from_pool", v4PoolIdType)} as migrated_from_pool,
              ${hexSelectExpr("asset", v4PoolIdType)} as asset,
              ${hexSelectExpr("base_token", v4PoolIdType)} as base_token,
              ${hexSelectExpr("quote_token", v4PoolIdType)} as quote_token,
              ${qi("is_token0")} as is_token0, ${qi("is_quote_eth")} as is_quote_eth
       from ${qi(v4PoolsTable.table_schema)}.${qi(v4PoolsTable.table_name)}
       where ${qi("chain_id")}::numeric = ${args.chainId}
         and ${qi("migrated_from_pool")} is not null
     ) q`,
  );
  const migratedPoolMap = new Map(migratedPools.map((p) => [p.pool_id.toLowerCase(), p]));
  console.log(`  ${migratedPoolMap.size} migrated v4 pools`);

  console.log("Loading price buckets...");
  const ethBuckets = psqlJson(
    args.databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${qi("timestamp")}::text as ts, ${qi("price")}::text as price
       from ${qi(ethPriceTable.table_schema)}.${qi(ethPriceTable.table_name)}
       where ${qi("chain_id")}::numeric = ${chainCfg.ethPriceChainId}
       order by ${qi("timestamp")}
     ) q`,
  ).map((r) => ({ timestamp: BigInt(r.ts), price: BigInt(r.price) }));
  console.log(`  ${ethBuckets.length} eth_price buckets (chain ${chainCfg.ethPriceChainId})`);

  let monBuckets = [];
  if (chainCfg.monAddress) {
    const monTable = resolveTable(args.databaseUrl, args.schema, "monad_usdc_price");
    monBuckets = psqlJson(
      args.databaseUrl,
      `select coalesce(json_agg(q), '[]'::json) from (
         select ${qi("timestamp")}::text as ts, ${qi("price")}::text as price
         from ${qi(monTable.table_schema)}.${qi(monTable.table_name)}
         where ${qi("chain_id")}::numeric = ${args.chainId}
         order by ${qi("timestamp")}
       ) q`,
    ).map((r) => ({ timestamp: BigInt(r.ts), price: BigInt(r.price) }));
    console.log(`  ${monBuckets.length} monad_usdc_price buckets`);
  }

  const ranges = blockRanges(fromBlock, toBlock, args.chunkSize);
  const collected = []; // { txHash, blockNumber, logIndex, pool, asset, quote, isToken0, isQuoteEth, amount0, amount1, source }
  let unknownPoolLogs = 0;

  if (args.sources.includes("dhook") && dhookPoolMap.size > 0) {
    for (const initializer of chainCfg.initializers) {
      console.log(`\nScanning DopplerHookInitializer.Swap on ${initializer}...`);
      await scanChunks({
        label: initializer,
        ranges,
        concurrency: args.concurrency,
        fetchRange: (from, to) =>
          client.getLogs({ address: initializer, event: DHOOK_SWAP_EVENT, fromBlock: from, toBlock: to }),
        onLogs: (logs) => {
          for (const log of logs) {
            const poolId = String(log.args.poolId).toLowerCase();
            const pool = dhookPoolMap.get(poolId);
            if (!pool) { unknownPoolLogs++; continue; }
            collected.push({
              txHash: log.transactionHash.toLowerCase(),
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              pool: poolId,
              asset: pool.base_token,
              quote: pool.quote_token,
              isToken0: pool.is_token0,
              isQuoteEth: pool.is_quote_eth,
              amount0: log.args.amount0,
              amount1: log.args.amount1,
              source: "dhook",
            });
          }
        },
      });
    }
  }

  if (args.sources.includes("migrated") && migratedPoolMap.size > 0) {
    const poolIds = [...migratedPoolMap.keys()];
    const ID_BATCH = 100;
    for (let b = 0; b < poolIds.length; b += ID_BATCH) {
      const idBatch = poolIds.slice(b, b + ID_BATCH);
      console.log(`\nScanning PoolManager.Swap for migrated pools ${b + 1}-${b + idBatch.length}/${poolIds.length}...`);
      await scanChunks({
        label: `ids ${b + 1}-${b + idBatch.length}`,
        ranges,
        concurrency: args.concurrency,
        fetchRange: (from, to) =>
          client.getLogs({
            address: chainCfg.poolManager,
            event: PM_SWAP_EVENT,
            args: { id: idBatch },
            fromBlock: from,
            toBlock: to,
          }),
        onLogs: (logs) => {
          for (const log of logs) {
            const poolId = String(log.args.id).toLowerCase();
            const pool = migratedPoolMap.get(poolId);
            if (!pool) { unknownPoolLogs++; continue; }
            const asset = pool.asset ?? pool.base_token;
            if (!asset) { unknownPoolLogs++; continue; }
            collected.push({
              txHash: log.transactionHash.toLowerCase(),
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              pool: pool.migrated_from_pool, // swap rows attach to the parent pool
              asset,
              quote: pool.quote_token,
              isToken0: pool.is_token0,
              isQuoteEth: pool.is_quote_eth,
              amount0: log.args.amount0,
              amount1: log.args.amount1,
              source: "migrated",
            });
          }
        },
      });
    }
  }

  console.log(`\nCollected ${collected.length} swap logs (${unknownPoolLogs} skipped for unknown pools/assets).`);

  // The indexer processes events in order and insertSwapIfNotExists keeps the
  // first per (txHash, chainId); replicate by keeping the earliest log per tx.
  collected.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : (a.blockNumber < b.blockNumber ? -1 : 1),
  );
  const byTx = new Map();
  for (const item of collected) {
    if (!byTx.has(item.txHash)) byTx.set(item.txHash, item);
  }
  const swapsPerTx = [...byTx.values()];
  console.log(`Deduped to ${swapsPerTx.length} unique transactions.`);

  let precompileSkips = 0;
  const kept = swapsPerTx.filter((s) => {
    if (isPrecompileAddress(s.asset) || isPrecompileAddress(s.quote)) {
      precompileSkips++;
      return false;
    }
    return true;
  });
  if (precompileSkips > 0) console.log(`Skipped ${precompileSkips} swaps on precompile-token pools.`);

  console.log("Fetching block timestamps...");
  const blockNumbers = [...new Set(kept.map((s) => s.blockNumber))];
  const blockTimestamps = new Map();
  await mapConcurrent(blockNumbers, args.concurrency * 2, async (bn) => {
    const block = await client.getBlock({ blockNumber: bn });
    blockTimestamps.set(bn, block.timestamp);
  });
  console.log(`  ${blockTimestamps.size} blocks`);

  console.log("Fetching transaction senders...");
  const txFroms = new Map();
  await mapConcurrent(kept, args.concurrency * 2, async (s) => {
    const tx = await client.getTransaction({ hash: s.txHash });
    txFroms.set(s.txHash, tx.from.toLowerCase());
  });
  console.log(`  ${txFroms.size} transactions`);

  let unpricedQuotes = 0;
  let missingBuckets = 0;
  const rows = kept.map((s) => {
    const { amount0, amount1, isToken0 } = s;
    // Mirrors the DopplerHookInitializer:Swap / PoolManager:Swap handlers.
    const amountIn = amount0 > 0n ? amount0 : amount1;
    const amountOut = amount0 < 0n ? -amount0 : -amount1;
    let type;
    if (s.source === "dhook") {
      const isCoinBuy = isToken0 ? amount0 < 0n : amount1 < 0n;
      type = isCoinBuy ? "buy" : "sell";
    } else {
      // SwapService.determineSwapType keys on amount0 only.
      if (isToken0 && amount0 < 0n) type = "buy";
      else if (isToken0 && amount0 > 0n) type = "sell";
      else if (!isToken0 && amount0 < 0n) type = "sell";
      else if (!isToken0 && amount0 > 0n) type = "buy";
      else type = "buy";
    }
    const rawQuoteDelta = isToken0 ? amount1 : amount0;
    const quoteDelta = rawQuoteDelta < 0n ? -rawQuoteDelta : rawQuoteDelta;
    const timestamp = blockTimestamps.get(s.blockNumber);

    let swapValueUsd = 0n;
    const quoteClass = classifyQuote({ quoteToken: s.quote, isQuoteEth: s.isQuoteEth, chainCfg });
    if (!quoteClass) {
      unpricedQuotes++;
    } else {
      let price = null;
      if (quoteClass.kind === "eth") price = lookupBucketPrice(ethBuckets, timestamp);
      else if (quoteClass.kind === "stable") price = 100000000n;
      else if (quoteClass.kind === "mon") price = lookupBucketPrice(monBuckets, timestamp);
      if (price === null) {
        missingBuckets++;
      } else {
        swapValueUsd = calculateVolumeUsd({
          quoteDelta,
          price,
          quoteDecimals: quoteClass.quoteDecimals,
          priceDecimals: quoteClass.priceDecimals,
        });
      }
    }

    return {
      txHash: s.txHash,
      pool: s.pool,
      asset: s.asset,
      user: txFroms.get(s.txHash),
      type,
      amountIn,
      amountOut,
      timestamp,
      swapValueUsd,
    };
  });

  console.log(`\nPrepared ${rows.length} swap rows.`);
  if (unpricedQuotes > 0) console.log(`  ${unpricedQuotes} rows have swapValueUsd=0 (unpriceable quote token).`);
  if (missingBuckets > 0) console.log(`  ${missingBuckets} rows have swapValueUsd=0 (no price bucket at/before swap time).`);

  if (args.verbose) {
    const perPool = new Map();
    for (const r of rows) perPool.set(r.pool, (perPool.get(r.pool) ?? 0) + 1);
    for (const [pool, n] of [...perPool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${pool}: ${n} swaps`);
    }
  }

  if (args.apply && rows.length > 0) {
    let applied = 0;
    for (let i = 0; i < rows.length; i += args.applyBatchSize) {
      const batch = rows.slice(i, i + args.applyBatchSize);
      psqlExec(args.databaseUrl, buildInsertSql({
        table: swapTable,
        hexType,
        chainId: args.chainId,
        batch,
      }));
      applied += batch.length;
      if (i % (args.applyBatchSize * 10) === 0 || applied === rows.length) {
        console.log(`Applied ${applied}/${rows.length}`);
      }
    }
    console.log(`Done. Inserted up to ${applied} swap rows (existing (tx_hash, chain_id) rows untouched).`);
  } else if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write.");
  }
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exitCode = 1;
});
