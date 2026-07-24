#!/usr/bin/env node

// Rebuild user/user_asset/holder_count for a chain whose DERC20 Transfer logs
// were never stored, by sweeping the chain's Transfer logs directly from RPC
// and computing balances in flight.
//
// Context (robinhood chain 4663, 2026-07): ponder's realtime sync only stores
// logs that MATCH a filter. When factory child addresses are lost from
// ponder_sync.factory_addresses, every Transfer log for those children is
// discarded, and because the checkpoint stays at head across restarts the
// historical sync never re-fetches the range unfiltered. Result: ~300M
// Transfer logs that were never persisted, and user_asset balances frozen at
// whatever the last matched transfer was.
//
// Backfilling those logs into ponder_sync.logs would cost 150-200GB. This
// script skips the raw logs entirely: it streams the chain once, accumulates
// per (token, holder) balance deltas, stages them, and writes only the final
// aggregated rows.
//
// Phases (--phase, default all):
//   sweep      RPC -> in-memory deltas -> staging table (resumable)
//   aggregate  staging -> aggregated balance/user tables (in-DB)
//   write      aggregated tables -> prod schema (batched; needs --apply)
//   reconcile  write only the pairs that moved since `write` (needs --apply)
//   counts     recompute token.holder_count / pool.holder_count
//
// CONSISTENCY: the write phase sets ABSOLUTE balances as of the sweep's end
// block, while live indexing applies DELTAS on top of whatever the row holds.
// A row written while the indexer is running therefore loses anything indexed
// between the sweep and the write.
//
// The two-pass sequence keeps the indexer stopped for seconds instead of the
// whole write. The bulk write runs live and can only be wrong for pairs that
// traded during it; those pairs are exactly the ones the catch-up sweep sees,
// so re-aggregating and writing just the rows whose balance moved is
// equivalent to doing the whole write offline:
//   1. --phase sweep                 (live, long)
//   2. --phase aggregate             (live; verify against staging here)
//   3. --phase write --apply         (live; bulk write + records a snapshot)
//   4. stop the indexer; note its checkpoint block C
//   5. --phase sweep --end-block C   (seconds; catch-up deltas)
//   6. --phase reconcile --apply     (writes only the changed pairs)
//   7. restart the indexer
//   8. --phase counts --apply        (live, afterwards)
//
// Running steps 4-6 as a single offline write (--phase all) is also correct,
// just slower to be stopped for.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
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
  4663: ["PONDER_RPC_URL_4663", "ROBINHOOD_RPC"],
  8453: ["PONDER_RPC_URL_8453", "BASE_RPC", "BASE_RPC_URL"],
  57073: ["PONDER_RPC_URL_57073", "INK_RPC"],
};

const FACTORY_ID_BY_CHAIN = {
  8453: 640791,
  4663: 827059,
};

