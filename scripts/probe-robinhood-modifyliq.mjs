// Pull PoolManager:ModifyLiquidity logs for a robinhood DHook pool to recover
// the exact position params, and verify reserves reconstruction.
//
// Usage:
//   PONDER_RPC_URL_4663=<rpc> node scripts/probe-robinhood-modifyliq.mjs <poolId>

import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";

const RPC = process.env.PONDER_RPC_URL_4663;
const poolId = process.argv[2];
if (!RPC) throw new Error("set PONDER_RPC_URL_4663");
if (!poolId) throw new Error("usage: node scripts/probe-robinhood-modifyliq.mjs <poolId>");

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const V4_START = 367349n;
const client = createPublicClient({ transport: http(RPC) });

const modifyLiquidity = parseAbiItem(
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"
);

const latest = await client.getBlockNumber();
console.log(`scanning ModifyLiquidity for poolId=${poolId} from ${V4_START} to ${latest}\n`);

// Chunk to stay under provider log-range limits (Alchemy caps at 10k blocks).
const STEP = 9999n;
const logs = [];
for (let from = V4_START; from <= latest; from += STEP + 1n) {
  const to = from + STEP > latest ? latest : from + STEP;
  const chunk = await client.getLogs({
    address: POOL_MANAGER, event: modifyLiquidity,
    args: { id: poolId }, fromBlock: from, toBlock: to,
  });
  logs.push(...chunk);
}

console.log(`found ${logs.length} ModifyLiquidity log(s):`);
const agg = new Map();
for (const l of logs) {
  const { tickLower, tickUpper, liquidityDelta, salt, sender } = l.args;
  console.log(`  block=${l.blockNumber} sender=${sender} [${tickLower},${tickUpper}] delta=${liquidityDelta} salt=${salt}`);
  const key = `${tickLower}:${tickUpper}`;
  agg.set(key, (agg.get(key) ?? 0n) + liquidityDelta);
}
console.log(`\naggregated positions:`);
for (const [k, v] of agg) console.log(`  [${k}] liquidity=${v}`);
