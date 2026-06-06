#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

const TRANSFER_SELECTOR =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const RPC_ENV_BY_CHAIN = {
  1: ["PONDER_RPC_URL_1", "MAINNET_RPC"],
  130: ["PONDER_RPC_URL_130", "UNICHAIN_RPC"],
  143: ["PONDER_RPC_URL_143", "MONAD_RPC"],
  8453: ["PONDER_RPC_URL_8453", "BASE_RPC", "BASE_RPC_URL"],
  57073: ["PONDER_RPC_URL_57073", "INK_RPC"],
};

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
    chainId: 8453,
    factoryId: 640791,
    schema: "prod_1",
    pondersyncSchema: "ponder_sync",
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    tokenConcurrency: 4,
    rpcConcurrency: 8,
    batchSize: 500,
    limit: undefined,
    token: undefined,
    skipUserUpsert: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--skip-user-upsert") args.skipUserUpsert = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`Missing value for ${a}`);
      if (key === "database-url") args.databaseUrl = v;
      else if (key === "rpc-url") args.rpcUrl = v;
      else if (key === "chain-id") args.chainId = Number(v);
      else if (key === "factory-id") args.factoryId = Number(v);
      else if (key === "schema") args.schema = v;
      else if (key === "ponder-sync-schema") args.pondersyncSchema = v;
      else if (key === "token-concurrency") args.tokenConcurrency = Number(v);
      else if (key === "rpc-concurrency") args.rpcConcurrency = Number(v);
      else if (key === "batch-size") args.batchSize = Number(v);
      else if (key === "limit") args.limit = Number(v);
      else if (key === "token") args.token = v.toLowerCase();
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-derc20-materialize.mjs [options]

Stage 2 of the DERC20 backfill. For each DERC20 contract with Transfer
rows already present in ponder_sync.logs (left there by
backfill-derc20-transfers.mjs), this script:

  1. Selects all Transfer rows for the token from ponder_sync.logs
     in (block_number, log_index) order.
  2. Fetches block timestamps for the unique blocks touched (RPC,
     header-only) — pipelined with the previous token's DB writes.
  3. Replays the Transfer history offline to derive each address's
     final balance, first_seen, and last_interaction.
  4. UPSERTs prod_<schema>.user and prod_<schema>.user_asset, and
     UPDATEs holder_count on prod_<schema>.token and prod_<schema>.pool.

Tokens are processed in parallel (--token-concurrency); within a token,
the next token's RPC timestamp fetch overlaps with this token's DB writes.

Options:
  --chain-id <id>            EVM chain id. Default 8453.
  --factory-id <n>           Source factory id. Default 640791.
  --schema <name>            Materialized indexer schema. Default prod_1.
  --ponder-sync-schema <s>   Sync schema name. Default ponder_sync.
  --rpc-url <url>            RPC URL. Default \$BASE_RPC_URL.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --token-concurrency <n>    Tokens processed in parallel. Default 4.
  --rpc-concurrency <n>      eth_getBlockByNumber calls in flight per
                             token. Default 8.
  --batch-size <n>           Rows per DB INSERT batch. Default 500.
  --limit <n>                Process at most N tokens (after filtering).
  --token <0x...>            Process exactly one token (ignores filters).
  --skip-user-upsert         Skip prod_<schema>.user upserts (faster;
                             holder_count + user_asset still get written).
  --apply                    Actually write. Default is dry-run.
`);
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function topicToAddress(topic) {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;
  return `0x${hex.slice(24).toLowerCase()}`;
}

function resolveRpcUrl(chainId, override) {
  if (override) return override;
  for (const name of RPC_ENV_BY_CHAIN[chainId] ?? []) {
    if (process.env[name]) return process.env[name];
  }
  throw new Error(
    `No RPC URL found for chain ${chainId}. Set --rpc-url or one of ${(RPC_ENV_BY_CHAIN[chainId] ?? []).join(", ")}.`,
  );
}

function psqlJson(databaseUrl, sql) {
  const out = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
  ).trim();
  return JSON.parse(out || "[]");
}

function psqlReturning1(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    {
      input: sql,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 512,
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  return stdout.split("\n").filter((line) => line.trim() === "1").length;
}

function psqlExec(databaseUrl, sql) {
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function selectWorkingSetSql(args) {
  const fa = `${args.pondersyncSchema}.factory_addresses`;
  const tok = `${args.schema}.token`;
  const ua = `${args.schema}.user_asset`;
  const logs = `${args.pondersyncSchema}.logs`;

  if (args.token) {
    return `
