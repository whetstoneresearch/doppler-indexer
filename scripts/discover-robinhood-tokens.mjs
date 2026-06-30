#!/usr/bin/env node

// Discover the numeraire tokens (WETH / USDG / USDC / USDT / native ETH) in use
// on the Robinhood chain by looking at what the Uniswap contracts have actually
// deployed:
//   - V4 PoolManager `Initialize` events  -> currency0 / currency1
//   - LockableUniswapV3Initializer `Create` events -> indexed numeraire
// Then resolve each token's symbol/name/decimals and rank by frequency
// (numeraires recur across many pools; Doppler assets appear once).
//
// Usage:
//   node scripts/discover-robinhood-tokens.mjs [rpcUrl]
// RPC: CLI arg -> PONDER_RPC_URL_4663 -> ROBINHOOD_RPC

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http, getAddress, zeroAddress } from "viem";

const START_BLOCK = 367349n;
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const LOCKABLE_V3_INITIALIZER = "0xde8886a0019ea060b8378ee37b8a23b8117f29a3";
const UNIVERSAL_ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904";
const LOG_CHUNK = 9_000n;

const INITIALIZE_EVENT = {
  type: "event",
  name: "Initialize",
  inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "currency0", type: "address", indexed: true },
    { name: "currency1", type: "address", indexed: true },
    { name: "fee", type: "uint24", indexed: false },
    { name: "tickSpacing", type: "int24", indexed: false },
    { name: "hooks", type: "address", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "tick", type: "int24", indexed: false },
  ],
  anonymous: false,
};

const V3_CREATE_EVENT = {
  type: "event",
  name: "Create",
  inputs: [
    { name: "poolOrHook", type: "address", indexed: true },
    { name: "asset", type: "address", indexed: true },
    { name: "numeraire", type: "address", indexed: true },
  ],
  anonymous: false,
};

const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

const WETH9_ABI = [
  { type: "function", name: "WETH9", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

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

const rpcUrl =
  process.argv[2] || process.env.PONDER_RPC_URL_4663 || process.env.ROBINHOOD_RPC;
if (!rpcUrl) {
  console.error("No RPC URL. Pass as arg or set PONDER_RPC_URL_4663 / ROBINHOOD_RPC.");
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpcUrl) });

async function scanLogs(address, event, onLog) {
  const latest = await client.getBlockNumber();
  let total = 0;
  for (let from = START_BLOCK; from <= latest; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n > latest ? latest : from + LOG_CHUNK - 1n;
    let logs;
    try {
      logs = await client.getLogs({ address: getAddress(address), event, fromBlock: from, toBlock: to });
    } catch (err) {
      console.error(`  getLogs ${from}..${to} failed: ${err.shortMessage || err.message}`);
      continue;
    }
    for (const log of logs) onLog(log);
    total += logs.length;
  }
  return { total, latest };
}

async function tryRead(address, functionName) {
  try {
    return await client.readContract({ address, abi: ERC20_ABI, functionName });
  } catch {
    return null;
  }
}

function bump(map, addr) {
  if (!addr) return;
  const a = addr.toLowerCase();
  map.set(a, (map.get(a) || 0) + 1);
}

async function main() {
  console.log(`RPC: ${rpcUrl}`);

  try {
    const weth9 = await client.readContract({
      address: getAddress(UNIVERSAL_ROUTER),
      abi: WETH9_ABI,
      functionName: "WETH9",
    });
    console.log(`UniversalRouter.WETH9() => ${weth9}`);
  } catch {
    console.log("UniversalRouter.WETH9() not exposed; relying on pool scan.");
  }

  const counts = new Map();

  console.log(`\nScanning V4 PoolManager Initialize events from ${START_BLOCK} ...`);
  const v4 = await scanLogs(POOL_MANAGER, INITIALIZE_EVENT, (log) => {
    bump(counts, log.args.currency0);
    bump(counts, log.args.currency1);
  });
  console.log(`  ${v4.total} V4 pools (head block ${v4.latest})`);

  console.log(`\nScanning LockableUniswapV3Initializer Create events ...`);
  const v3 = await scanLogs(LOCKABLE_V3_INITIALIZER, V3_CREATE_EVENT, (log) => {
    bump(counts, log.args.numeraire);
  });
  console.log(`  ${v3.total} V3 lockable pools`);

  if (counts.size === 0) {
    console.log("\nNo pools found from these contracts yet — nothing to infer.");
    return;
  }

  console.log(`\nCurrencies / numeraires seen (ranked by # of pools):\n`);
  const rows = [];
  for (const [addr, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (addr === zeroAddress) {
      rows.push({ addr, symbol: "(native ETH)", name: "-", decimals: 18, count });
      continue;
    }
    const [symbol, name, decimals] = await Promise.all([
      tryRead(getAddress(addr), "symbol"),
      tryRead(getAddress(addr), "name"),
      tryRead(getAddress(addr), "decimals"),
    ]);
    rows.push({ addr, symbol: symbol ?? "?", name: name ?? "?", decimals: decimals ?? "?", count });
  }

  for (const r of rows) {
    console.log(`  ${r.addr}  ${String(r.symbol).padEnd(12)} dec=${String(r.decimals).padEnd(3)} pools=${String(r.count).padEnd(5)} (${r.name})`);
  }

  console.log(`\nSuggested mapping:`);
  const find = (re) => rows.find((r) => re.test(String(r.symbol)));
  for (const [label, re] of [
    ["shared.weth ", /^WETH$|^WGLD$|^WROBIN$/i],
    ["stables.usdc", /^USDC(\.e)?$/i],
    ["stables.usdt", /^USDT$/i],
    ["USDG (native)", /^USDG$/i],
  ]) {
    const hit = find(re);
    console.log(`  ${label} = ${hit ? getAddress(hit.addr) : "<not seen>"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
