#!/usr/bin/env node

/**
 * Orchestrates the 3-phase dhook seed double-count repair across chains, with a
 * per-chain checkpoint so it can be re-run incrementally as a staging indexer
 * backfills.
 *
 * Each run, per chain:
 *   phase 1  repair-dhook-seed-double-count.mjs   (rebuild position_ledger)
 *   phase 2  backfill-negative-reserves.mjs       (recompute reserves0/1)
 *   phase 3  recompute-dhook-dollar-liquidity.mjs (recompute dollarLiquidity)
 * scoped to pools created since the last checkpoint (or all pools on first run).
 *
 * Checkpoint semantics: pool.created_at is a block TIMESTAMP, and the checkpoint
 * stored per chain is max(created_at) over that chain's dhook/rehype pools AT THE
 * TIME OF THE RUN — i.e. the creation time of the newest pool the indexer had
 * ingested. Using that (rather than the chain head) is gap-free while the staging
 * indexer is behind head: pools it ingests later still have created_at > the
 * checkpoint and get picked up next run. The checkpoint only advances on a
 * successful --apply run; dry runs never advance it.
 *
 * State file (JSON): { "<chainId>": { lastCreatedAt, lastCreatedAtISO, updatedAt } }.
 * Delete it (or pass --full) to force a full run for all blocks.
 *
 * Usage:
 *   node scripts/run-dhook-repair.mjs --schema prod_1 --eth-price-usd 183900000000            # dry-run
 *   node scripts/run-dhook-repair.mjs --schema prod_1 --eth-price-usd 183900000000 --apply     # apply + checkpoint
 *   node scripts/run-dhook-repair.mjs --schema prod_1 --eth-price-usd 183900000000 --apply --full
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

// Blocks of extra head-room scanned before the checkpoint's block when limiting
// phase-1's on-chain log scan — makes the block resolution robust to equal
// timestamps / small reorgs. Cheap vs. the full history it skips.
const FROM_BLOCK_MARGIN = 50000n;

const DEFAULT_CHAINS = [4663, 8453];

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadDotEnv(join(REPO_ROOT, ".env"));
loadDotEnv(join(REPO_ROOT, ".env.local"));

function parseArgs(argv) {
  const args = {
    apply: false,
    full: false,
    schema: "prod_1",
    ethPriceUsd: undefined,
    stateFile: join(REPO_ROOT, ".dhook-repair-state.json"),
    databaseUrl: process.env.DATABASE_URL,
    chains: DEFAULT_CHAINS,
    batchSize: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--full") args.full = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${a}`);
      if (key === "schema") args.schema = value;
      else if (key === "eth-price-usd") args.ethPriceUsd = value; // pass through as string
      else if (key === "state-file") args.stateFile = value;
      else if (key === "database-url") args.databaseUrl = value;
      else if (key === "chains") args.chains = value.split(",").map((c) => Number(c.trim()));
      else if (key === "batch-size") args.batchSize = Number(value);
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-dhook-repair.mjs [options]

Runs the 3-phase dhook double-count repair across chains, checkpointing per chain
so it can be re-run incrementally as a staging indexer backfills.

Options:
  --schema <schema>      Ponder schema. Defaults to prod_1.
  --eth-price-usd <n>    ETH/USD in Chainlink 8-decimal form (e.g. 183900000000).
                         Required — passed to phase 3 for WETH-quoted pools.
  --chains <list>        Comma-separated chain ids. Defaults to 4663,8453.
  --batch-size <n>       Rows per write transaction, passed to every phase
                         (--apply-batch-size for repair/backfill, --batch-size for
                         recompute). Omitted => each script's own default (500).
  --state-file <path>    Checkpoint file. Defaults to <repo>/.dhook-repair-state.json.
  --database-url <url>   Postgres URL. Defaults to DATABASE_URL.
  --full                 Ignore the checkpoint and run for all blocks.
  --apply                Apply changes AND advance the checkpoint. Without it,
                         everything runs as a dry-run and the checkpoint is untouched.

Per-chain RPC comes from PONDER_RPC_URL_<chainId> (needed to bound phase-1's scan).
`);
}

// ── RPC helpers (raw JSON-RPC; no viem dependency) ──

async function rpc(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} failed: ${json.error.message}`);
  return json.result;
}

async function headBlock(rpcUrl) {
  return BigInt(await rpc(rpcUrl, "eth_blockNumber", []));
}

async function blockTimestamp(rpcUrl, blockNumber) {
  const b = await rpc(rpcUrl, "eth_getBlockByNumber", [`0x${BigInt(blockNumber).toString(16)}`, false]);
  if (!b) throw new Error(`Block ${blockNumber} not found`);
  return BigInt(b.timestamp);
}

// Smallest block whose timestamp >= targetTs (binary-search lower bound). Used,
// minus a margin, as phase-1's --from-block: every pool created at/after targetTs
// has a creation block >= this, so its ModifyLiquidity logs are all >= it.
async function blockForTimestamp(rpcUrl, targetTs) {
  let lo = 0n;
  let hi = await headBlock(rpcUrl);
  if (await blockTimestamp(rpcUrl, hi) < targetTs) return hi; // target beyond head
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (await blockTimestamp(rpcUrl, mid) < targetTs) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

// ── DB helper ──

function maxCreatedAt(databaseUrl, schema, chainId) {
  const sql = `select coalesce(max(created_at)::text, '') from ${schema}.pool
    where chain_id::numeric = ${Number(chainId)} and lower(type::text) in ('dhook','rehype')`;
  const out = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
  ).trim();
  return out === "" ? null : BigInt(out);
}

// ── Orchestration ──

function runPhase(script, phaseArgs) {
  const scriptPath = join(SCRIPT_DIR, script);
  console.log(`\n$ node scripts/${script} ${phaseArgs.join(" ")}`);
  execFileSync("node", [scriptPath, ...phaseArgs], { cwd: REPO_ROOT, stdio: "inherit" });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");
  if (!args.ethPriceUsd) throw new Error("Missing --eth-price-usd (required for phase 3)");

  const state = existsSync(args.stateFile) && !args.full
    ? JSON.parse(readFileSync(args.stateFile, "utf8"))
    : {};

  console.log(`Mode: ${args.apply ? "APPLY (advances checkpoint)" : "dry-run (checkpoint untouched)"}`);
  console.log(`Schema: ${args.schema} | Chains: ${args.chains.join(", ")} | State: ${args.stateFile}`);
  if (args.full) console.log("--full: ignoring any existing checkpoint (full run).");

  const summary = [];
  for (const chain of args.chains) {
    console.log(`\n================ chain ${chain} ================`);
    const rpcUrl = process.env[`PONDER_RPC_URL_${chain}`];
    if (!rpcUrl) { console.warn(`Skipping chain ${chain}: no PONDER_RPC_URL_${chain}`); summary.push([chain, "skipped (no RPC)"]); continue; }

    const prev = args.full ? undefined : state[String(chain)]?.lastCreatedAt;
    const afterArgs = prev !== undefined ? ["--after-created", String(prev)] : [];

    // Bound phase-1's log scan to blocks at/after the checkpoint (with margin).
    let fromArgs = [];
    if (prev !== undefined) {
      const b = await blockForTimestamp(rpcUrl, BigInt(prev));
      const fromBlock = b > FROM_BLOCK_MARGIN ? b - FROM_BLOCK_MARGIN : 0n;
      fromArgs = ["--from-block", String(fromBlock)];
      console.log(`Incremental: pools created_at >= ${prev}; phase-1 scan from block ${fromBlock}.`);
    } else {
      console.log("Full run for this chain (no checkpoint).");
    }
    const applyArgs = args.apply ? ["--apply"] : [];
    // Batch size flag differs per script: repair/backfill use --apply-batch-size,
    // recompute uses --batch-size. Omitted entirely when not set, so each script
    // keeps its own default.
    const applyBatchArgs = args.batchSize !== undefined ? ["--apply-batch-size", String(args.batchSize)] : [];
    const batchArgs = args.batchSize !== undefined ? ["--batch-size", String(args.batchSize)] : [];

    try {
      runPhase("repair-dhook-seed-double-count.mjs",
        ["--schema", args.schema, "--chain-id", String(chain), ...afterArgs, ...fromArgs, ...applyBatchArgs, ...applyArgs]);
      runPhase("backfill-negative-reserves.mjs",
        ["--schema", args.schema, "--table", "pool", "--chain-id", String(chain),
         "--types", "dhook,rehype", "--all", ...afterArgs, ...applyBatchArgs, ...applyArgs]);
      runPhase("recompute-dhook-dollar-liquidity.mjs",
        ["--schema", args.schema, "--chain-id", String(chain), "--all",
         "--eth-price-usd", String(args.ethPriceUsd), ...afterArgs, ...batchArgs, ...applyArgs]);
    } catch (e) {
      console.error(`\nchain ${chain}: a phase failed — checkpoint NOT advanced. ${e.message}`);
      summary.push([chain, "FAILED (checkpoint unchanged)"]);
      continue;
    }

    if (args.apply) {
      const newCp = maxCreatedAt(args.databaseUrl, args.schema, chain);
      if (newCp !== null) {
        state[String(chain)] = {
          lastCreatedAt: String(newCp),
          lastCreatedAtISO: new Date(Number(newCp) * 1000).toISOString(),
          updatedAt: new Date().toISOString(),
        };
        writeFileSync(args.stateFile, JSON.stringify(state, null, 2) + "\n");
        console.log(`chain ${chain}: checkpoint -> created_at ${newCp} (${state[String(chain)].lastCreatedAtISO})`);
        summary.push([chain, `ok, checkpoint ${newCp}`]);
      } else {
        summary.push([chain, "ok, no pools (checkpoint unchanged)"]);
      }
    } else {
      summary.push([chain, "ok (dry-run)"]);
    }
  }

  console.log("\n================ summary ================");
  for (const [chain, status] of summary) console.log(`  chain ${chain}: ${status}`);
  if (!args.apply) console.log("\nDry-run — nothing written, checkpoint untouched. Re-run with --apply.");
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exitCode = 1;
});
