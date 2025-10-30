import { PoolKey } from "@app/types";
import { computeV3Price } from "@app/utils/v3-utils";
import { Context } from "ponder:registry";
import { pool } from "ponder:schema";
import { Address, parseUnits, zeroAddress } from "viem";
import { StateViewABI } from "@app/abis";
import { getPoolId } from "@app/utils/v4-utils/getPoolId";
import { chainConfigs } from "@app/config";
import { computeMarketCap, fetchEthPrice, fetchFxhPrice, fetchNoicePrice } from "../../oracle";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { upsertTokenWithPool } from "../token-optimized";

/**
 * Optimized version with caching and reduced contract calls
 */
export const insertMulticurvePoolV4Optimized = async ({
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
  
  const DEBUG_ASSET = '0x9645a79068746bc8c37a2b7363168D4126bF1491'.toLowerCase();
  const isDebugAsset = poolKey.currency0.toLowerCase() === DEBUG_ASSET || poolKey.currency1.toLowerCase() === DEBUG_ASSET;
  
  if (isDebugAsset) {
    console.log('DEBUG: Input poolKey =', JSON.stringify(poolKey));
    console.log('DEBUG: Calling getState with currency0 =', poolKey.currency0);
  }
  
  poolState = await client.readContract({
    abi: UniswapV4MulticurveInitializerABI,
    address: chainConfigs[chain.name].addresses.v4.v4MulticurveInitializer,
    functionName: "getState",
    args: [poolKey.currency0],
  });

  if (isDebugAsset) {
    console.log('DEBUG: poolState[2].hooks =', poolState[2].hooks);
    console.log('DEBUG: zeroAddress =', zeroAddress);
    console.log('DEBUG: hooks === zeroAddress ?', poolState[2].hooks === zeroAddress);
  }

  if (poolState[2].hooks === zeroAddress) {
    if (isDebugAsset) console.log('DEBUG: Swapping tokens - baseToken = currency1, quoteToken = currency0');
    baseToken = poolKey.currency1;
    quoteToken = poolKey.currency0;
    poolState = await client.readContract({
      abi: UniswapV4MulticurveInitializerABI,
      address: chainConfigs[chain.name].addresses.v4.v4MulticurveInitializer,
      functionName: "getState",
      args: [poolKey.currency1],
    });
  } else {
    if (isDebugAsset) console.log('DEBUG: NOT swapping - baseToken = currency0, quoteToken = currency1');
    baseToken = poolKey.currency0;
    quoteToken = poolKey.currency1;
  }
  
  if (isDebugAsset) {
    console.log('DEBUG: After assignment - baseToken =', baseToken);
    console.log('DEBUG: After assignment - quoteToken =', quoteToken);
  }

  let fxhWethPrice, noiceWethPrice;
  if (chain.name === "base") {
    [fxhWethPrice, noiceWethPrice] = await Promise.all([
      fetchFxhPrice(timestamp, context),
      fetchNoicePrice(timestamp, context),
    ]);
  } else {
    fxhWethPrice = parseUnits("1", 18);
    noiceWethPrice = parseUnits("1", 18);
  }

  const [ethPrice, baseTokenEntity] = await Promise.all([
    fetchEthPrice(timestamp, context),
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
      poolAddress,
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
  const isQuoteEth =
    quoteToken === zeroAddress ||
    quoteToken === chainConfigs[chain.name].addresses.shared.weth;

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

  var price;
  if (isQuoteFxh) {
    price =
      fxhWethPrice! *
      computeV3Price({
        sqrtPriceX96,
        isToken0,
        decimals: 18,
      });
  } else if (isQuoteNoice) {
    price =
      noiceWethPrice! *
      computeV3Price({
        sqrtPriceX96,
        isToken0,
        decimals: 18,
      });
  } else {
    price = computeV3Price({
      sqrtPriceX96,
      isToken0,
      decimals: 18,
    });
  }

  const marketCapUsd = computeMarketCap({
    price,
    ethPrice,
    totalSupply: baseTokenEntity.totalSupply,
    decimals: isQuoteEth ? 8 : 18,
  });

  if (isDebugAsset) {
    console.log('DEBUG insertMulticurvePoolV4Optimized: baseToken =', baseToken);
    console.log('DEBUG insertMulticurvePoolV4Optimized: quoteToken =', quoteToken);
    console.log('DEBUG insertMulticurvePoolV4Optimized: poolKey =', JSON.stringify(poolKey));
    console.log('DEBUG insertMulticurvePoolV4Optimized: poolAddress =', address);
  }

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
    type: "multicurve",
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
  });
};