select coalesce(json_agg(q), '[]'::json) from (
  select lower(t.address) as token,
         t.chain_id::int as chain_id,
         lower(t.pool) as pool
  from ${tok} t
  where lower(t.address) = ${ql(args.token)} and t.chain_id = ${Number(args.chainId)}
) q;`;
  }

  const limit = args.limit ? `limit ${Number(args.limit)}` : "";
  return `
select coalesce(json_agg(q), '[]'::json) from (
  select lower(t.address) as token,
         t.chain_id::int as chain_id,
         lower(t.pool) as pool
  from ${fa} fa
  join ${tok} t
    on lower(t.address) = lower(fa.address) and t.chain_id = fa.chain_id
  where fa.factory_id = ${Number(args.factoryId)}
    and fa.chain_id = ${Number(args.chainId)}
    and exists (
      select 1 from ${logs} l
      where l.chain_id = fa.chain_id
        and lower(l.address) = lower(fa.address)
        and l.topic0 = ${ql(TRANSFER_SELECTOR)}
    )
    and not exists (
      select 1 from ${ua} ua
      where lower(ua.asset_id) = lower(t.address) and ua.chain_id = t.chain_id
    )
  order by fa.block_number
  ${limit}
) q;`;
}

function selectTransfersSql(schema, chainId, token) {
  return `
select block_number::text || E'\\t' || log_index::text || E'\\t' || topic1 || E'\\t' || topic2 || E'\\t' || data
from ${schema}.logs
where chain_id = ${Number(chainId)}
  and lower(address) = ${ql(token)}
  and topic0 = ${ql(TRANSFER_SELECTOR)}
order by block_number, log_index;`;
}

function psqlRowsTsv(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );
  const lines = stdout.split("\n");
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    rows.push({
      block_number: parts[0],
      log_index: Number(parts[1]),
      topic1: parts[2],
      topic2: parts[3],
      data: parts[4],
    });
  }
  return rows;
}

async function* orderedPrefetch(items, fetcher, concurrency) {
  const inflight = [];
  let i = 0;
  const start = (idx) => ({ item: items[idx], promise: fetcher(items[idx]) });
  while (i < items.length && inflight.length < concurrency) {
    inflight.push(start(i));
    i++;
  }
  while (inflight.length > 0) {
    const next = inflight.shift();
    const result = await next.promise;
    if (i < items.length) {
      inflight.push(start(i));
      i++;
    }
    yield { item: next.item, result };
  }
}

async function fetchBlockTimestamp(client, blockNumber, attempts = 4) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const block = await client.request({
        method: "eth_getBlockByNumber",
        params: [`0x${BigInt(blockNumber).toString(16)}`, false],
      });
      if (!block) throw new Error(`block ${blockNumber} not found`);
      return BigInt(block.timestamp);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function fetchBlockTimestampsBulk(client, blockNumbers, concurrency) {
  const map = new Map();
  const unique = [...new Set(blockNumbers.map((b) => b.toString()))];
  const items = unique.map((s) => BigInt(s));
  const fetcher = (bn) => fetchBlockTimestamp(client, bn);
  for await (const { item, result } of orderedPrefetch(
    items,
    fetcher,
    concurrency,
  )) {
    map.set(item.toString(), result);
  }
  return map;
}

function replay(transfers) {
  const balances = new Map();
  const firstSeen = new Map();
  const lastInteraction = new Map();
  for (const t of transfers) {
    const from = topicToAddress(t.topic1);
    const to = topicToAddress(t.topic2);
    const value = BigInt(t.data);
    const block = t.block_number;
    if (from !== ZERO_ADDRESS) {
      balances.set(from, (balances.get(from) ?? 0n) - value);
      lastInteraction.set(from, block);
      if (!firstSeen.has(from)) firstSeen.set(from, block);
    }
    if (to !== ZERO_ADDRESS) {
      balances.set(to, (balances.get(to) ?? 0n) + value);
      lastInteraction.set(to, block);
      if (!firstSeen.has(to)) firstSeen.set(to, block);
    }
  }
  return { balances, firstSeen, lastInteraction };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function buildUserAssetValues(rows) {
  return rows
    .map(
      (r) =>
        `(${Number(r.chainId)}, ${ql(r.userId)}, ${ql(r.assetId)}, ${r.balance.toString()}, ${r.createdAt.toString()}, ${r.lastInteraction.toString()})`,
    )
    .join(",\n");
}

function buildUserValues(rows) {
  return rows
    .map(
      (r) =>
        `(${ql(r.address)}, ${Number(r.chainId)}, ${r.createdAt.toString()}, ${r.lastSeenAt.toString()})`,
    )
    .join(",\n");
}

function writeUserAssetBatch(databaseUrl, schema, rows) {
  if (rows.length === 0) return 0;
  const values = buildUserAssetValues(rows);
  const sql = `