const START_BLOCK_BY_CHAIN = {
  4663: 367349,
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
    phase: "all",
    reset: false,
    chainId: 4663,
    factoryId: undefined,
    schema: undefined,
    pondersyncSchema: "ponder_sync",
    stagingSchema: "backfill_staging",
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    startBlock: undefined,
    endBlock: undefined,
    windowSize: 200,
    rpcConcurrency: 8,
    flushPairs: 3_000_000,
    writeBatch: 500_000,
    tsStride: 50,
    checkpoint: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--reset") args.reset = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`Missing value for ${a}`);
      if (key === "database-url") args.databaseUrl = v;
      else if (key === "rpc-url") args.rpcUrl = v;
      else if (key === "phase") args.phase = v;
      else if (key === "chain-id") args.chainId = Number(v);
      else if (key === "factory-id") args.factoryId = Number(v);
      else if (key === "schema") args.schema = v;
      else if (key === "ponder-sync-schema") args.pondersyncSchema = v;
      else if (key === "staging-schema") args.stagingSchema = v;
      else if (key === "start-block") args.startBlock = BigInt(v);
      else if (key === "end-block") args.endBlock = BigInt(v);
      else if (key === "window-size") args.windowSize = Number(v);
      else if (key === "rpc-concurrency") args.rpcConcurrency = Number(v);
      else if (key === "flush-pairs") args.flushPairs = Number(v);
      else if (key === "write-batch") args.writeBatch = Number(v);
      else if (key === "ts-stride") args.tsStride = Number(v);
      else if (key === "checkpoint") args.checkpoint = resolve(v);
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (args.help) return args;

  const phases = ["all", "sweep", "aggregate", "write", "reconcile", "counts"];
  if (!phases.includes(args.phase))
    throw new Error(`--phase must be one of ${phases.join(", ")}`);
  if (!args.databaseUrl) throw new Error("Missing DATABASE_URL");
  if (!args.schema)
    throw new Error(
      "Missing required --schema (the prod schema this deployment writes, e.g. prod_2)",
    );
  args.factoryId ??= FACTORY_ID_BY_CHAIN[args.chainId];
  if (args.factoryId === undefined)
    throw new Error(`No --factory-id and no default for chain ${args.chainId}`);
  args.checkpoint ??= resolve(
    process.cwd(),
    `rebuild-transfer-balances.${args.chainId}.checkpoint.json`,
  );
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rebuild-transfer-balances.mjs --schema prod_2 [options]

Rebuilds user_asset / user / holder_count for a chain whose DERC20 Transfer
logs were never persisted, by sweeping Transfer logs from RPC and computing
balances in flight. Raw logs are NOT written to ponder_sync.logs.

Phases:
  --phase sweep       RPC sweep -> staging deltas (resumable via checkpoint)
  --phase aggregate   staging deltas -> aggregated balances (in-DB)
  --phase write       aggregated balances -> <schema> (requires --apply)
  --phase reconcile   re-aggregate with catch-up deltas and write ONLY the
                      pairs whose balance moved since the last write
                      (requires --apply)
  --phase counts      recompute token/pool holder_count (requires --apply)
  --phase all         sweep + aggregate + write + counts (default)

Low-downtime sequence (indexer stopped only for steps 4-6):
  1. --phase sweep                      (live, long)
  2. --phase aggregate                  (live; verify against staging here)
  3. --phase write --apply              (live; bulk write, records a snapshot)
  4. stop the indexer, note checkpoint C
  5. --phase sweep --end-block <C>      (seconds)
  6. --phase reconcile --apply          (writes only the pairs that moved)
  7. restart the indexer
  8. --phase counts --apply             (live, afterwards)

Options:
  --schema <name>            REQUIRED prod schema (e.g. prod_2).
  --chain-id <id>            EVM chain id. Default 4663.
  --factory-id <n>           ponder_sync factory id for the DERC20 asset
                             factory. Default per-chain (4663 -> 827059).
  --rpc-url <url>            RPC URL. Default \$PONDER_RPC_URL_<chainid>.
                             Use a private endpoint; this makes ~40k requests.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --start-block <n>          Sweep from. Default: checkpoint, else the chain's
                             configured start block.
  --end-block <n>            Sweep to. Default: current head.
  --window-size <n>          Blocks per eth_getLogs. Default 200 (chain 4663
                             averages ~20 Transfer logs/block, peaking near 45,
                             so 200 stays under a 10k-log cap). Windows that
                             exceed the provider's cap are split automatically.
  --rpc-concurrency <n>      Windows in flight. Default 8.
  --flush-pairs <n>          Flush in-memory deltas to staging once this many
                             (token, holder) pairs are held. Default 3000000
                             (~700MB). Run node with --max-old-space-size=4096.
  --write-batch <n>          Rows per prod write batch. Default 500000.
  --ts-stride <n>            Sample every Nth block header from
                             ponder_sync.blocks to build the block->timestamp
                             interpolator. Default 50 (<=5s error on a 10
                             block/s chain). 1 = exact where headers exist.
  --staging-schema <name>    Scratch schema for deltas. Default
                             backfill_staging. Safe to drop afterwards.
  --checkpoint <path>        Sweep checkpoint JSON. Default
                             ./rebuild-transfer-balances.<chainid>.checkpoint.json
  --reset                    Drop staging tables + checkpoint, then start over.
  --apply                    Required for the write/counts phases. Sweep and
                             aggregate only ever touch the staging schema.

Consistency: the write phase sets ABSOLUTE balances as of the sweep end block,
while live indexing applies deltas on top of existing rows. Stop the indexer
before the write phase, sweep the small catch-up range up to its checkpoint,
write, then restart it. See the header comment for the exact sequence.
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

function psqlExec(databaseUrl, sql) {
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function psqlScalar(databaseUrl, sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
  ).trim();
}

function psqlRowsTsv(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );
  const out = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    out.push(line.split("\t"));
  }
  return out;
}

