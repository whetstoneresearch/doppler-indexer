#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

// Airlock events that register ponder factory children. `child` describes
// where the child address lives in the log (must match the ponder factory
// config's childAddressLocation for the target factory row).
const EVENTS = {
  create: {
    // Create(address asset, address indexed numeraire, ...)
    selector:
      "0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab",
    child: { kind: "data", offset: 0 },
  },
  migrate: {
    // Migrate(address indexed asset, address indexed pool)
    selector:
      "0x2a05bb717043f3a794e94382bf63f2e275ecafc41be9b63c34f16d58da9822ca",
    child: { kind: "topic", index: 2 },
  },
};

const DEFAULTS = {
  8453: {
    create: {
      airlock: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
      factoryId: 640791,
    },
  },
  4663: {
    create: {
      airlock: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
      factoryId: 827059,
    },
    migrate: {
      airlock: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
      // No default factoryId: look it up in ponder_sync.intervals /
      // ponder_sync.factories (fragment factory_log_4663_<airlock>_<Migrate
      // selector>_topic2_...) and pass --factory-id.
    },
  },
};

const RPC_ENV_BY_CHAIN = {
  1: ["PONDER_RPC_URL_1", "MAINNET_RPC"],
  130: ["PONDER_RPC_URL_130", "UNICHAIN_RPC"],
  143: ["PONDER_RPC_URL_143", "MONAD_RPC"],
  4663: ["PONDER_RPC_URL_4663", "ROBINHOOD_RPC"],
  8453: ["PONDER_RPC_URL_8453", "BASE_RPC", "BASE_RPC_URL"],
  57073: ["PONDER_RPC_URL_57073", "INK_RPC"],
};