set session_replication_role = replica;
insert into ${schema}.user_asset (chain_id, user_id, asset_id, balance, created_at, last_interaction)
values
${values}
on conflict (user_id, asset_id, chain_id) do update set
  balance = excluded.balance,
  last_interaction = greatest(${schema}.user_asset.last_interaction, excluded.last_interaction)
returning 1;
`;
  return psqlReturning1(databaseUrl, sql);
}

function writeUsersBatch(databaseUrl, schema, rows) {
  if (rows.length === 0) return 0;
  const values = buildUserValues(rows);
  const sql = `
set session_replication_role = replica;
insert into ${schema}."user" (address, chain_id, created_at, last_seen_at)
values
${values}
on conflict (address, chain_id) do update set
  last_seen_at = greatest(${schema}."user".last_seen_at, excluded.last_seen_at)
returning 1;
`;
  return psqlReturning1(databaseUrl, sql);
}

function setHolderCounts(databaseUrl, schema, chainId, token, pool, holderCount) {
  const parts = [
    "set session_replication_role = replica;",
    `update ${schema}.token set holder_count = ${Number(holderCount)} where lower(address) = ${ql(token)} and chain_id = ${Number(chainId)};`,
  ];
  if (pool) {
    parts.push(
      `update ${schema}.pool set holder_count = ${Number(holderCount)} where lower(address) = ${ql(pool)} and chain_id = ${Number(chainId)};`,
    );
  }
  psqlExec(databaseUrl, parts.join("\n"));
}

async function buildPlanForToken(args, client, work) {
  const log = (msg) => console.log(`  [${work.token}] ${msg}`);

  log("fetching Transfer rows from ponder_sync.logs...");
  const t0 = Date.now();
  const transfersSql = selectTransfersSql(
    args.pondersyncSchema,
    args.chainId,
    work.token,
  );
  const transfers = psqlRowsTsv(args.databaseUrl, transfersSql);
  log(`fetched ${transfers.length} transfers (${Date.now() - t0}ms)`);

  if (transfers.length === 0) {
    return {
      work,
      transfers,
      balances: new Map(),
      firstSeen: new Map(),
      lastInteraction: new Map(),
      blockTimestamps: new Map(),
    };
  }

  log("replaying transfers...");
  const t1 = Date.now();
  const { balances, firstSeen, lastInteraction } = replay(transfers);
  log(
    `replayed: ${balances.size} unique addresses (${Date.now() - t1}ms)`,
  );

  const blockNumbers = new Set();
  for (const v of firstSeen.values()) blockNumbers.add(v);
  for (const v of lastInteraction.values()) blockNumbers.add(v);

  log(`fetching ${blockNumbers.size} block timestamps via RPC...`);
  const t2 = Date.now();
  const blockTimestamps = await fetchBlockTimestampsBulk(
    client,
    [...blockNumbers],
    args.rpcConcurrency,
  );
  log(`fetched block timestamps (${Date.now() - t2}ms)`);

  return { work, transfers, balances, firstSeen, lastInteraction, blockTimestamps };
}

async function applyPlan(args, plan) {
  const { work, balances, firstSeen, lastInteraction, blockTimestamps } = plan;
  const heldBy = [...balances.entries()].filter(([, b]) => b > 0n).map(([a]) => a);

  if (!args.apply) {
    return {
      token: work.token,
      transferCount: plan.transfers.length,
      holderCount: heldBy.length,
      uniqueAddresses: balances.size,
    };
  }

  const userRows = [];
  const userAssetRows = [];
  for (const [addr, bal] of balances.entries()) {
    const fb = firstSeen.get(addr);
    const lb = lastInteraction.get(addr);
    const createdAt = blockTimestamps.get(String(fb)) ?? 0n;
    const lastTs = blockTimestamps.get(String(lb)) ?? createdAt;
    userRows.push({
      address: addr,
      chainId: args.chainId,
      createdAt,
      lastSeenAt: lastTs,
    });
    userAssetRows.push({
      chainId: args.chainId,
      userId: addr,
      assetId: work.token,
      balance: bal,
      createdAt,
      lastInteraction: lastTs,
    });
  }

  const log = (msg) => console.log(`  [${work.token}] ${msg}`);

  let usersWritten = 0;
  if (!args.skipUserUpsert) {
    const slices = chunk(userRows, args.batchSize);
    log(`writing ${userRows.length} user rows in ${slices.length} batch(es)...`);
    const t = Date.now();
    for (let i = 0; i < slices.length; i++) {
      usersWritten += writeUsersBatch(args.databaseUrl, args.schema, slices[i]);
    }
    log(`wrote users (${Date.now() - t}ms)`);
  }

  const uaSlices = chunk(userAssetRows, args.batchSize);
  log(
    `writing ${userAssetRows.length} user_asset rows in ${uaSlices.length} batch(es)...`,
  );
  const tUa = Date.now();
  let userAssetsWritten = 0;
  for (let i = 0; i < uaSlices.length; i++) {
    userAssetsWritten += writeUserAssetBatch(
      args.databaseUrl,
      args.schema,
      uaSlices[i],
    );
  }
  log(`wrote user_assets (${Date.now() - tUa}ms)`);

  log(`updating holder_count to ${heldBy.length}...`);
  setHolderCounts(
    args.databaseUrl,
    args.schema,
    args.chainId,
    work.token,
    work.pool,
    heldBy.length,
  );

  return {
    token: work.token,
    transferCount: plan.transfers.length,
    holderCount: heldBy.length,
    uniqueAddresses: balances.size,
    usersWritten,
    userAssetsWritten,
  };
}

async function tokenPipeline(args, client, workingSet) {
  const builder = (work) => buildPlanForToken(args, client, work);

  let processed = 0;
  let failed = 0;
  const totals = {
    transfers: 0,
    holders: 0,
    userAssets: 0,
    users: 0,
  };

  for await (const { result: plan } of orderedPrefetch(
    workingSet,
    builder,
    args.tokenConcurrency,
  )) {
    try {
      const start = Date.now();
      const res = await applyPlan(args, plan);
      processed++;
      totals.transfers += res.transferCount;
      totals.holders += res.holderCount;
      totals.userAssets += res.userAssetsWritten ?? 0;
      totals.users += res.usersWritten ?? 0;
      const ms = Date.now() - start;
      console.log(
        `${plan.work.token}  transfers=${res.transferCount}  holders=${res.holderCount}  user_assets=${res.userAssetsWritten ?? "-"}  ${ms}ms  (${processed}/${workingSet.length})`,
      );
    } catch (err) {
      failed++;
      console.error(`${plan.work.token} FAILED: ${err.message || err}`);
    }
  }

  return { processed, failed, totals };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.databaseUrl) throw new Error("Missing DATABASE_URL");

  const rpcUrl = resolveRpcUrl(args.chainId, args.rpcUrl);
  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: 30_000, retryCount: 3 }),
  });

  const workingSet = psqlJson(args.databaseUrl, selectWorkingSetSql(args));
  console.log(`Selected ${workingSet.length} token(s) to materialize.`);
  if (workingSet.length === 0) return;
  if (!args.apply) console.log("(dry-run; pass --apply to actually write)");

  const { processed, failed, totals } = await tokenPipeline(
    args,
    client,
    workingSet,
  );
  console.log(
    `Done. processed=${processed} failed=${failed} transfers=${totals.transfers} holders=${totals.holders} user_assets=${totals.userAssets} users=${totals.users}`,
  );
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
