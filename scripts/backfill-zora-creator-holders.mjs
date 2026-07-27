#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

// CoinTransfer(address indexed sender, address indexed recipient,
//              uint256 amount, uint256 senderBalance, uint256 recipientBalance)
const COIN_TRANSFER_SELECTOR =
  "0xa20126263d779da517a295859c8332765f45a215da1c42acac1b9e458a69a144";
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
    schema: "prod_1",
    pondersyncSchema: "ponder_sync",
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    tokenConcurrency: 4,
    rpcConcurrency: 8,
    batchSize: 500,
    limit: undefined,
    token: undefined,
    onlyZero: false,
    withBalances: false,
    skipUserUpsert: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--only-zero") args.onlyZero = true;
    else if (a === "--with-balances") args.withBalances = true;
    else if (a === "--skip-user-upsert") args.skipUserUpsert = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`Missing value for ${a}`);
      if (key === "database-url") args.databaseUrl = v;
      else if (key === "rpc-url") args.rpcUrl = v;
      else if (key === "chain-id") args.chainId = Number(v);
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
  node scripts/backfill-zora-creator-holders.mjs [options]

Recomputes holder_count for Zora creator coins from the CoinTransfer logs
already present in ponder_sync.logs. For each creator coin token, this script:

  1. Selects every CoinTransfer row for the coin in (block_number, log_index)
     order.
  2. Derives each address's current balance. CoinTransfer carries absolute
     post-transfer balances for both sides, so the balance is read straight off
     the last log an address appears in — no delta replay, and a missing log
     window cannot skew the result.
  3. UPDATEs holder_count on prod_<schema>.token and, when the token is linked
     to a pool, on prod_<schema>.pool. Both rows get the same count: token is
     authoritative and pool mirrors it.

With --with-balances it also UPSERTs prod_<schema>.user_asset (and
prod_<schema>.user) so the live handler's subsequent deltas start from correct
per-wallet balances. Block timestamps come from ponder_sync.blocks, falling back
to RPC for blocks the sync store does not have.

Holders are counted exactly as the live indexer counts them: every address with
a positive balance, including contracts such as the pool manager and the coin
itself. The zero address is never counted.

Options:
  --chain-id <id>            EVM chain id. Default 8453.
  --schema <name>            Materialized indexer schema. Default prod_1.
  --ponder-sync-schema <s>   Sync schema name. Default ponder_sync.
  --rpc-url <url>            RPC URL. Default \$BASE_RPC_URL etc. Only needed
                             with --with-balances.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --token-concurrency <n>    Tokens processed in parallel. Default 4.
  --rpc-concurrency <n>      eth_getBlockByNumber calls in flight per token.
                             Default 8.
  --batch-size <n>           Rows per DB INSERT batch. Default 500.
  --limit <n>                Process at most N tokens (after filtering).
  --token <0x...>            Process exactly one token (ignores filters).
  --only-zero                Only tokens whose token.holder_count is currently 0.
  --with-balances            Also upsert user / user_asset rows.
  --skip-user-upsert         With --with-balances, skip the user table
                             (user_asset and holder_count still get written).
  --apply                    Actually write. Default is dry-run.

Dry-run prints the computed count next to the stored one so the drift is
visible before anything is written.
`);
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function topicToAddress(topic) {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;
  return `0x${hex.slice(24).toLowerCase()}`;
}

/** Reads the nth 32-byte word of a log data blob as a bigint. */
function dataWord(data, index) {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const word = hex.slice(index * 64, (index + 1) * 64);
  if (word.length < 64) throw new Error(`CoinTransfer data too short: ${data}`);
  return BigInt(`0x${word}`);
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
  execFileSync("psql", [databaseUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function psqlRowsTsv(databaseUrl, sql, minColumns) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );
  const rows = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < minColumns) continue;
    rows.push(parts);
  }
  return rows;
}

function selectWorkingSetSql(args) {
  const tok = `${args.schema}.token`;

  const filters = [
    `t.chain_id = ${Number(args.chainId)}`,
    "t.is_creator_coin = true",
  ];
  if (args.token) filters.push(`lower(t.address) = ${ql(args.token)}`);
  else if (args.onlyZero) filters.push("t.holder_count = 0");

  const limit = !args.token && args.limit ? `limit ${Number(args.limit)}` : "";

  return `
select coalesce(json_agg(q), '[]'::json) from (
  select lower(t.address) as token,
         t.chain_id::int as chain_id,
         lower(t.pool) as pool,
         t.holder_count::int as stored_holder_count
  from ${tok} t
  where ${filters.join("\n    and ")}
  order by t.first_seen_at
  ${limit}
) q;`;
}

function selectTransfersSql(pondersyncSchema, chainId, tokenAddress) {
  return `