// COPY is dramatically faster than multi-row INSERT for the staging flushes,
// which move tens of millions of rows over the course of a full sweep.
function psqlCopy(databaseUrl, table, columns, tsvBody) {
  const input = `\\set ON_ERROR_STOP on\nCOPY ${table} (${columns.join(", ")}) FROM STDIN;\n${tsvBody}\\.\n`;
  const res = spawnSync("psql", [databaseUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (res.status !== 0)
    throw new Error(`COPY into ${table} failed with status ${res.status}`);
}

////////////////////////////////////////////////////////////////////////////////
// block -> timestamp
////////////////////////////////////////////////////////////////////////////////

// ponder_sync.blocks only holds headers the indexer actually fetched, so it
// cannot answer every block. We load a strided sample and interpolate: on a
// ~10 block/s chain a stride of 50 bounds the error at a few seconds, which is
// well inside the meaning of created_at / last_interaction.
function buildTimestampIndex(args, fromBlock, toBlock) {
  // Scoped to the range being swept: `number % stride` cannot use an index, so
  // an unbounded scan costs a full pass over the blocks table. Bounding it by
  // block number keeps the planner on the (chain_id, number) index, which is
  // what makes the catch-up sweep's startup a couple of seconds instead of a
  // couple of minutes — the difference matters because the catch-up runs
  // inside the indexer-stopped window.
  const pad = BigInt(Math.max(1, Number(args.tsStride)) * 8);
  const lo = fromBlock > pad ? fromBlock - pad : 0n;
  const hi = toBlock + pad;
  const query = (stride) => `
select number::text || E'\\t' || timestamp::text
from ${args.pondersyncSchema}.blocks
where chain_id = ${Number(args.chainId)}
  and number between ${lo} and ${hi}
  and (number % ${Math.max(1, stride)}) = 0
order by number;`;
  let rows = psqlRowsTsv(args.databaseUrl, query(Number(args.tsStride)));
  // A short range may contain fewer than two strided samples; fall back to
  // every header we have before giving up.
  if (rows.length < 2) rows = psqlRowsTsv(args.databaseUrl, query(1));
  if (rows.length < 2)
    throw new Error(
      `Not enough block headers in ${args.pondersyncSchema}.blocks for chain ${args.chainId} in [${lo}, ${hi}] to build a timestamp index`,
    );
  const numbers = new Float64Array(rows.length);
  const times = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    numbers[i] = Number(rows[i][0]);
    times[i] = Number(rows[i][1]);
  }
  console.log(
    `Timestamp index: ${rows.length} samples, blocks ${numbers[0]}..${numbers[numbers.length - 1]}`,
  );
  return { numbers, times };
}

function timestampFor(index, block) {
  const { numbers, times } = index;
  const n = numbers.length;
  if (block <= numbers[0]) return Math.round(times[0]);
  if (block >= numbers[n - 1]) return Math.round(times[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (numbers[mid] <= block) lo = mid;
    else hi = mid;
  }
  const span = numbers[hi] - numbers[lo];
  if (span <= 0) return Math.round(times[lo]);
  const frac = (block - numbers[lo]) / span;
  return Math.round(times[lo] + frac * (times[hi] - times[lo]));
}

////////////////////////////////////////////////////////////////////////////////
// staging schema
////////////////////////////////////////////////////////////////////////////////

function stagingNames(args) {
  const s = args.stagingSchema;
  const c = Number(args.chainId);
  return {
    delta: `${s}.transfer_delta_${c}`,
    balance: `${s}.balance_final_${c}`,
    user: `${s}.user_final_${c}`,
    // Snapshot of what the write phase last pushed to prod, so the reconcile
    // phase can write only the pairs that moved since.
    pass1: `${s}.balance_pass1_${c}`,
    diff: `${s}.balance_diff_${c}`,
  };
}

function ensureStaging(args) {
  const t = stagingNames(args);
  psqlExec(
    args.databaseUrl,
    `
create schema if not exists ${args.stagingSchema};
create unlogged table if not exists ${t.delta} (
  token text not null,
  holder text not null,
  delta numeric not null,
  first_ts bigint not null,
  last_ts bigint not null
);
`,
  );
}

function resetStaging(args) {
  const t = stagingNames(args);
  psqlExec(
    args.databaseUrl,
    `drop table if exists ${t.delta}; drop table if exists ${t.balance}; drop table if exists ${t.user};`,
  );
  if (existsSync(args.checkpoint)) {
    writeFileSync(args.checkpoint, JSON.stringify({ version: 1 }, null, 2));
  }
  console.log("Reset: staging tables dropped, checkpoint cleared.");
}

////////////////////////////////////////////////////////////////////////////////
// checkpoint
////////////////////////////////////////////////////////////////////////////////

function loadCheckpoint(path) {
  if (!existsSync(path)) return { version: 1 };
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return { version: 1 };
  try {
    return JSON.parse(raw);
  } catch {
    return { version: 1 };
  }
}

function saveCheckpoint(path, data) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

////////////////////////////////////////////////////////////////////////////////
// sweep
////////////////////////////////////////////////////////////////////////////////

function loadChildAddresses(args) {
  const sql = `
select lower(address)
from ${args.pondersyncSchema}.factory_addresses
where chain_id = ${Number(args.chainId)} and factory_id = ${Number(args.factoryId)};`;
  const rows = psqlRowsTsv(args.databaseUrl, sql);
  const set = new Set();
  for (const [addr] of rows) if (addr) set.add(addr);
  console.log(`Loaded ${set.size} child address(es) for factory ${args.factoryId}.`);
  if (set.size === 0)
    throw new Error(
      "No child addresses found — run backfill-airlock-creates.mjs first",
    );
  return set;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTooManyLogs(err) {
  const s = `${err?.details ?? ""} ${err?.message ?? ""}`.toLowerCase();
  return (
    s.includes("exceeds limit") ||
    s.includes("too big") ||
    s.includes("too many results") ||
    s.includes("query returned more than") ||
    s.includes("response size exceeded")
  );
}

function isRateLimited(err) {
  const s = `${err?.details ?? ""} ${err?.message ?? ""} ${err?.status ?? ""}`;
  return s.includes("429") || s.toLowerCase().includes("too many requests");
}

// Fetch one window, splitting recursively when the provider refuses the range.
// Returns the window's logs in block order.
async function fetchWindow(client, from, to, depth = 0) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.request({
        method: "eth_getLogs",
        params: [
          {
            topics: [TRANSFER_SELECTOR],
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
          },
        ],
      });
    } catch (err) {
      if (isTooManyLogs(err) && to > from && depth < 24) {
        const mid = from + (to - from) / 2n;
        const left = await fetchWindow(client, from, mid, depth + 1);
        const right = await fetchWindow(client, mid + 1n, to, depth + 1);
        return left.concat(right);
      }
      if (attempt >= 7) throw err;
      await sleep((isRateLimited(err) ? 2000 : 500) * (attempt + 1));
    }
  }
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

function makeWindows(fromBlock, toBlock, size) {
  const sz = BigInt(size);
  const out = [];
  for (let f = fromBlock; f <= toBlock; f += sz) {
    const t = f + sz - 1n > toBlock ? toBlock : f + sz - 1n;
    out.push({ from: f, to: t });
  }
  return out;
}

async function runSweep(args) {
  ensureStaging(args);
  const t = stagingNames(args);
  const checkpoint = loadCheckpoint(args.checkpoint);
  const children = loadChildAddresses(args);

  const rpcUrl = resolveRpcUrl(args.chainId, args.rpcUrl);
  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: 60_000, retryCount: 0 }),
  });

  const head = args.endBlock ?? (await client.getBlockNumber());
  let startBlock = args.startBlock;
  // Staged deltas are SUMmed by the aggregate phase, so sweeping a range that
  // is already staged would silently double every balance in it.
  if (
    startBlock !== undefined &&
    checkpoint.covered_to !== undefined &&
    startBlock <= BigInt(checkpoint.covered_to)
  ) {
    throw new Error(
      `--start-block ${startBlock} is at or below the already-swept covered_to=${checkpoint.covered_to}; ` +
        `re-staging it would double-count those transfers. Omit --start-block to resume, or pass --reset to start over.`,
    );
  }
  if (startBlock === undefined) {
    if (checkpoint.covered_to) {
      startBlock = BigInt(checkpoint.covered_to) + 1n;
      console.log(`Resuming from checkpoint covered_to=${checkpoint.covered_to}`);
    } else {
      startBlock = BigInt(START_BLOCK_BY_CHAIN[args.chainId] ?? 0);
    }
  }
  if (startBlock > head) {
    console.log(`Nothing to sweep: start ${startBlock} > end ${head}.`);
    return;
  }
  const tsIndex = buildTimestampIndex(args, startBlock, head);

  console.log(
    `Sweeping Transfer logs on chain ${args.chainId}: blocks [${startBlock}, ${head}]`,
  );
  console.log(
    `  window=${args.windowSize}  rpc_concurrency=${args.rpcConcurrency}  flush_pairs=${args.flushPairs}`,
  );

  // token -> holder -> [delta, firstBlock, lastBlock]
  const acc = new Map();
  let pairCount = 0;
  let logsSeen = 0;
  let logsMatched = 0;
  let flushes = 0;
  let rowsStaged = 0;
  let pendingCoveredTo = startBlock - 1n;
  let lastReport = Date.now();
  const t0 = Date.now();

  const flush = () => {
    if (pairCount === 0) {
      if (pendingCoveredTo >= startBlock) {
        checkpoint.covered_to = pendingCoveredTo.toString();
        saveCheckpoint(args.checkpoint, checkpoint);
      }
      return;
    }
    const parts = [];
    for (const [token, holders] of acc) {
      for (const [holder, v] of holders) {
        parts.push(
          `${token}\t${holder}\t${v[0].toString()}\t${timestampFor(tsIndex, v[1])}\t${timestampFor(tsIndex, v[2])}\n`,
        );
      }
    }
    psqlCopy(
      args.databaseUrl,
      t.delta,
      ["token", "holder", "delta", "first_ts", "last_ts"],
      parts.join(""),
    );
    rowsStaged += parts.length;
    flushes++;
    acc.clear();
    pairCount = 0;
    // Only advance the checkpoint once the staged rows are durable, so a crash
    // re-sweeps the un-flushed tail instead of losing or double-counting it.
    checkpoint.covered_to = pendingCoveredTo.toString();
    saveCheckpoint(args.checkpoint, checkpoint);
    console.log(
      `  [flush ${flushes}] staged ${parts.length} pair-rows (total ${rowsStaged}), covered_to=${checkpoint.covered_to}`,
    );
  };

  const windows = makeWindows(startBlock, head, args.windowSize);
  console.log(`  windows=${windows.length}`);

  const fetcher = (w) => fetchWindow(client, w.from, w.to);

  let shuttingDown = false;
  const onSigint = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\nSIGINT — flushing staged deltas before exit...");
    try {
      flush();
    } catch (err) {
      console.error("flush on exit failed:", err?.message ?? err);
    }
    process.exit(130);
  };
  process.on("SIGINT", onSigint);

  for await (const { item: window, result: logs } of orderedPrefetch(
    windows,
    fetcher,
    args.rpcConcurrency,
  )) {
    for (const log of logs) {
      logsSeen++;
      // ERC-721 shares this topic0 but indexes tokenId as a 4th topic; only
      // ERC-20 Transfers (3 topics, value in data) carry balances.
      if (!log.topics || log.topics.length !== 3) continue;
      if (!log.data || log.data === "0x") continue;
      const address = lowerHex(log.address);
      if (!children.has(address)) continue;

      const from = topicToAddress(log.topics[1]);
      const to = topicToAddress(log.topics[2]);
      let value;
      try {
        value = BigInt(log.data.length > 66 ? log.data.slice(0, 66) : log.data);
      } catch {
        continue;
      }
      const block = Number(BigInt(log.blockNumber));
      logsMatched++;

      let holders = acc.get(address);
      if (holders === undefined) {
        holders = new Map();
        acc.set(address, holders);
      }
      // Mirrors backfill-derc20-materialize.mjs: the zero address is not
      // tracked as a holder, so a token's rows sum to its total supply.
      if (from !== ZERO_ADDRESS) {
        const cur = holders.get(from);
        if (cur === undefined) {
          holders.set(from, [-value, block, block]);
          pairCount++;
        } else {
          cur[0] -= value;
          if (block < cur[1]) cur[1] = block;
          if (block > cur[2]) cur[2] = block;
        }
      }
      if (to !== ZERO_ADDRESS) {
        const cur = holders.get(to);
        if (cur === undefined) {
          holders.set(to, [value, block, block]);
          pairCount++;
        } else {
          cur[0] += value;
          if (block < cur[1]) cur[1] = block;
          if (block > cur[2]) cur[2] = block;
        }
      }
    }

    pendingCoveredTo = window.to;
    if (pairCount >= args.flushPairs) flush();

    if (Date.now() - lastReport > 5000) {
      const done = Number(window.to - startBlock + 1n);
      const total = Number(head - startBlock + 1n);
      const pct = ((done / total) * 100).toFixed(2);
      const rate = done / ((Date.now() - t0) / 1000);
      const etaMin = rate > 0 ? (total - done) / rate / 60 : 0;
      console.log(
        `  block=${window.to} ${pct}%  logs=${logsSeen} matched=${logsMatched} pairs=${pairCount} staged=${rowsStaged}  ${rate.toFixed(0)} blk/s  eta=${etaMin.toFixed(0)}m`,
      );
      lastReport = Date.now();
    }
  }

  flush();
  process.off("SIGINT", onSigint);
  checkpoint.covered_to = head.toString();
  checkpoint.swept_at = new Date().toISOString();
  saveCheckpoint(args.checkpoint, checkpoint);
  console.log(
    `Sweep done. logs_seen=${logsSeen} logs_matched=${logsMatched} pair_rows_staged=${rowsStaged} flushes=${flushes}`,
  );
}

