#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

const TRANSFER_SELECTOR =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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
    windowSize: 5000,
    rpcConcurrency: 4,
    tokenConcurrency: 4,
    batchSize: 1000,
    limit: undefined,
    token: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
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
      else if (key === "window-size") args.windowSize = Number(v);
      else if (key === "rpc-concurrency") args.rpcConcurrency = Number(v);
      else if (key === "token-concurrency") args.tokenConcurrency = Number(v);
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
  node scripts/backfill-derc20-transfers.mjs [options]

Stage 1 of the DERC20 backfill. For each DERC20 contract present in
ponder_sync.factory_addresses but with no Transfer rows yet in
ponder_sync.logs, this script:

  1. Looks up the deploy block from factory_addresses.
  2. Fetches all Transfer logs from RPC in --window-size chunks, with
     --rpc-concurrency in flight (per token). Windows stream into the DB
     writer in order so the next RPC window is fetched while the previous
     window's INSERTs are in flight.
  3. INSERTs raw logs into ponder_sync.logs (idempotent on PK).

Does NOT touch any prod_<schema> table. Run backfill-derc20-materialize.mjs
afterwards to derive holder_count / user / user_asset from the now-present
Transfer rows.

Options:
  --chain-id <id>            EVM chain id. Default 8453.
  --factory-id <n>           Source factory id. Default 640791.
  --schema <name>            Materialized indexer schema. Default prod_1.
  --ponder-sync-schema <s>   Sync schema name. Default ponder_sync.
  --rpc-url <url>            RPC URL. Default \$BASE_RPC_URL etc.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --window-size <n>          Blocks per eth_getLogs request. Default 5000.
  --rpc-concurrency <n>      Window fetches in flight per token. Default 4.
  --token-concurrency <n>    Tokens processed in parallel. Default 4.
  --batch-size <n>           Rows per DB INSERT batch. Default 1000.
  --limit <n>                Process at most N tokens (after filtering).
  --token <0x...>            Process exactly one token (ignores filters).
  --apply                    Actually write. Default is dry-run.
`);
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function lowerHex(value) {
  return value == null ? null : String(value).toLowerCase();
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

function selectWorkingSetSql(args) {
  const fa = `${args.pondersyncSchema}.factory_addresses`;
  const tok = `${args.schema}.token`;
  const logs = `${args.pondersyncSchema}.logs`;

  if (args.token) {
    return `
select coalesce(json_agg(q), '[]'::json) from (
  select lower(t.address) as token,
         t.chain_id::int as chain_id,
         coalesce(fa.block_number, 0)::text as deploy_block,
         lower(t.pool) as pool
  from ${tok} t
  left join ${fa} fa
    on fa.factory_id = ${Number(args.factoryId)}
   and fa.chain_id = t.chain_id
   and lower(fa.address) = lower(t.address)
  where lower(t.address) = ${ql(args.token)} and t.chain_id = ${Number(args.chainId)}
) q;`;
  }

  const limit = args.limit ? `limit ${Number(args.limit)}` : "";
  return `
select coalesce(json_agg(q), '[]'::json) from (
  select lower(t.address) as token,
         t.chain_id::int as chain_id,
         fa.block_number::text as deploy_block,
         lower(t.pool) as pool
  from ${fa} fa
  join ${tok} t
    on lower(t.address) = lower(fa.address) and t.chain_id = fa.chain_id
  where fa.factory_id = ${Number(args.factoryId)}
    and fa.chain_id = ${Number(args.chainId)}
    and not exists (
      select 1 from ${logs} l
      where l.chain_id = fa.chain_id
        and lower(l.address) = lower(fa.address)
        and l.topic0 = ${ql(TRANSFER_SELECTOR)}
    )
  order by fa.block_number
  ${limit}
) q;`;
}

function makeWindows(fromBlock, toBlock, size) {
  const sz = BigInt(size);
  const out = [];
  for (let f = fromBlock; f <= toBlock; f += sz) {
    const t = f + sz - 1n > toBlock ? toBlock : f + sz - 1n;
    out.push({ from: f, to: t });
  }
  return out;
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

async function fetchTransferRange(client, token, fromBlock, toBlock, attempts = 4) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await client.request({
        method: "eth_getLogs",
        params: [
          {
            address: token,
            topics: [TRANSFER_SELECTOR],
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
          },
        ],
      });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  throw lastErr;
}

function buildLogRowsValues(rows) {
  return rows
    .map(
      (r) =>
        `(${ql(r.address)}, ${ql(r.blockHash)}, ${r.blockNumber.toString()}, ${Number(r.chainId)}, ${ql(r.data)}, ${Number(r.logIndex)}, ${ql(r.topic0)}, ${r.topic1 ? ql(r.topic1) : "NULL"}, ${r.topic2 ? ql(r.topic2) : "NULL"}, ${r.topic3 ? ql(r.topic3) : "NULL"}, ${ql(r.transactionHash)}, ${Number(r.transactionIndex)})`,
    )
    .join(",\n");
}

function insertLogsBatch(databaseUrl, schema, rows) {
  if (rows.length === 0) return 0;
  const values = buildLogRowsValues(rows);
  const sql = `