// Last-resort public endpoints for chains where one exists. Rate-limited
// (robinhood: 10k logs per eth_getLogs, aggressive 429s) — prefer a private
// RPC via the env vars above for large backfills.
const PUBLIC_RPC_BY_CHAIN = {
  4663: "https://rpc.mainnet.chain.robinhood.com",
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
    event: "create",
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
    schema: "prod_1",
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
      else if (key === "event") args.event = v.toLowerCase();
      else if (key === "airlock") args.airlock = v.toLowerCase();
      else if (key === "factory-id") args.factoryId = Number(v);
      else if (key === "start-block") args.startBlock = BigInt(v);
      else if (key === "end-block") args.endBlock = BigInt(v);
      else if (key === "window-size") args.windowSize = Number(v);
      else if (key === "batch-size") args.batchSize = Number(v);
      else if (key === "rpc-concurrency") args.rpcConcurrency = Number(v);
      else if (key === "ponder-sync-schema") args.pondersyncSchema = v;
      else if (key === "schema") args.schema = v;
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-airlock-creates.mjs [options]

Re-fetches missing Airlock factory logs (Create or Migrate) from RPC and
inserts them into ponder_sync.factory_addresses and ponder_sync.logs. Does
NOT touch ponder_sync.intervals.

eth_getLogs windows are fetched with --rpc-concurrency in flight; results
are handed to the DB writer in order so RPC and DB work overlap.

Options:
  --chain-id <id>            EVM chain id. Default 8453.
  --event <create|migrate>   Which airlock factory event to backfill.
                             create -> DERC20 children (asset, data word 0),
                             migrate -> MigrationPool children (pool, topic2).
                             Default create.
  --airlock <0x...>          Airlock contract. Default per-chain.
  --factory-id <n>           ponder_sync.factories.id for the target factory
                             subscription. Default per-chain per-event.
  --rpc-url <url>            RPC URL. Default \$BASE_RPC_URL etc; falls back
                             to a public endpoint where one is known.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --start-block <n>          From block (inclusive). Default = 1 + max
                             block_number already in factory_addresses
                             for the chosen factory.
  --end-block <n>            To block (inclusive). Default = current head.
  --window-size <n>          Blocks per eth_getLogs request. Default 2000.
  --batch-size <n>           Rows per DB INSERT batch. Default 1000.
  --rpc-concurrency <n>      Window fetches in flight. Default 4.
  --ponder-sync-schema <s>   Sync schema name. Default ponder_sync.
  --schema <name>            Materialized schema, used to detect gaps when
                             --start-block is omitted. Default prod_1.
  --apply                    Actually write. Default is dry-run.

Default --start-block:
  Picks min(b.number) from ponder_sync.blocks for any DERC20 token in
  <schema>.token whose address is missing from <ponder-sync-schema>.
  factory_addresses for the chosen --factory-id (i.e. the earliest known
  gap). Falls back to max(block_number) + 1 of factory_addresses when no
  gaps are detected. Override with --start-block to force a specific
  starting block.
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

function topicToAddress(topic) {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;
  return `0x${hex.slice(24).toLowerCase()}`;
}

function extractChildAddress(log, child) {
  if (child.kind === "data") return dataAddressAtOffset(log.data, child.offset);
  const topic = log.topics[child.index];
  if (!topic)
    throw new Error(`log ${log.transactionHash} missing topic${child.index}`);
  return topicToAddress(topic);
}

function resolveRpcUrl(chainId, override) {
  if (override) return override;
  for (const name of RPC_ENV_BY_CHAIN[chainId] ?? []) {
    if (process.env[name]) return process.env[name];
  }
  if (PUBLIC_RPC_BY_CHAIN[chainId]) {
    console.warn(
      `No RPC env var set for chain ${chainId}; using rate-limited public endpoint ${PUBLIC_RPC_BY_CHAIN[chainId]}.`,
    );
    return PUBLIC_RPC_BY_CHAIN[chainId];
  }
  throw new Error(
    `No RPC URL found for chain ${chainId}. Set --rpc-url or one of ${(RPC_ENV_BY_CHAIN[chainId] ?? []).join(", ")}.`,
  );
}

function resolveDefaults(chainId, event, airlockOverride, factoryIdOverride) {
  const fallback = DEFAULTS[chainId]?.[event];
  const airlock = airlockOverride ?? fallback?.airlock?.toLowerCase();
  const factoryId = factoryIdOverride ?? fallback?.factoryId;
  if (!airlock)
    throw new Error(
      `No --airlock and no default for chain ${chainId} event ${event}`,
    );
  if (factoryId === undefined)
    throw new Error(
      `No --factory-id and no default for chain ${chainId} event ${event}`,
    );
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

async function fetchLogsRange(client, airlock, selector, fromBlock, toBlock, attempts = 4) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await client.request({
        method: "eth_getLogs",
        params: [
          {
            address: airlock,
            topics: [selector],
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

function findHighestKnownBlock(databaseUrl, pondersyncSchema, factoryId, chainId) {
  const sql = `select coalesce(max(block_number), 0)::text from ${pondersyncSchema}.factory_addresses where factory_id = ${Number(factoryId)} and chain_id = ${Number(chainId)};`;
  const out = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  ).trim();
  return BigInt(out || "0");
}

function findEarliestMissingBlock(databaseUrl, pondersyncSchema, schema, factoryId, chainId) {
  const sql = `
select coalesce(min(b.number), 0)::text
from ${schema}.token t
join ${pondersyncSchema}.blocks b
  on b.chain_id = t.chain_id and b.timestamp::bigint = t.first_seen_at::bigint
left join ${pondersyncSchema}.factory_addresses fa
  on fa.factory_id = ${Number(factoryId)}
 and fa.chain_id = t.chain_id
 and lower(fa.address) = lower(t.address)
where t.chain_id = ${Number(chainId)}
  and t.is_derc20 = true
  and fa.address is null;
`;
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

  const event = EVENTS[args.event];
  if (!event)
    throw new Error(
      `Unknown --event ${args.event}; expected one of ${Object.keys(EVENTS).join(", ")}`,
    );

  const rpcUrl = resolveRpcUrl(args.chainId, args.rpcUrl);
  const { airlock, factoryId } = resolveDefaults(
    args.chainId,
    args.event,
    args.airlock,
    args.factoryId,
  );

  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: 30_000, retryCount: 3 }),
  });

  const head = args.endBlock ?? (await client.getBlockNumber());
  let startBlock = args.startBlock;
  let startReason = "explicit --start-block";
  if (startBlock === undefined) {
    // The earliest-gap heuristic scans <schema>.token for DERC20 rows, which
    // only maps to children of the Create factory.
    const earliestGap =
      args.event === "create"
        ? findEarliestMissingBlock(
            args.databaseUrl,
            args.pondersyncSchema,
            args.schema,
            factoryId,
            args.chainId,
          )
        : 0n;
    if (earliestGap > 0n) {
      startBlock = earliestGap;
      startReason = `earliest gap (DERC20 token in ${args.schema}.token missing from factory ${factoryId})`;
    } else {
      const highest = findHighestKnownBlock(
        args.databaseUrl,
        args.pondersyncSchema,
        factoryId,
        args.chainId,
      );
      startBlock = highest + 1n;
      startReason = `max(factory_addresses.block_number) + 1 (no gaps detected)`;
    }
  }

  if (startBlock > head) {
    console.log(`Nothing to do: start_block ${startBlock} > head ${head}.`);
    return;
  }

  console.log(
    `Backfilling Airlock(${airlock}) ${args.event} logs on chain ${args.chainId}`,
  );
  console.log(`  range: blocks [${startBlock}, ${head}]  (start: ${startReason})`);
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

  const fetcher = (w) =>
    fetchLogsRange(client, airlock, event.selector, w.from, w.to);

  for await (const { item: window, result: logs } of orderedPrefetch(
    windows,
    fetcher,
    args.rpcConcurrency,
  )) {
    for (const log of logs) {
      const asset = extractChildAddress(log, event.child);
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