select block_number::text || E'\\t' || log_index::text || E'\\t' || topic1 || E'\\t' || topic2 || E'\\t' || data
from ${pondersyncSchema}.logs
where chain_id = ${Number(chainId)}
  and lower(address) = ${ql(tokenAddress)}
  and topic0 = ${ql(COIN_TRANSFER_SELECTOR)}
order by block_number, log_index;`;
}

function selectBlockTimestampsSql(pondersyncSchema, chainId, blockNumbers) {
  const list = blockNumbers.map((b) => `${b.toString()}`).join(",");
  return `
select number::text || E'\\t' || timestamp::text
from ${pondersyncSchema}.blocks
where chain_id = ${Number(chainId)}
  and number in (${list});`;
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

/**
 * Lazily built so a run whose blocks are all present in ponder_sync.blocks
 * needs no RPC URL at all.
 */
function makeClientFactory(args) {
  let client;
  return () => {
    if (!client) {
      client = createPublicClient({
        transport: http(resolveRpcUrl(args.chainId, args.rpcUrl), {
          timeout: 30_000,
          retryCount: 3,
        }),
      });
    }
    return client;
  };
}

async function fetchBlockTimestamps(args, getClient, blockNumbers) {
  const map = new Map();
  const unique = [...new Set(blockNumbers.map((b) => b.toString()))];
  if (unique.length === 0) return map;

  for (const [number, timestamp] of psqlRowsTsv(
    args.databaseUrl,
    selectBlockTimestampsSql(args.pondersyncSchema, args.chainId, unique),
    2,
  )) {
    map.set(number, BigInt(timestamp));
  }

  const missing = unique.filter((n) => !map.has(n));
  if (missing.length === 0) return map;

  const client = getClient();
  const fetcher = (bn) => fetchBlockTimestamp(client, bn);
  for await (const { item, result } of orderedPrefetch(
    missing.map((s) => BigInt(s)),
    fetcher,
    args.rpcConcurrency,
  )) {
    map.set(item.toString(), result);
  }
  return map;
}

/**
 * CoinTransfer reports absolute post-transfer balances for both sides, so the
 * current balance of an address is whatever the last log it appears in said.
 */
function deriveBalances(transfers) {
  const balances = new Map();
  const firstSeen = new Map();
  const lastInteraction = new Map();

  for (const [blockNumber, , topic1, topic2, data] of transfers) {
    const sender = topicToAddress(topic1);
    const recipient = topicToAddress(topic2);
    const senderBalance = dataWord(data, 1);
    const recipientBalance = dataWord(data, 2);

    for (const [address, balance] of [
      [sender, senderBalance],
      [recipient, recipientBalance],
    ]) {
      if (address === ZERO_ADDRESS) continue;
      balances.set(address, balance);
      lastInteraction.set(address, blockNumber);
      if (!firstSeen.has(address)) firstSeen.set(address, blockNumber);
    }
  }

  return { balances, firstSeen, lastInteraction };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function writeUserAssetBatch(databaseUrl, schema, rows) {
  if (rows.length === 0) return 0;
  const values = rows
    .map(
      (r) =>
        `(${Number(r.chainId)}, ${ql(r.userId)}, ${ql(r.assetId)}, ${r.balance.toString()}, ${r.createdAt.toString()}, ${r.lastInteraction.toString()})`,
    )
    .join(",\n");
  const sql = `
begin;
alter table ${schema}.user_asset disable trigger user;
insert into ${schema}.user_asset (chain_id, user_id, asset_id, balance, created_at, last_interaction)
values
${values}
on conflict (user_id, asset_id, chain_id) do update set
  balance = excluded.balance,
  last_interaction = greatest(${schema}.user_asset.last_interaction, excluded.last_interaction)
returning 1;
alter table ${schema}.user_asset enable trigger user;
commit;
`;
  return psqlReturning1(databaseUrl, sql);
}

function writeUsersBatch(databaseUrl, schema, rows) {
  if (rows.length === 0) return 0;
  const values = rows
    .map(
      (r) =>
        `(${ql(r.address)}, ${Number(r.chainId)}, ${r.createdAt.toString()}, ${r.lastSeenAt.toString()})`,
    )
    .join(",\n");
  const sql = `
begin;
alter table ${schema}."user" disable trigger user;
insert into ${schema}."user" (address, chain_id, created_at, last_seen_at)
values
${values}
on conflict (address, chain_id) do update set
  last_seen_at = greatest(${schema}."user".last_seen_at, excluded.last_seen_at)
