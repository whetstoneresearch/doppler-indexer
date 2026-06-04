#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

const CREATE_SELECTOR =
  "0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab";

const DEFAULTS = {
  8453: {
    airlock: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
    factoryId: 640791,
  },
};

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
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    airlock: undefined,
    factoryId: undefined,
    startBlock: undefined,
    endBlock: undefined,
    windowSize: 2000,
    batchSize: 1000,
    rpcConcurrency: 4,
    pondersyncSchema: "ponder_sync",
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
      else if (key === "airlock") args.airlock = v.toLowerCase();
      else if (key === "factory-id") args.factoryId = Number(v);
      else if (key === "start-block") args.startBlock = BigInt(v);
      else if (key === "end-block") args.endBlock = BigInt(v);
      else if (key === "window-size") args.windowSize = Number(v);
      else if (key === "batch-size") args.batchSize = Number(v);
      else if (key === "rpc-concurrency") args.rpcConcurrency = Number(v);
      else if (key === "ponder-sync-schema") args.pondersyncSchema = v;
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-airlock-creates.mjs [options]

Re-fetches missing Airlock Create logs from RPC and inserts them into
ponder_sync.factory_addresses and ponder_sync.logs. Does NOT touch
ponder_sync.intervals.

eth_getLogs windows are fetched with --rpc-concurrency in flight; results
are handed to the DB writer in order so RPC and DB work overlap.

Options:
  --chain-id <id>            EVM chain id. Default 8453.
  --airlock <0x...>          Airlock contract. Default per-chain.
  --factory-id <n>           ponder_sync.factories.id for the DERC20
                             subscription. Default per-chain.
  --rpc-url <url>            RPC URL. Default \$BASE_RPC_URL etc.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --start-block <n>          From block (inclusive). Default = 1 + max
                             block_number already in factory_addresses
                             for the chosen factory.
  --end-block <n>            To block (inclusive). Default = current head.
  --window-size <n>          Blocks per eth_getLogs request. Default 2000.
  --batch-size <n>           Rows per DB INSERT batch. Default 1000.
  --rpc-concurrency <n>      Window fetches in flight. Default 4.
  --ponder-sync-schema <s>   Sync schema name. Default ponder_sync.
  --apply                    Actually write. Default is dry-run.
`);
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function lowerHex(value) {
  return value == null ? null : String(value).toLowerCase();
}

function dataAddressAtOffset(data, byteOffset) {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const start = byteOffset * 2 + 24;
  const end = start + 40;
  if (hex.length < end)
    throw new Error(`data too short for address at offset ${byteOffset}`);
  return `0x${hex.slice(start, end).toLowerCase()}`;
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

function resolveDefaults(chainId, airlockOverride, factoryIdOverride) {
  const fallback = DEFAULTS[chainId];
  const airlock = airlockOverride ?? fallback?.airlock?.toLowerCase();
  const factoryId = factoryIdOverride ?? fallback?.factoryId;
  if (!airlock)
    throw new Error(`No --airlock and no default for chain ${chainId}`);
  if (factoryId === undefined)
    throw new Error(`No --factory-id and no default for chain ${chainId}`);
  return { airlock, factoryId };
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

async function fetchLogsRange(client, airlock, fromBlock, toBlock, attempts = 4) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await client.request({
        method: "eth_getLogs",
        params: [
          {
            address: airlock,
            topics: [CREATE_SELECTOR],
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
          },
        ],
      });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
  throw lastErr;
}

function buildFactoryRowsValues(rows) {
  return rows
    .map(
      (r) =>
        `(${Number(r.factoryId)}, ${Number(r.chainId)}, ${r.blockNumber.toString()}, ${ql(r.address)})`,
    )
    .join(",\n");
}

function buildLogRowsValues(rows) {
  return rows
    .map(
      (r) =>
        `(${ql(r.address)}, ${ql(r.blockHash)}, ${r.blockNumber.toString()}, ${Number(r.chainId)}, ${ql(r.data)}, ${Number(r.logIndex)}, ${ql(r.topic0)}, ${r.topic1 ? ql(r.topic1) : "NULL"}, ${r.topic2 ? ql(r.topic2) : "NULL"}, ${r.topic3 ? ql(r.topic3) : "NULL"}, ${ql(r.transactionHash)}, ${Number(r.transactionIndex)})`,
    )
    .join(",\n");
}

function psqlReturning1(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
  );
  return stdout.split("\n").filter((line) => line.trim() === "1").length;
}

function insertFactoryBatch(databaseUrl, schema, rows) {
  if (rows.length === 0) return 0;
  const values = buildFactoryRowsValues(rows);
  const sql = `