insert into ${schema}.logs (address, block_hash, block_number, chain_id, data, log_index, topic0, topic1, topic2, topic3, transaction_hash, transaction_index)
values
${values}
on conflict (chain_id, block_number, log_index) do nothing
returning 1;
`;
  return psqlReturning1(databaseUrl, sql);
}

async function processToken(args, client, work) {
  const head = await client.getBlockNumber();
  const deployBlock = BigInt(work.deploy_block);
  if (deployBlock === 0n) {
    throw new Error(`Token ${work.token} has no deploy_block in factory_addresses; run airlock backfill first.`);
  }
  const windows = makeWindows(deployBlock, head, args.windowSize);

  let buffer = [];
  let transferCount = 0;
  let logsWritten = 0;

  const fetcher = (w) => fetchTransferRange(client, work.token, w.from, w.to);

  const flushIfFull = () => {
    if (!args.apply) {
      buffer = [];
      return;
    }
    while (buffer.length >= args.batchSize) {
      const slice = buffer.splice(0, args.batchSize);
      logsWritten += insertLogsBatch(args.databaseUrl, args.pondersyncSchema, slice);
    }
  };

  const flushFinal = () => {
    if (!args.apply) return;
    while (buffer.length > 0) {
      const slice = buffer.splice(0, args.batchSize);
      logsWritten += insertLogsBatch(args.databaseUrl, args.pondersyncSchema, slice);
    }
  };

  for await (const { result: logs } of orderedPrefetch(
    windows,
    fetcher,
    args.rpcConcurrency,
  )) {
    for (const log of logs) {
      transferCount++;
      buffer.push({
        address: lowerHex(log.address),
        blockHash: lowerHex(log.blockHash),
        blockNumber: BigInt(log.blockNumber),
        chainId: args.chainId,
        data: log.data,
        logIndex: Number(log.logIndex),
        topic0: lowerHex(log.topics[0]),
        topic1: log.topics[1] ? lowerHex(log.topics[1]) : null,
        topic2: log.topics[2] ? lowerHex(log.topics[2]) : null,
        topic3: log.topics[3] ? lowerHex(log.topics[3]) : null,
        transactionHash: lowerHex(log.transactionHash),
        transactionIndex: Number(log.transactionIndex),
      });
    }
    flushIfFull();
  }

  flushFinal();

  return {
    token: work.token,
    transferCount,
    logsWritten,
    windows: windows.length,
  };
}

async function tokenPool(args, client, workingSet, concurrency) {
  let processed = 0;
  let failed = 0;
  let totalTransfers = 0;
  let totalLogs = 0;
  const queue = workingSet.slice();

  async function worker(id) {
    while (queue.length > 0) {
      const work = queue.shift();
      if (!work) return;
      try {
        const start = Date.now();
        const result = await processToken(args, client, work);
        processed++;
        totalTransfers += result.transferCount;
        totalLogs += result.logsWritten;
        const ms = Date.now() - start;
        console.log(
          `[w${id}] ${work.token}  transfers=${result.transferCount}  logs_written=${result.logsWritten}  windows=${result.windows}  ${ms}ms  (${processed}/${workingSet.length})`,
        );
      } catch (err) {
        failed++;
        console.error(`[w${id}] ${work.token} FAILED: ${err.message || err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  return { processed, failed, totalTransfers, totalLogs };
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
  console.log(`Selected ${workingSet.length} token(s) to fetch transfers for.`);
  if (workingSet.length === 0) return;
  if (!args.apply) console.log("(dry-run; pass --apply to actually write)");

  const totals = await tokenPool(args, client, workingSet, args.tokenConcurrency);
  console.log(
    `Done. processed=${totals.processed} failed=${totals.failed} transfers=${totals.totalTransfers} ponder_sync_logs_written=${totals.totalLogs}`,
  );
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
