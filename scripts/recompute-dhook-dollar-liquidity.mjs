#!/usr/bin/env node

/**
 * Recomputes pool.dollarLiquidity for DHook/rehype pools from their reserves.
 *
 * Why this exists: backfill-position-ledger.mjs repopulates position_ledger and
 * backfill-negative-reserves.mjs recomputes reserves0/reserves1 from it, but
 * neither writes dollarLiquidity — the value surfaced as "liquidity". Run this
 * last so already-created pools (whose reserves were zero) show correct
 * liquidity without waiting for their next swap to trigger a recompute.
 *
 * It mirrors MarketDataService.calculateLiquidity exactly and reuses the pool's
 * stored `price` (already correct — market cap depends on it), so no on-chain
 * price math is duplicated. Only the numeraire USD price is supplied externally.
 *
 * Usage (robinhood): pass current ETH/USD in Chainlink 8-decimal form.
 *   node scripts/recompute-dhook-dollar-liquidity.mjs \
 *     --schema public --chain-id 4663 --eth-price-usd 300000000000 [--all] [--apply]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const WAD = 10n ** 18n;

// Recognised numeraires per chain: address (lowercase) -> { kind, quoteDecimals, quotePriceUSD? }.
// quotePriceUSD omitted means "supplied via --eth-price-usd" (ETH/WETH); a fixed
// value pegs a stablecoin (Chainlink 8-decimal form, so 100000000n = $1.00).
// Mirrors src/config/chains/*.ts and getQuoteInfo's classification. Only pools
// quoted in a listed numeraire are recomputed; others are skipped as
// "unrecognised numeraire" (they self-heal on their next swap via the indexer).
// This offline script intentionally covers only statically-priceable numeraires
// (WETH + USD stables); dynamically-priced quotes (Zora, creator coins, etc.)
// are left to the live indexer's getQuoteInfo.
const NUMERAIRES = {
  4663: {
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73": { kind: "eth", quoteDecimals: 18 },
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { kind: "usd", quoteDecimals: 6, quotePriceUSD: 100000000n },
  },
  8453: {
    // WETH (priced via --eth-price-usd) and USDC ($1). Other Base numeraires
    // (USDT/EURC/Zora/creator coins) are skipped and self-heal on next swap.
    "0x4200000000000000000000000000000000000006": { kind: "eth", quoteDecimals: 18 },
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { kind: "usd", quoteDecimals: 6, quotePriceUSD: 100000000n },
  },
};

const QUOTE_PRICE_DECIMALS = 8; // Chainlink feed decimals
const ASSET_DECIMALS = 18;

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDotEnv(resolve(process.cwd(), ".env"));
loadDotEnv(resolve(process.cwd(), ".env.local"));

function parseArgs(argv) {
  const args = {
    apply: false,
    all: false,
    chainId: 4663,
    schema: undefined,
    databaseUrl: process.env.DATABASE_URL,
    ethPriceUsd: undefined,
    batchSize: 500,
    pool: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--all") args.all = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${a}`);
      if (key === "chain-id") args.chainId = Number(value);
      else if (key === "schema") args.schema = value;
      else if (key === "database-url") args.databaseUrl = value;
      else if (key === "eth-price-usd") args.ethPriceUsd = BigInt(value);
      else if (key === "batch-size") args.batchSize = Number(value);
      else if (key === "pool") args.pool = value.toLowerCase();
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/recompute-dhook-dollar-liquidity.mjs [options]

Recomputes dollarLiquidity for dhook/rehype pools from reserves + stored price.
Run after backfill-position-ledger.mjs and backfill-negative-reserves.mjs.

Options:
  --database-url <url>   Postgres URL. Defaults to DATABASE_URL.
  --schema <schema>      Ponder schema containing the pool table.
  --chain-id <id>        Chain ID. Defaults to 4663 (robinhood).
  --eth-price-usd <n>    ETH/USD in Chainlink 8-decimal form (e.g. 300000000000
                         for $3000). Required if any pool is WETH-quoted.
  --all                  Recompute every dhook/rehype pool, not just those with
                         dollarLiquidity = 0.
  --pool <poolId>        Recompute only this pool, regardless of its current
                         dollarLiquidity (use to refresh a single repaired pool).
  --batch-size <n>       Rows per update transaction. Defaults to 500.
  --apply                Write updates. Without this flag, dry-run only.
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
    input: sql, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"],
  });
}
function qi(id) { return `"${String(id).replaceAll('"', '""')}"`; }
function ql(v) { return `'${String(v).replaceAll("'", "''")}'`; }

function resolveTable(databaseUrl, schema, tableName) {
  const filter = schema ? `and table_schema = ${ql(schema)}`
    : "and table_schema not in ('pg_catalog', 'information_schema')";
  const rows = psqlJson(databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select table_schema, table_name from information_schema.tables
       where table_name = ${ql(tableName)} ${filter} order by table_schema limit 2
     ) q`);
  if (rows.length === 0) throw new Error(`Table ${tableName} not found${schema ? ` in schema ${schema}` : ""}`);
  if (rows.length > 1) throw new Error(`Multiple ${tableName} tables found; pass --schema.`);
  return rows[0];
}

function columnNames(databaseUrl, table) {
  const rows = psqlJson(databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select column_name from information_schema.columns
       where table_schema = ${ql(table.table_schema)} and table_name = ${ql(table.table_name)}
     ) q`);
  return rows.map((r) => r.column_name);
}
function pick(names, candidates) {
  for (const c of candidates) if (names.includes(c)) return c;
  throw new Error(`None of [${candidates.join(", ")}] present. Have: ${names.join(", ")}`);
}

// Mirror of MarketDataService.calculateLiquidity (non-USD quote branch).
function calculateLiquidity({ assetBalance, quoteBalance, price, quotePriceUSD, quoteDecimals }) {
  const assetValueInQuote = (assetBalance * price) / WAD;
  const priceFactor = 10n ** BigInt(18 - QUOTE_PRICE_DECIMALS);
  const quoteDecimalFactor = 10n ** BigInt(18 - quoteDecimals);
  const assetDecimalFactor = 10n ** BigInt(18 - ASSET_DECIMALS);
  const assetValueUsd = (assetValueInQuote * quotePriceUSD * priceFactor * assetDecimalFactor) / WAD;
  const quoteValueUsd = (quoteBalance * quotePriceUSD * priceFactor * quoteDecimalFactor) / WAD;
  return assetValueUsd + quoteValueUsd;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");

  const numeraires = NUMERAIRES[args.chainId];
  if (!numeraires) throw new Error(`No numeraire config for chain ${args.chainId}`);

  const table = resolveTable(args.databaseUrl, args.schema, "pool");
  const names = columnNames(args.databaseUrl, table);
  const col = {
    address: pick(names, ["address"]),
    chainId: pick(names, ["chain_id", "chainId"]),
    type: pick(names, ["type"]),
    reserves0: pick(names, ["reserves0", "reserves_0"]),
    reserves1: pick(names, ["reserves1", "reserves_1"]),
    price: pick(names, ["price"]),
    isToken0: pick(names, ["is_token0", "isToken0"]),
    quoteToken: pick(names, ["quote_token", "quoteToken"]),
    dollarLiquidity: pick(names, ["dollar_liquidity", "dollarLiquidity"]),
  };
  const qualified = `${qi(table.table_schema)}.${qi(table.table_name)}`;
  const addrExpr = (c) => `lower(${qi(c)}::text)`;

  const where = [
    `${qi(col.chainId)}::numeric = ${Number(args.chainId)}`,
    `${qi(col.type)} in ('dhook', 'rehype')`,
  ];
  // --pool targets one pool regardless of its current dollarLiquidity (an
  // over-counted pool is nonzero, so the default `= 0` filter would skip it).
  if (args.pool) where.push(`${addrExpr(col.address)} = ${ql(args.pool)}`);
  else if (!args.all) where.push(`${qi(col.dollarLiquidity)}::numeric = 0`);

  const rows = psqlJson(args.databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select ${addrExpr(col.address)} as address,
              ${qi(col.reserves0)}::text as reserves0,
              ${qi(col.reserves1)}::text as reserves1,
              ${qi(col.price)}::text as price,
              ${qi(col.isToken0)} as is_token0,
              ${addrExpr(col.quoteToken)} as quote_token,
              ${qi(col.dollarLiquidity)}::text as dollar_liquidity
       from ${qualified}
       where ${where.join(" and ")}
     ) q`);

  console.log(`Mode: ${args.apply ? "apply" : "dry-run"} | chain ${args.chainId} | ${rows.length} candidate pool(s)`);

  const updates = [];
  let skipped = 0;
  for (const r of rows) {
    const num = numeraires[r.quote_token];
    if (!num) { skipped++; continue; }
    if (num.kind === "eth" && args.ethPriceUsd === undefined) {
      throw new Error(`Pool ${r.address} is WETH-quoted; pass --eth-price-usd`);
    }
    const quotePriceUSD = num.quotePriceUSD ?? args.ethPriceUsd;
    const reserves0 = BigInt(r.reserves0);
    const reserves1 = BigInt(r.reserves1);
    const isToken0 = r.is_token0 === true || r.is_token0 === "t" || r.is_token0 === "true";
    const dollarLiquidity = calculateLiquidity({
      assetBalance: isToken0 ? reserves0 : reserves1,
      quoteBalance: isToken0 ? reserves1 : reserves0,
      price: BigInt(r.price),
      quotePriceUSD,
      quoteDecimals: num.quoteDecimals,
    });
    if (dollarLiquidity.toString() === r.dollar_liquidity) continue;
    updates.push({ address: r.address, dollarLiquidity, old: r.dollar_liquidity });
  }

  console.log(`Computed ${updates.length} update(s); ${skipped} skipped (unrecognised numeraire).`);
  for (const u of updates.slice(0, 20)) {
    console.log(`  ${u.address}: ${u.old} -> ${u.dollarLiquidity}`);
  }
  if (updates.length > 20) console.log(`  ... and ${updates.length - 20} more`);

  if (!args.apply) { console.log("Dry run only. Re-run with --apply to write."); return; }

  let applied = 0;
  for (let i = 0; i < updates.length; i += args.batchSize) {
    const batch = updates.slice(i, i + args.batchSize);
    const values = batch.map((u) => `(${ql(u.address)}, ${ql(u.dollarLiquidity.toString())}::numeric)`).join(",\n");
    psqlExec(args.databaseUrl, `begin;
set local search_path = ${qi(table.table_schema)}, public;
-- Satisfy Ponder's live-query trigger (unqualified insert into live_query_tables)
-- when that bookkeeping table is absent in this schema.
create temporary table if not exists live_query_tables (
  table_name text primary key
) on commit drop;
update ${qualified} as p set ${qi(col.dollarLiquidity)} = v.dl
from (values ${values}) as v(addr, dl)
where lower(p.${qi(col.address)}::text) = v.addr and p.${qi(col.chainId)}::numeric = ${Number(args.chainId)};
commit;`);
    applied += batch.length;
    console.log(`Applied ${applied}/${updates.length}`);
  }
  console.log(`Done. Updated ${applied} pools.`);
}

main().catch((e) => { console.error(e.stack ?? e.message); process.exitCode = 1; });
