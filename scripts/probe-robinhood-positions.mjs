// Probe why robinhood DHook pools report zero liquidity.
//
// Usage:
//   PONDER_RPC_URL_4663=<rpc> node scripts/probe-robinhood-positions.mjs <assetAddress>

import { createPublicClient, http, keccak256, encodeAbiParameters } from "viem";

const RPC = process.env.PONDER_RPC_URL_4663;
const asset = (process.argv[2] || "").toLowerCase();
if (!RPC) throw new Error("set PONDER_RPC_URL_4663");
if (!asset) throw new Error("usage: node scripts/probe-robinhood-positions.mjs <assetAddress>");

const DOPPLER_HOOK_INITIALIZER = "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544";
const STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";
const client = createPublicClient({ transport: http(RPC) });

const getStateAbi = [{
  type: "function", name: "getState", stateMutability: "view",
  inputs: [{ name: "asset", type: "address" }],
  outputs: [
    { name: "numeraire", type: "address" },
    { name: "totalTokensOnBondingCurve", type: "uint256" },
    { name: "dopplerHook", type: "address" },
    { name: "graduationDopplerHookCalldata", type: "bytes" },
    { name: "status", type: "uint8" },
    { name: "poolKey", type: "tuple", components: [
      { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ] },
    { name: "farTick", type: "int24" },
  ],
}];

const stateViewAbi = [
  { type: "function", name: "getLiquidity", stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "liquidity", type: "uint128" }] },
  { type: "function", name: "getSlot0", stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" }, { name: "lpFee", type: "uint24" },
    ] },
  // position keyed by (owner, tickLower, tickUpper, salt)
  { type: "function", name: "getPositionInfo", stateMutability: "view",
    inputs: [
      { name: "poolId", type: "bytes32" }, { name: "owner", type: "address" },
      { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
    ] },
];

const poolId = (k) => keccak256(encodeAbiParameters(
  [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
  [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]
));

const state = await client.readContract({
  abi: getStateAbi, address: DOPPLER_HOOK_INITIALIZER, functionName: "getState", args: [asset],
});
const [numeraire, totalOnCurve, dopplerHook, , status, key, farTick] = state;
const id = poolId(key);

console.log(`asset=${asset}`);
console.log(`numeraire=${numeraire} status=${status} farTick=${farTick} totalOnCurve=${totalOnCurve}`);
console.log(`dopplerHook=${dopplerHook}`);
console.log(`poolKey=`, key);
console.log(`poolId=${id}\n`);

const [liq, slot0] = await Promise.all([
  client.readContract({ abi: stateViewAbi, address: STATE_VIEW, functionName: "getLiquidity", args: [id] }),
  client.readContract({ abi: stateViewAbi, address: STATE_VIEW, functionName: "getSlot0", args: [id] }),
]);
console.log(`StateView.getLiquidity(poolId) = ${liq}`);
console.log(`StateView.getSlot0 tick=${slot0[1]} sqrtPriceX96=${slot0[0]}\n`);

// Try reading the position owned by the hook in poolKey, across the plausible salt=0 range.
for (const owner of [key.hooks, DOPPLER_HOOK_INITIALIZER]) {
  try {
    const info = await client.readContract({
      abi: stateViewAbi, address: STATE_VIEW, functionName: "getPositionInfo",
      args: [id, owner, farTick, -farTick, "0x".padEnd(66, "0")],
    });
    console.log(`getPositionInfo owner=${owner} [${farTick},${-farTick}] salt=0 -> liquidity=${info[0]}`);
  } catch (e) {
    console.log(`getPositionInfo owner=${owner} FAILED: ${e.shortMessage || e.message}`);
  }
}
