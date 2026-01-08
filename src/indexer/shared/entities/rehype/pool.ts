import { PoolKey } from "@app/types";
import { PriceService } from "@app/core";
import { Context } from "ponder:registry";
import { pool } from "ponder:schema";
import { Address, zeroAddress } from "viem";
import { StateViewABI } from "@app/abis";
import { getPoolId } from "@app/utils/v4-utils/getPoolId";
import { chainConfigs } from "@app/config";
import { QuoteToken, getQuoteInfo } from "@app/utils/getQuoteInfo";
import { DopplerHookInitializerABI } from "@app/abis/v4-abis/DopplerHookInitializerABI";
import { upsertTokenWithPool } from "../token-optimized";
import { MarketDataService } from "@app/core";

export const insertRehypePoolV4 = async ({
  poolAddress,
  poolKey,
  timestamp,
  context,
  creatorAddress,
}: {
  poolAddress: Address;
  poolKey: PoolKey;
  timestamp: bigint;
  context: Context;
  creatorAddress: Address;
}): Promise<typeof pool.$inferSelect | null> => {
  const { db, chain, client } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;
  const chainId = chain.id;

  const existingPool = await db.find(pool, {
    address,
    chainId,
  });

  if (existingPool) {
    return existingPool;
  }

  const dopplerHookInitializerAddress = chainConfigs[chain.name].addresses.v4.dopplerHookInitializer;
  if (!dopplerHookInitializerAddress) {
    console.warn(`DopplerHookInitializer address not configured for chain ${chain.name}`);
    return null;
  }

  let poolState;
  let baseToken: Address;
  let quoteToken: Address;

  poolState = await client.readContract({
    abi: DopplerHookInitializerABI,
    address: dopplerHookInitializerAddress,
    functionName: "getState",
    args: [poolKey.currency0],
  });

  // poolState[7] is the poolKey - check if hooks is valid to determine which token is the asset
  if (poolState[7].hooks === zeroAddress) {
    baseToken = poolKey.currency1;
    quoteToken = poolKey.currency0;
    poolState = await client.readContract({
      abi: DopplerHookInitializerABI,
      address: dopplerHookInitializerAddress,
      functionName: "getState",
      args: [poolKey.currency1],
    });
  } else {
    baseToken = poolKey.currency0;
    quoteToken = poolKey.currency1;
  }

  const [quoteInfo, baseTokenEntity] = await Promise.all([
    getQuoteInfo(quoteToken.toLowerCase() as Address, timestamp, context),
    upsertTokenWithPool({
      tokenAddress: baseToken,
      isDerc20: true,
      isCreatorCoin: false,
      isContentCoin: false,
      poolAddress,
      context,
      creatorAddress,
      creatorCoinPid: null,
      timestamp,
    }),
    upsertTokenWithPool({
      tokenAddress: quoteToken,
      isDerc20: false,
      isCreatorCoin: false,
      isContentCoin: false,
      poolAddress: null,
      context,
      creatorAddress: zeroAddress,
      creatorCoinPid: null,
      timestamp,
    }),
  ]);

  const isToken0 = baseToken.toLowerCase() < quoteToken.toLowerCase();

  const stateView = chainConfigs[chain.name].addresses.v4.stateView;
  const poolId = getPoolId(poolKey);

  const slot0Result = await client.readContract({
    abi: StateViewABI,
    address: stateView,
    functionName: "getSlot0",
    args: [poolId],
  });

  const sqrtPriceX96 = slot0Result?.[0] ?? 0n;
  if (sqrtPriceX96 === 0n) {
    return null;
  }

  const tick = slot0Result?.[1] ?? 0;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: baseTokenEntity.totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });

  const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;

  return await db.insert(pool).values({
    address,
    tick,
    sqrtPrice: sqrtPriceX96,
    liquidity: 0n,
    createdAt: timestamp,
    asset: baseToken,
    baseToken,
    quoteToken,
    price,
    type: "rehype",
    chainId,
    fee: poolKey.fee,
    dollarLiquidity: 0n,
    dailyVolume: address,
    maxThreshold: 0n,
    graduationBalance: 0n,
    totalFee0: 0n,
    totalFee1: 0n,
    volumeUsd: 0n,
    reserves0: 0n,
    reserves1: 0n,
    percentDayChange: 0,
    isToken0,
    marketCapUsd,
    isQuoteEth,
    integrator: zeroAddress,
    holderCount: 0,
    lastSwapTimestamp: timestamp,
    lastRefreshed: timestamp,
    poolKey,
    tickLower: tick,
  });
};
