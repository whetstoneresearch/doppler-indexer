import { ponder } from "ponder:registry";
import { getPoolId } from "@app/utils/v4-utils";
import { computeV4Price } from "@app/utils/v4-utils/computeV4Price";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { insertPoolIfNotExistsDHook, updatePool } from "./shared/entities/pool";
import { insertAssetIfNotExists, updateAsset } from "./shared/entities/asset";
import { SwapService, SwapOrchestrator, PriceService, MarketDataService } from "@app/core";
import { TickMath } from "@uniswap/v3-sdk";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { chainConfigs } from "@app/config/chains";
import { pool, token, asset } from "ponder:schema";
import { DopplerHookInitializerABI, StateViewABI, DERC20ABI } from "@app/abis";
import { Address, zeroAddress } from "viem";
import { getQuoteInfo, QuoteInfo } from "@app/utils/getQuoteInfo";
import { getAmount0Delta, getAmount1Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { DHookPoolData, DHookPoolConfig, PoolKey, Slot0Data } from "@app/types/v4-types";
import { Context } from "ponder:registry";

/**
 * Get DHook pool data from DopplerHookInitializer.getState()
 */
const getDHookPoolData = async ({
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

  // Get state from DopplerHookInitializer
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

  // Get slot0 and liquidity from StateView
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

  // Determine if asset is token0
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

// ============================================
// Create Event Handler
// ============================================
ponder.on("DopplerHookInitializer:Create", async ({ event, context }) => {
  const { poolOrHook, asset: assetId, numeraire } = event.args;
  const { block, transaction } = event;
  const timestamp = block.timestamp;

  const assetAddress = assetId.toLowerCase() as `0x${string}`;
  const numeraireAddress = numeraire.toLowerCase() as `0x${string}`;
  const creatorAddress = transaction.from.toLowerCase() as `0x${string}`;

  // Get initializer address from config
  const initializerAddress = chainConfigs[context.chain.name].addresses.v4.DopplerHookInitializer;

  // Insert tokens
  const [baseToken] = await Promise.all([
    insertTokenIfNotExists({
      tokenAddress: assetAddress,
      creatorAddress,
      timestamp,
      context,
      isDerc20: true,
      poolAddress: poolOrHook.toLowerCase() as `0x${string}`,
    }),
    insertTokenIfNotExists({
      tokenAddress: numeraireAddress,
      creatorAddress,
      timestamp,
      context,
      isDerc20: false,
    }),
  ]);

  const quoteInfo = await getQuoteInfo(numeraireAddress, timestamp, context);

  // Get pool data from DopplerHookInitializer
  const poolData = await getDHookPoolData({
    assetAddress,
    initializerAddress,
    context,
    quoteInfo,
  });

  // Compute poolId as the pool address
  const poolId = getPoolId(poolData.poolKey);
  const poolAddress = poolId.toLowerCase() as `0x${string}`;

  const { totalSupply } = baseToken;

  const poolEntity = await insertPoolIfNotExistsDHook({
    poolAddress,
    timestamp,
    ethPrice: quoteInfo.quotePrice!,
    poolData,
    context,
  });

  const price = poolEntity.price;
  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });

  await insertAssetIfNotExists({
    assetAddress,
    timestamp,
    context,
    marketCapUsd,
  });
});

// ============================================
// Swap Event Handler
// ============================================
ponder.on("DopplerHookInitializer:Swap", async ({ event, context }) => {
  const { sender, poolKey: poolKeyTuple, poolId, params, amount0, amount1 } = event.args;
  const timestamp = event.block.timestamp;
  const { chain, client, db } = context;

  const poolKey: PoolKey = {
    currency0: poolKeyTuple.currency0,
    currency1: poolKeyTuple.currency1,
    fee: poolKeyTuple.fee,
    tickSpacing: poolKeyTuple.tickSpacing,
    hooks: poolKeyTuple.hooks,
  };

  // Use computed poolId as address
  const computedPoolId = getPoolId(poolKey);
  const poolAddress = computedPoolId.toLowerCase() as `0x${string}`;

  // Find existing pool
  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId: chain.id,
  });

  if (!poolEntity) {
    console.warn(`DHook pool not found for swap: ${poolAddress}`);
    return;
  }

  // Get current slot0 from StateView
  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const slot0 = await client.readContract({
    abi: StateViewABI,
    address: stateView,
    functionName: "getSlot0",
    args: [computedPoolId],
  });

  const [sqrtPriceX96, currentTick] = slot0;

  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

  // Calculate price from current tick
  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: poolEntity.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  // Determine swap type from amounts
  const isCoinBuy = poolEntity.isToken0 ? amount0 < 0n : amount1 < 0n;
  const type = isCoinBuy ? "buy" : "sell";

  const amountIn = amount0 > 0n ? BigInt(amount0) : BigInt(amount1);
  const amountOut = amount0 < 0n ? BigInt(-amount0) : BigInt(-amount1);

  // Get token for market cap calculation
  const tokenEntity = await db.find(token, {
    address: poolEntity.baseToken,
    chainId: chain.id,
  });

  if (!tokenEntity) {
    console.warn(`Token not found for DHook swap: ${poolEntity.baseToken}`);
    return;
  }

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: tokenEntity.totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });

  // Calculate new reserves
  const newReserves0 = poolEntity.reserves0 + BigInt(amount0);
  const newReserves1 = poolEntity.reserves1 + BigInt(amount1);

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: poolEntity.isToken0 ? newReserves0 : newReserves1,
    quoteBalance: poolEntity.isToken0 ? newReserves1 : newReserves0,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  // Calculate swap value
  const quoteDelta = poolEntity.isToken0 ? amount1 : amount0;
  const swapValueUsd =
    ((quoteDelta < 0n ? -quoteDelta : quoteDelta) * quoteInfo.quotePrice!) /
    BigInt(10) ** BigInt(quoteInfo.quotePriceDecimals);

  const swapData = SwapOrchestrator.createSwapData({
    poolAddress,
    sender: event.transaction.from,
    transactionHash: event.transaction.hash,
    transactionFrom: event.transaction.from,
    blockNumber: event.block.number,
    timestamp,
    assetAddress: poolEntity.baseToken,
    quoteAddress: poolEntity.quoteToken,
    isToken0: poolEntity.isToken0,
    amountIn,
    amountOut,
    price,
    usdPrice: quoteInfo.quotePrice!,
  });

  const marketMetrics = {
    liquidityUsd: dollarLiquidity,
    marketCapUsd,
    swapValueUsd,
  };

  const entityUpdaters = {
    updatePool,
    updateFifteenMinuteBucketUsd,
    updateAsset,
  };

  await SwapOrchestrator.performSwapUpdates(
    {
      swapData,
      swapType: type,
      metrics: marketMetrics,
      poolData: {
        parentPoolAddress: poolAddress,
        price,
        tickLower: 0,
        currentTick,
        graduationTick: poolEntity.graduationTick ?? 0,
        type: "dhook",
        baseToken: poolEntity.baseToken,
      },
      chainId: chain.id,
      context,
    },
    entityUpdaters
  );

  // Update pool with new values
  await updatePool({
    poolAddress,
    context,
    update: {
      price,
      sqrtPrice: sqrtPriceX96,
      tick: currentTick,
      reserves0: newReserves0,
      reserves1: newReserves1,
      dollarLiquidity,
      marketCapUsd,
      lastSwapTimestamp: timestamp,
      lastRefreshed: timestamp,
    },
  });
});