////////////////////////////////////////////////////////////////////////////////
// aggregate
////////////////////////////////////////////////////////////////////////////////

function runAggregate(args, quiet = false) {
  const t = stagingNames(args);
  if (!quiet)
    console.log("Aggregating staged deltas (this is a large in-DB GROUP BY)...");
  psqlExec(
    args.databaseUrl,
    `
drop table if exists ${t.balance};
create unlogged table ${t.balance} as
select token,
       holder,
       sum(delta)     as balance,
       min(first_ts)  as created_at,
       max(last_ts)   as last_interaction
from ${t.delta}
group by token, holder;

alter table ${t.balance} add column rn bigint;
update ${t.balance} set rn = s.rn
from (select ctid, row_number() over () as rn from ${t.balance}) s
where ${t.balance}.ctid = s.ctid;
create index on ${t.balance} (rn);

drop table if exists ${t.user};
create unlogged table ${t.user} as
select holder                as address,
       min(created_at)       as created_at,
       max(last_interaction) as last_seen_at
from ${t.balance}
group by holder;

alter table ${t.user} add column rn bigint;
update ${t.user} set rn = s.rn
from (select ctid, row_number() over () as rn from ${t.user}) s
where ${t.user}.ctid = s.ctid;
create index on ${t.user} (rn);
`,
  );
  const balances = psqlScalar(args.databaseUrl, `select count(*) from ${t.balance};`);
  const users = psqlScalar(args.databaseUrl, `select count(*) from ${t.user};`);
  const tokens = psqlScalar(
    args.databaseUrl,
    `select count(distinct token) from ${t.balance};`,
  );
  if (quiet) return;
  console.log(
    `Aggregate done. balance rows=${balances} distinct users=${users} distinct tokens=${tokens}`,
  );
}