with incoming(factory_id, chain_id, block_number, address) as (
  values
${values}
)
insert into ${schema}.factory_addresses (factory_id, chain_id, block_number, address)
select i.factory_id, i.chain_id, i.block_number, i.address
from incoming i
where not exists (
  select 1 from ${schema}.factory_addresses f
  where f.factory_id = i.factory_id and f.chain_id = i.chain_id and lower(f.address) = lower(i.address)
)
returning 1;
`;
  return psqlReturning1(databaseUrl, sql);
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

function findHighestKnownBlock(databaseUrl, schema, factoryId, chainId) {
  const sql = `select coalesce(max(block_number), 0)::text from ${schema}.factory_addresses where factory_id = ${Number(factoryId)} and chain_id = ${Number(chainId)};`;
  const out = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  ).trim();
  return BigInt(out || "0");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.databaseUrl) throw new Error("Missing DATABASE_URL");

  const rpcUrl = resolveRpcUrl(args.chainId, args.rpcUrl);
  const { airlock, factoryId } = resolveDefaults(
    args.chainId,
    args.airlock,
    args.factoryId,
  );

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: 30_000, retryCount: 3 }),
  });

  const head = args.endBlock ?? (await client.getBlockNumber());
  let startBlock = args.startBlock;
  if (startBlock === undefined) {
    const highest = findHighestKnownBlock(
      args.databaseUrl,
      args.pondersyncSchema,
      factoryId,
      args.chainId,
    );
    startBlock = highest + 1n;
  }

  if (startBlock > head) {
    console.log(`Nothing to do: start_block ${startBlock} > head ${head}.`);
    return;
  }

  console.log(
    `Backfilling Airlock(${airlock}) Create logs on chain ${args.chainId}`,
  );
  console.log(`  range: blocks [${startBlock}, ${head}]`);
  console.log(
    `  factory_id=${factoryId}  apply=${args.apply}  rpc_concurrency=${args.rpcConcurrency}  window=${args.windowSize}`,
  );

  const windows = makeWindows(startBlock, head, args.windowSize);
  console.log(`  windows=${windows.length}`);

  let factoryBuffer = [];
  let logsBuffer = [];
  let totalCreates = 0;
  let totalFactoryWritten = 0;
  let totalLogsWritten = 0;
  let lastReport = Date.now();
  let windowsDone = 0;

  const flushIfFull = () => {
    if (!args.apply) {
      factoryBuffer = [];
      logsBuffer = [];
      return;
    }
    while (factoryBuffer.length >= args.batchSize) {
      const slice = factoryBuffer.splice(0, args.batchSize);
      totalFactoryWritten += insertFactoryBatch(
        args.databaseUrl,
        args.pondersyncSchema,
        slice,
      );
    }
    while (logsBuffer.length >= args.batchSize) {
      const slice = logsBuffer.splice(0, args.batchSize);
      totalLogsWritten += insertLogsBatch(
        args.databaseUrl,
        args.pondersyncSchema,
        slice,
      );
    }
  };

  const flushFinal = () => {
    if (!args.apply) return;
    while (factoryBuffer.length > 0) {
      const slice = factoryBuffer.splice(0, args.batchSize);
      totalFactoryWritten += insertFactoryBatch(
        args.databaseUrl,
        args.pondersyncSchema,
        slice,
      );
    }
    while (logsBuffer.length > 0) {
      const slice = logsBuffer.splice(0, args.batchSize);
      totalLogsWritten += insertLogsBatch(
        args.databaseUrl,
        args.pondersyncSchema,
        slice,
      );
    }
  };

  const fetcher = (w) => fetchLogsRange(client, airlock, w.from, w.to);

  for await (const { item: window, result: logs } of orderedPrefetch(
    windows,
    fetcher,
    args.rpcConcurrency,
  )) {
    for (const log of logs) {
      const asset = dataAddressAtOffset(log.data, 0);
      const blockNumber = BigInt(log.blockNumber);
      const logIndex = Number(log.logIndex);
      factoryBuffer.push({
        factoryId,
        chainId: args.chainId,
        blockNumber,
        address: asset,
      });
      logsBuffer.push({
        address: lowerHex(log.address),
        blockHash: lowerHex(log.blockHash),
        blockNumber,
        chainId: args.chainId,
        data: log.data,
        logIndex,
        topic0: lowerHex(log.topics[0] ?? null),
        topic1: log.topics[1] ? lowerHex(log.topics[1]) : null,
        topic2: log.topics[2] ? lowerHex(log.topics[2]) : null,
        topic3: log.topics[3] ? lowerHex(log.topics[3]) : null,
        transactionHash: lowerHex(log.transactionHash),
        transactionIndex: Number(log.transactionIndex),
      });
      totalCreates++;
    }
    flushIfFull();
    windowsDone++;

    if (Date.now() - lastReport > 5000) {
      console.log(
        `  windows ${windowsDone}/${windows.length} (${((windowsDone / windows.length) * 100).toFixed(2)}%)  block=${window.to}  creates=${totalCreates}  fa_written=${totalFactoryWritten}  logs_written=${totalLogsWritten}`,
      );
      lastReport = Date.now();
    }
  }

  flushFinal();

  console.log(
    `Done. creates_found=${totalCreates} factory_addresses_written=${totalFactoryWritten} logs_written=${totalLogsWritten}`,
  );
  if (!args.apply) console.log("Dry-run; re-run with --apply to write.");
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
