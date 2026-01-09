import { Address } from "viem";
import { DHookPoolData, DHookPoolConfig, PoolKey, Slot0Data } from "@app/types/v4-types";
import { getQuoteInfo, QuoteInfo } from "@app/utils/getQuoteInfo";
import { Context } from "ponder:registry";
import { chainConfigs } from "@app/config/chains";
import { DopplerHookInitializerABI, StateViewABI } from "@app/abis";
import { getPoolId } from "@app/utils/v4-utils";
import { computeV4Price } from "@app/utils/v4-utils/computeV4Price";

export const getDHookPoolData = async ({
  assetAddress,
  initializerAddress,
  context,
  quoteInfo,
}: {
  assetAddress: Address;
  initializerAddress: Address;
  context: Context;
  quoteInfo: QuoteInfo;
}): Promise<DHookPoolData> => {
  const { client, chain } = context;
  const { stateView } = chainConfigs[chain.name].addresses.v4;

  const state = await client.readContract({
    abi: DopplerHookInitializerABI,
    address: initializerAddress,
    functionName: "getState",
    args: [assetAddress],
  });

  const [numeraire, totalTokensOnBondingCurve, dopplerHook, , status, poolKeyTuple, farTick] = state;

  const poolKey: PoolKey = {
    currency0: poolKeyTuple.currency0,
    currency1: poolKeyTuple.currency1,
    fee: poolKeyTuple.fee,
    tickSpacing: poolKeyTuple.tickSpacing,
    hooks: poolKeyTuple.hooks,
  };

  const poolId = getPoolId(poolKey);

  const [slot0, liquidity] = await client.multicall({
    contracts: [
      {
        abi: StateViewABI,
        address: stateView,
        functionName: "getSlot0",
        args: [poolId],
      },
      {
        abi: StateViewABI,
        address: stateView,
        functionName: "getLiquidity",
        args: [poolId],
      },
    ],
  });

  const slot0Data: Slot0Data = {
    sqrtPrice: slot0.result?.[0] ?? 0n,
    tick: slot0.result?.[1] ?? 0,
    protocolFee: slot0.result?.[2] ?? 0,
    lpFee: slot0.result?.[3] ?? 0,
  };

  const liquidityResult = liquidity?.result ?? 0n;

  const isToken0 = assetAddress.toLowerCase() === poolKey.currency0.toLowerCase();

  const price = computeV4Price({
    isToken0,
    currentTick: slot0Data.tick,
    baseTokenDecimals: 18,
    quoteTokenDecimals: quoteInfo.quoteDecimals,
  });

  const poolConfig: DHookPoolConfig = {
    numeraire,
    totalTokensOnBondingCurve,
    dopplerHook,
    status,
    farTick,
    isToken0,
  };

  return {
    poolKey,
    slot0Data,
    liquidity: liquidityResult,
    price,
    poolConfig,
  };
};