////////////////////////////////////////////////////////////////////////////////
// write
////////////////////////////////////////////////////////////////////////////////

function runWrite(args) {
  if (!args.apply) {
    console.log("Dry-run: --phase write requires --apply. Nothing written.");
    return;
  }
  const t = stagingNames(args);
  const schema = args.schema;
  const chainId = Number(args.chainId);

  const maxBalanceRn = Number(
    psqlScalar(args.databaseUrl, `select coalesce(max(rn), 0) from ${t.balance};`),
  );
  const maxUserRn = Number(
    psqlScalar(args.databaseUrl, `select coalesce(max(rn), 0) from ${t.user};`),
  );
  const batch = Number(args.writeBatch);

  console.log(
    `Writing ${maxUserRn} user rows and ${maxBalanceRn} user_asset rows into ${schema} in batches of ${batch}...`,
  );

  // Batched so each ACCESS EXCLUSIVE lock (from DISABLE TRIGGER) is short —
  // other indexers write these tables concurrently. Data never leaves the DB.
  for (let lo = 1; lo <= maxUserRn; lo += batch) {
    const hi = lo + batch - 1;
    psqlExec(
      args.databaseUrl,
      `
begin;
alter table ${schema}."user" disable trigger user;
insert into ${schema}."user" (address, chain_id, created_at, last_seen_at)
select address, ${chainId}, created_at, last_seen_at
from ${t.user} where rn between ${lo} and ${hi}
on conflict (address, chain_id) do update set
  last_seen_at = greatest(${schema}."user".last_seen_at, excluded.last_seen_at);
alter table ${schema}."user" enable trigger user;
commit;
`,
    );
    console.log(`  users ${Math.min(hi, maxUserRn)}/${maxUserRn}`);
  }

  for (let lo = 1; lo <= maxBalanceRn; lo += batch) {
    const hi = lo + batch - 1;
    psqlExec(
      args.databaseUrl,
      `
begin;
alter table ${schema}.user_asset disable trigger user;
insert into ${schema}.user_asset (chain_id, user_id, asset_id, balance, created_at, last_interaction)
select ${chainId}, holder, token, balance, created_at, last_interaction
from ${t.balance} where rn between ${lo} and ${hi}
on conflict (user_id, asset_id, chain_id) do update set
  balance = excluded.balance,
  last_interaction = greatest(${schema}.user_asset.last_interaction, excluded.last_interaction);
alter table ${schema}.user_asset enable trigger user;
commit;
`,
    );
    console.log(`  user_assets ${Math.min(hi, maxBalanceRn)}/${maxBalanceRn}`);
  }

  // Record exactly what prod now holds, so a later reconcile can write only
  // the pairs that changed instead of all of them.
  psqlExec(
    args.databaseUrl,
    `
drop table if exists ${t.pass1};
create unlogged table ${t.pass1} as
select token, holder, balance, created_at, last_interaction from ${t.balance};
`,
  );
  console.log("Write done. Snapshot recorded for reconcile.");
}

