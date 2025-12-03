import { PoolKey } from "@app/types";
import { PriceService } from "@app/core";
import { Context } from "ponder:registry";
import { pool } from "ponder:schema";
import { Address, parseUnits, zeroAddress } from "viem";
import { StateViewABI } from "@app/abis";
import { getPoolId } from "@app/utils/v4-utils/getPoolId";
import { chainConfigs } from "@app/config";
import { CHAINLINK_ETH_DECIMALS } from "@app/utils/constants";
import { fetchEthPrice, fetchFxhPrice, fetchMonadPrice, fetchNoicePrice, fetchUsdcPrice, fetchUsdtPrice } from "../../oracle";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { upsertTokenWithPool } from "../token-optimized";
import { MarketDataService } from "@app/core";

/**
 * Optimized version with caching and reduced contract calls
 */
export const insertMulticurvePoolV4Optimized = async ({
  poolAddress,
  poolKey,
  timestamp,
  context,
  creatorAddress,
  scheduled
}: {
  poolAddress: Address;
  poolKey: PoolKey;
  timestamp: bigint;
  context: Context;
  creatorAddress: Address;
  scheduled: boolean;
}): Promise<typeof pool.$inferSelect | null>=> {
  const { db, chain, client } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;
  const chainId = chain.id;

  // Check if pool already exists (early return)
  const existingPool = await db.find(pool, {
    address,
    chainId,
  });

  if (existingPool) {
    return existingPool;
  }

  let poolState;
  let baseToken;
  let quoteToken;
  poolState = await client.readContract({
    abi: UniswapV4MulticurveInitializerABI,
    address: scheduled ? chainConfigs[chain.name].addresses.v4.v4ScheduledMulticurveInitializer : chainConfigs[chain.name].addresses.v4.v4MulticurveInitializer,
    functionName: "getState",
    args: [poolKey.currency0],
  });

  if (poolState[2].hooks === zeroAddress) {
    baseToken = poolKey.currency1;
    quoteToken = poolKey.currency0;
    poolState = await client.readContract({
      abi: UniswapV4MulticurveInitializerABI,
      address: scheduled ? chainConfigs[chain.name].addresses.v4.v4ScheduledMulticurveInitializer : chainConfigs[chain.name].addresses.v4.v4MulticurveInitializer,
      functionName: "getState",
      args: [poolKey.currency1],
    });
  } else {
    baseToken = poolKey.currency0;
    quoteToken = poolKey.currency1;
  }

  let fxhWethPrice, noiceWethPrice, monUsdcPrice;
  if (chain.name === "base") {
    [fxhWethPrice, noiceWethPrice] = await Promise.all([
      fetchFxhPrice(timestamp, context),
      fetchNoicePrice(timestamp, context),
    ]);
  } else if (chain.name === "monad") {
    monUsdcPrice = await fetchMonadPrice(timestamp, context);
  } else {
    fxhWethPrice = parseUnits("1", 18);
    noiceWethPrice = parseUnits("1", 18);
  }

  const [ethPrice, usdcPrice, usdtPrice, baseTokenEntity] = await Promise.all([
    fetchEthPrice(timestamp, context),
    fetchUsdcPrice(timestamp, context),
    fetchUsdtPrice(timestamp, context),
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

  const isQuoteFxh =
    quoteToken != zeroAddress &&
    quoteToken ===
      chainConfigs[context.chain.name].addresses.shared.fxHash.fxhAddress;
  const isQuoteNoice =
    quoteToken != zeroAddress &&
    quoteToken ===
      chainConfigs[context.chain.name].addresses.shared.noice.noiceAddress;
  const isQuoteMon =
    quoteToken != zeroAddress &&
    quoteToken ===
      chainConfigs[context.chain.name].addresses.shared.monad.monAddress;
  const isQuoteEth =
    quoteToken === zeroAddress ||
    quoteToken === chainConfigs[chain.name].addresses.shared.weth;
  let isQuoteUSDC, isQuoteUSDT;
  if (chainConfigs[context.chain.name].addresses.stables) {
    if (chainConfigs[context.chain.name].addresses.stables?.usdt) {
      isQuoteUSDC =
        quoteToken != zeroAddress &&
        quoteToken ===
        chainConfigs[context.chain.name].addresses.stables?.usdc?.toLowerCase();
    }
    if (chainConfigs[context.chain.name].addresses.stables?.usdt) {
      isQuoteUSDT =
        quoteToken != zeroAddress &&
        quoteToken ===
        chainConfigs[context.chain.name].addresses.stables?.usdt?.toLowerCase();
    }
  }

  if (!poolKey) {
    poolKey = poolState[2];
  }
  // Optimized contract calls - single multicall instead of multiple calls
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
  });

  const fxhUsdPrice = isQuoteFxh
    ? (fxhWethPrice! * ethPrice) / CHAINLINK_ETH_DECIMALS
    : undefined;
  const noiceUsdPrice = isQuoteNoice
    ? (noiceWethPrice! * ethPrice) / CHAINLINK_ETH_DECIMALS
    : undefined;
  const quoteUsdPrice = 
    isQuoteFxh ? fxhUsdPrice!
    : isQuoteNoice ? noiceUsdPrice!
    : isQuoteMon ? monUsdcPrice!
    : isQuoteUSDC ? usdcPrice!
    : isQuoteUSDT ? usdtPrice!
    : ethPrice;
  const quoteDecimals = isQuoteFxh || isQuoteNoice || isQuoteMon ? 18 : 8;

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteUsdPrice,
    totalSupply: baseTokenEntity.totalSupply,
    decimals: quoteDecimals,
  });

  // Insert new pool with all data at once
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
    type: scheduled ? "scheduled-multicurve" : "multicurve",
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
    tickLower: tick    
  });
};