returning 1;
alter table ${schema}."user" enable trigger user;
commit;
`;
  return psqlReturning1(databaseUrl, sql);
}

function setHolderCounts(databaseUrl, schema, chainId, tokenAddress, poolAddress, holderCount) {
  const parts = [
    "begin;",
    `alter table ${schema}.token disable trigger user;`,
    `update ${schema}.token set holder_count = ${Number(holderCount)} where lower(address) = ${ql(tokenAddress)} and chain_id = ${Number(chainId)};`,
    `alter table ${schema}.token enable trigger user;`,
  ];
  if (poolAddress && poolAddress !== ZERO_ADDRESS) {
    parts.push(
      `alter table ${schema}.pool disable trigger user;`,
      `update ${schema}.pool set holder_count = ${Number(holderCount)} where lower(address) = ${ql(poolAddress)} and chain_id = ${Number(chainId)};`,
      `alter table ${schema}.pool enable trigger user;`,
    );
  }
  parts.push("commit;");
  psqlExec(databaseUrl, parts.join("\n"));
}

async function buildPlanForToken(args, getClient, work) {
  const transfers = psqlRowsTsv(
    args.databaseUrl,
    selectTransfersSql(args.pondersyncSchema, args.chainId, work.token),
    5,
  );

  const { balances, firstSeen, lastInteraction } = deriveBalances(transfers);
  const holderCount = [...balances.values()].filter((b) => b > 0n).length;

  let blockTimestamps = new Map();
  if (args.apply && args.withBalances && balances.size > 0) {
    blockTimestamps = await fetchBlockTimestamps(args, getClient, [
      ...firstSeen.values(),
      ...lastInteraction.values(),
    ]);
  }

  return {
    work,
    transferCount: transfers.length,
    balances,
    firstSeen,
    lastInteraction,
    blockTimestamps,
    holderCount,
  };
}

function applyPlan(args, plan) {
  const { work, balances, firstSeen, lastInteraction, blockTimestamps, holderCount } = plan;

  if (!args.apply) {
    return { ...plan, usersWritten: 0, userAssetsWritten: 0 };
  }

  let usersWritten = 0;
  let userAssetsWritten = 0;

  if (args.withBalances) {
    const userRows = [];
    const userAssetRows = [];
    for (const [address, balance] of balances.entries()) {
      const createdAt = blockTimestamps.get(String(firstSeen.get(address))) ?? 0n;
      const lastTs =
        blockTimestamps.get(String(lastInteraction.get(address))) ?? createdAt;
      userRows.push({
        address,
        chainId: args.chainId,
        createdAt,
        lastSeenAt: lastTs,
      });
      userAssetRows.push({
        chainId: args.chainId,
        userId: address,
        assetId: work.token,
        balance,
        createdAt,
        lastInteraction: lastTs,
      });
    }

    if (!args.skipUserUpsert) {
      for (const slice of chunk(userRows, args.batchSize)) {
        usersWritten += writeUsersBatch(args.databaseUrl, args.schema, slice);
      }
    }
    for (const slice of chunk(userAssetRows, args.batchSize)) {
      userAssetsWritten += writeUserAssetBatch(args.databaseUrl, args.schema, slice);
    }
  }

  setHolderCounts(
    args.databaseUrl,
    args.schema,
    args.chainId,
    work.token,
    work.pool,
    holderCount,
  );

  return { ...plan, usersWritten, userAssetsWritten };
}

async function tokenPipeline(args, getClient, workingSet) {
  const builder = (work) => buildPlanForToken(args, getClient, work);

  let processed = 0;
  let failed = 0;
  let drifted = 0;
  const totals = { transfers: 0, holders: 0, userAssets: 0, users: 0 };

  for await (const { result: plan } of orderedPrefetch(
    workingSet,
    builder,
    args.tokenConcurrency,
  )) {
    try {
      const start = Date.now();
      const res = applyPlan(args, plan);
      processed++;
      totals.transfers += res.transferCount;
      totals.holders += res.holderCount;
      totals.userAssets += res.userAssetsWritten;
      totals.users += res.usersWritten;
      const stored = plan.work.stored_holder_count;
      if (stored !== res.holderCount) drifted++;
      console.log(
        `${plan.work.token}  transfers=${res.transferCount}  stored=${stored}  computed=${res.holderCount}  user_assets=${res.userAssetsWritten}  ${Date.now() - start}ms  (${processed}/${workingSet.length})`,
      );
    } catch (err) {
      failed++;
      console.error(`${plan.work.token} FAILED: ${err.message || err}`);
    }
  }

  return { processed, failed, drifted, totals };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.databaseUrl) throw new Error("Missing DATABASE_URL");

  // Only --with-balances needs block timestamps, and only for blocks that
  // ponder_sync.blocks is missing — so the RPC client is built on first use.
  const getClient = makeClientFactory(args);

  const workingSet = psqlJson(args.databaseUrl, selectWorkingSetSql(args));
  console.log(`Selected ${workingSet.length} creator coin(s).`);
  if (workingSet.length === 0) return;
  if (!args.apply) console.log("(dry-run; pass --apply to actually write)");

  const { processed, failed, drifted, totals } = await tokenPipeline(
    args,
    getClient,
    workingSet,
  );
  console.log(
    `Done. processed=${processed} failed=${failed} drifted=${drifted} transfers=${totals.transfers} holders=${totals.holders} user_assets=${totals.userAssets} users=${totals.users}`,
  );
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