////////////////////////////////////////////////////////////////////////////////
// reconcile
////////////////////////////////////////////////////////////////////////////////

// Second pass of the low-downtime write. The bulk write runs while the indexer
// is live, which clobbers deltas it applies during that write — but only for
// pairs that traded in the window. Those pairs are exactly the ones appearing
// in the catch-up sweep, so re-aggregating and writing just the rows whose
// balance moved is equivalent to the single-pass write, with a stopped window
// measured in seconds rather than minutes.
function runReconcile(args) {
  const t = stagingNames(args);
  const schema = args.schema;
  const chainId = Number(args.chainId);

  console.log("Re-aggregating with catch-up deltas...");
  runAggregate(args, true);

  // Diff against what prod ACTUALLY holds, not against the pass-1 snapshot.
  // The snapshot records what we wrote, but live indexing mutates those rows
  // between the bulk write and this reconcile — so a pair whose balance at the
  // catch-up block happens to equal its balance at the bulk-write block (e.g.
  // bought and sold the same amount across the window) looks "unchanged"
  // against the snapshot while its prod row is actually wrong.
  //
  // With the indexer stopped at checkpoint C and the sweep run to C, every
  // pair's correct value IS balance_final, so any difference is an error.
  // Pairs present in prod but absent from balance_final are left alone: they
  // belong to tokens outside this sweep's child set (e.g. launched mid-sweep)
  // and zeroing them would destroy correct data.
  psqlExec(
    args.databaseUrl,
    `
drop table if exists ${t.diff};
create unlogged table ${t.diff} as
select b.token, b.holder, b.balance, b.created_at, b.last_interaction
from ${t.balance} b
left join ${schema}.user_asset ua
  on ua.chain_id = ${chainId}
 and ua.user_id  = b.holder
 and ua.asset_id = b.token
where ua.user_id is null
   or ua.balance is distinct from b.balance;

alter table ${t.diff} add column rn bigint;
update ${t.diff} set rn = s.rn
from (select ctid, row_number() over () as rn from ${t.diff}) s
where ${t.diff}.ctid = s.ctid;
create index on ${t.diff} (rn);
`,
  );

  const diffCount = Number(
    psqlScalar(args.databaseUrl, `select count(*) from ${t.diff};`),
  );
  console.log(`Rows in prod disagreeing with the rebuilt balances: ${diffCount}`);
  if (diffCount === 0) {
    console.log("Nothing to reconcile.");
    return;
  }
  if (!args.apply) {
    console.log("Dry-run: --phase reconcile requires --apply. Nothing written.");
    return;
  }

  const batch = Number(args.writeBatch);
  const maxRn = Number(
    psqlScalar(args.databaseUrl, `select coalesce(max(rn), 0) from ${t.diff};`),
  );
  for (let lo = 1; lo <= maxRn; lo += batch) {
    const hi = lo + batch - 1;
    psqlExec(
      args.databaseUrl,
      `
begin;
alter table ${schema}."user" disable trigger user;
insert into ${schema}."user" (address, chain_id, created_at, last_seen_at)
select holder, ${chainId}, min(created_at), max(last_interaction)
from ${t.diff} where rn between ${lo} and ${hi}
group by holder
on conflict (address, chain_id) do update set
  last_seen_at = greatest(${schema}."user".last_seen_at, excluded.last_seen_at);
alter table ${schema}."user" enable trigger user;

alter table ${schema}.user_asset disable trigger user;
insert into ${schema}.user_asset (chain_id, user_id, asset_id, balance, created_at, last_interaction)
select ${chainId}, holder, token, balance, created_at, last_interaction
from ${t.diff} where rn between ${lo} and ${hi}
on conflict (user_id, asset_id, chain_id) do update set
  balance = excluded.balance,
  last_interaction = greatest(${schema}.user_asset.last_interaction, excluded.last_interaction);
alter table ${schema}.user_asset enable trigger user;
commit;
`,
    );
    console.log(`  reconciled ${Math.min(hi, maxRn)}/${maxRn}`);
  }

  // Refresh the snapshot so a repeated reconcile is a no-op rather than a
  // rewrite of the same rows.
  psqlExec(
    args.databaseUrl,
    `
drop table if exists ${t.pass1};
create unlogged table ${t.pass1} as
select token, holder, balance, created_at, last_interaction from ${t.balance};
`,
  );
  console.log("Reconcile done.");
}