// ============================================
// ModifyLiquidity Event Handler
// ============================================
ponder.on("DopplerHookInitializer:ModifyLiquidity", async ({ event, context }) => {
  const { key: poolKeyTuple, params } = event.args;
  const timestamp = event.block.timestamp;
  const { chain, client, db } = context;

  const poolKey: PoolKey = {
    currency0: poolKeyTuple.currency0,
    currency1: poolKeyTuple.currency1,
    fee: poolKeyTuple.fee,
    tickSpacing: poolKeyTuple.tickSpacing,
    hooks: poolKeyTuple.hooks,
  };

  const computedPoolId = getPoolId(poolKey);
  const poolAddress = computedPoolId.toLowerCase() as `0x${string}`;

  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId: chain.id,
  });

  if (!poolEntity) {
    console.warn(`DHook pool not found for ModifyLiquidity: ${poolAddress}`);
    return;
  }

  const { tickLower, tickUpper, liquidityDelta } = params;

  // Get current tick from StateView
  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const slot0 = await client.readContract({
    abi: StateViewABI,
    address: stateView,
    functionName: "getSlot0",
    args: [computedPoolId],
  });

  const tick = slot0[1];
  const sqrtPriceX96 = slot0[0];

  // Calculate reserve changes based on position
  let token0Reserve = poolEntity.reserves0;
  let token1Reserve = poolEntity.reserves1;
  let newLiquidity = poolEntity.liquidity + liquidityDelta;

  if (tick < tickLower) {
    token0Reserve += getAmount0Delta({
      tickLower,
      tickUpper,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  } else if (tick < tickUpper) {
    token0Reserve += getAmount0Delta({
      tickLower: tick,
      tickUpper,
      liquidity: liquidityDelta,
      roundUp: false,
    });
    token1Reserve += getAmount1Delta({
      tickLower,
      tickUpper: tick,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  } else {
    token1Reserve += getAmount1Delta({
      tickLower,
      tickUpper,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  }

  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: poolEntity.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: poolEntity.isToken0 ? token0Reserve : token1Reserve,
    quoteBalance: poolEntity.isToken0 ? token1Reserve : token0Reserve,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const tokenEntity = await db.find(token, {
    address: poolEntity.baseToken,
    chainId: chain.id,
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: tokenEntity?.totalSupply ?? 0n,
    decimals: quoteInfo.quotePriceDecimals,
  });

  await updatePool({
    poolAddress,
    context,
    update: {
      liquidity: newLiquidity,
      reserves0: token0Reserve,
      reserves1: token1Reserve,
      dollarLiquidity,
      marketCapUsd,
      price,
      sqrtPrice: sqrtPriceX96,
      tick,
      lastRefreshed: timestamp,
    },
  });
});

// ============================================
// Graduate Event Handler
// ============================================
ponder.on("DopplerHookInitializer:Graduate", async ({ event, context }) => {
  const { asset: assetAddress } = event.args;
  const timestamp = event.block.timestamp;
  const { chain, db } = context;

  const address = assetAddress.toLowerCase() as `0x${string}`;

  // Find the asset to get poolAddress
  const assetEntity = await db.find(asset, {
    address,
    chainId: chain.id,
  });

  if (!assetEntity) {
    console.warn(`Asset not found for Graduate: ${address}`);
    return;
  }

  const poolAddress = assetEntity.poolAddress;

  if (!poolAddress) {
    console.warn(`Pool address not found for graduated asset: ${address}`);
    return;
  }

  // Mark pool as graduated/migrated
  await updatePool({
    poolAddress: poolAddress as Address,
    context,
    update: {
      migrated: true,
      migratedAt: timestamp,
      graduationPercentage: 100,
    },
  });

  // Update asset as migrated
  await updateAsset({
    assetAddress: address,
    context,
    update: {
      migrated: true,
      migratedAt: timestamp,
    },
  });
});