////////////////////////////////////////////////////////////////////////////////
// holder counts
////////////////////////////////////////////////////////////////////////////////

function runCounts(args) {
  if (!args.apply) {
    console.log("Dry-run: --phase counts requires --apply. Nothing written.");
    return;
  }
  const schema = args.schema;
  const chainId = Number(args.chainId);
  console.log("Recomputing holder_count for token and pool...");
  psqlExec(
    args.databaseUrl,
    `
begin;
alter table ${schema}.token disable trigger user;
with counts as (
  select asset_id, count(*)::int as n
  from ${schema}.user_asset
  where chain_id = ${chainId} and balance > 0
  group by asset_id
)
update ${schema}.token t
set holder_count = c.n
from counts c
where t.chain_id = ${chainId} and lower(t.address) = lower(c.asset_id)
  and t.holder_count is distinct from c.n;
alter table ${schema}.token enable trigger user;
commit;

begin;
alter table ${schema}.pool disable trigger user;
with counts as (
  select asset_id, count(*)::int as n
  from ${schema}.user_asset
  where chain_id = ${chainId} and balance > 0
  group by asset_id
)
update ${schema}.pool p
set holder_count = c.n
from counts c
join ${schema}.token tk
  on tk.chain_id = ${chainId} and lower(tk.address) = lower(c.asset_id)
where p.chain_id = ${chainId} and lower(p.address) = lower(tk.pool)
  and p.holder_count is distinct from c.n;
alter table ${schema}.pool enable trigger user;
commit;
`,
  );
  console.log("Counts done.");
}

////////////////////////////////////////////////////////////////////////////////

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  if (args.reset) resetStaging(args);

  const phase = args.phase;
  if (phase === "all" || phase === "sweep") await runSweep(args);
  if (phase === "all" || phase === "aggregate") runAggregate(args);
  if (phase === "all" || phase === "write") runWrite(args);
  if (phase === "reconcile") runReconcile(args);
  if (phase === "all" || phase === "counts") runCounts(args);

  if (phase === "all" && !args.apply)
    console.log("\nDry-run: write/counts phases skipped. Re-run with --apply.");
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
