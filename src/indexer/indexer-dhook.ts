import { ponder } from "ponder:registry";
import { getPoolId } from "@app/utils/v4-utils";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { insertPoolIfNotExistsDHook, updatePool } from "./shared/entities/pool";
import { insertAssetIfNotExists, updateAsset } from "./shared/entities/asset";
import { SwapOrchestrator, PriceService, MarketDataService } from "@app/core";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { chainConfigs } from "@app/config/chains";
import { pool, token, asset } from "ponder:schema";
import { Address } from "viem";
import { getQuoteInfo } from "@app/utils/getQuoteInfo";
import { getAmount0Delta, getAmount1Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { PoolKey } from "@app/types/v4-types";
import { getDHookPoolData } from "@app/utils/dhook-utils";
import { StateViewABI, DopplerHookInitializerABI, DopplerHookMigratorABI } from "@app/abis";
import { isPrecompileAddress } from "@app/utils/validation";
import { updateCumulatedFees } from "./shared/cumulatedFees";
import { fetchV4MigrationPool, updateV4Pool } from "./shared/entities/v4pools";
import { v4pools } from "ponder:schema";

ponder.on("DopplerHookInitializer:Create", async ({ event, context }) => {
  const { poolOrHook, asset: assetId, numeraire } = event.args;
  const { block, transaction } = event;
  const timestamp = block.timestamp;

  const assetAddress = assetId.toLowerCase() as `0x${string}`;
  const numeraireAddress = numeraire.toLowerCase() as `0x${string}`;
  const creatorAddress = transaction.from.toLowerCase() as `0x${string}`;

  if (isPrecompileAddress(assetAddress) || isPrecompileAddress(numeraireAddress)) {
    return;
  }

  const initializerAddress = chainConfigs[context.chain.name].addresses.v4.DopplerHookInitializer;

  const quoteInfo = await getQuoteInfo(numeraireAddress, timestamp, context);

  const [poolData, beneficiaries] = await Promise.all([
    getDHookPoolData({
      assetAddress,
      initializerAddress,
      context,
      quoteInfo,
    }),
    context.client.readContract({
      abi: DopplerHookInitializerABI,
      address: initializerAddress,
      functionName: "getBeneficiaries",
      args: [assetAddress],
    }).catch(() => null),
  ]);

  const poolId = getPoolId(poolData.poolKey);
  const poolAddress = poolId.toLowerCase() as `0x${string}`;

  const [baseToken] = await Promise.all([
    insertTokenIfNotExists({
      tokenAddress: assetAddress,
      creatorAddress,
      timestamp,
      context,
      isDerc20: true,
      poolAddress: poolAddress,
    }),
    insertTokenIfNotExists({
      tokenAddress: numeraireAddress,
      creatorAddress,
      timestamp,
      context,
      isDerc20: false,
    }),
  ]);

  const { totalSupply } = baseToken;

  const poolEntity = await insertPoolIfNotExistsDHook({
    poolAddress,
    timestamp,
    ethPrice: quoteInfo.quotePrice!,
    poolData,
    context,
    beneficiaries,
    initializerAddress,
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

ponder.on("DopplerHookInitializer:Collect", async ({ event, context }) => {
  const { poolId } = event.args;
  const timestamp = event.block.timestamp;
  const { db, chain } = context;

  const poolAddress = (poolId as string).toLowerCase() as `0x${string}`;

  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId: chain.id,
  });

  if (!poolEntity) {
    return;
  }

  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96: poolEntity.sqrtPrice,
    isToken0: poolEntity.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  // Re-fetch cumulated fees from the contract (reflects post-collection state)
  await updateCumulatedFees({
    poolId: poolAddress,
    chainId: chain.id,
    isToken0: poolEntity.isToken0,
    price,
    quoteInfo,
    context,
  });
});

ponder.on("DopplerHookInitializer:Swap", async ({ event, context }) => {
  const { sender, poolKey: poolKeyTuple, poolId, params, amount0, amount1 } = event.args;
  const timestamp = event.block.timestamp;
  const { chain, client, db } = context;

  const poolAddress = (poolId as string).toLowerCase() as `0x${string}`;

  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId: chain.id,
  });

  if (!poolEntity) {
    console.warn(`DHook pool not found for swap: ${poolAddress}`);
    return;
  }

  const poolKey = poolEntity.poolKey as PoolKey;

  if (!poolKey.currency0 || !poolKey.currency1) {
    return
  }
  
  if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
    return;
  }

  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const slot0 = await client.readContract({
    abi: StateViewABI,
    address: stateView,
    functionName: "getSlot0",
    args: [poolId],
  });

  const [sqrtPriceX96, currentTick] = slot0;

  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: poolEntity.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const isCoinBuy = poolEntity.isToken0 ? amount0 < 0n : amount1 < 0n;
  const type = isCoinBuy ? "buy" : "sell";

  const amountIn = amount0 > 0n ? BigInt(amount0) : BigInt(amount1);
  const amountOut = amount0 < 0n ? BigInt(-amount0) : BigInt(-amount1);

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

  const quoteDelta = poolEntity.isToken0 ? amount1 : amount0;
  const swapValueUsd = MarketDataService.calculateVolume({
    amountIn: quoteDelta < 0n ? -quoteDelta : quoteDelta,
    amountOut: 0n,
    quotePriceUSD: quoteInfo.quotePrice!,
    isQuoteUSD: false,
    quoteDecimals: quoteInfo.quoteDecimals,
    decimals: quoteInfo.quotePriceDecimals,
  });

  const swapData = SwapOrchestrator.createSwapData({
    poolAddress,
    sender: sender,
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
        quotePriceDecimals: quoteInfo.quotePriceDecimals,
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

  await Promise.all([
    updatePool({
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
    }),
    updateCumulatedFees({
      poolId: poolAddress,
      chainId: chain.id,
      isToken0: poolEntity.isToken0,
      price,
      quoteInfo,
      context,
    }),
  ]);
});

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

  if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
    return;
  }

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

  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const slot0 = await client.readContract({
    abi: StateViewABI,
    address: stateView,
    functionName: "getSlot0",
    args: [computedPoolId],
  });

  const tick = slot0[1];
  const sqrtPriceX96 = slot0[0];

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

ponder.on("DopplerHookMigrator:Migrate", async ({ event, context }) => {
  const { asset: assetAddress, poolKey: poolKeyTuple } = event.args;
  const timestamp = event.block.timestamp;
  const { chain, client, db } = context;

  const poolKey: PoolKey = {
    currency0: poolKeyTuple.currency0,
    currency1: poolKeyTuple.currency1,
    fee: poolKeyTuple.fee,
    tickSpacing: poolKeyTuple.tickSpacing,
    hooks: poolKeyTuple.hooks,
  };

  if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
    return;
  }

  const poolId = getPoolId(poolKey);
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;

  const { stateView } = chainConfigs[chain.name].addresses.v4;

  const [slot0Result, liquidityResult] = await client.multicall({
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

  const sqrtPriceX96 = slot0Result.result?.[0] ?? 0n;
  const tick = slot0Result.result?.[1] ?? 0;
  const liquidity = liquidityResult.result ?? 0n;

  const MIN_TICK = -887270;
  const MAX_TICK = 887270;

  let reserves0 = 0n;
  let reserves1 = 0n;

  if (liquidity > 0n) {
    reserves0 = getAmount0Delta({
      tickLower: tick,
      tickUpper: MAX_TICK,
      liquidity,
      roundUp: false,
    });

    reserves1 = getAmount1Delta({
      tickLower: MIN_TICK,
      tickUpper: tick,
      liquidity,
      roundUp: false,
    });
  }

  const v4Pool = await db.find(v4pools, {
    poolId: poolIdLower,
    chainId: chain.id,
  });

  if (!v4Pool) {
    console.warn(`DopplerHookMigrator:Migrate - Pool ${poolId} not found`);
    return;
  }

  const isToken0 = assetAddress.toLowerCase() === poolKey.currency0.toLowerCase();
  const quoteToken = isToken0 ? poolKey.currency1 : poolKey.currency0;
  const quoteInfo = await getQuoteInfo(quoteToken, timestamp, context);

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: isToken0 ? reserves0 : reserves1,
    quoteBalance: isToken0 ? reserves1 : reserves0,
    price,
    quotePriceUSD: quoteInfo.quotePrice ?? 0n,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  await updateV4Pool({
    poolId: poolIdLower,
    context,
    update: {
      sqrtPriceX96,
      tick,
      liquidity,
      reserves0,
      reserves1,
      price,
      dollarLiquidity,
      lastRefreshed: timestamp,
    },
  });
});

ponder.on("DopplerHookMigrator:Swap", async ({ event, context }) => {
  const { sender, poolKey: poolKeyTuple, poolId, params, amount0, amount1 } = event.args;
  const timestamp = event.block.timestamp;
  const { chain, client, db } = context;

  const poolIdLower = (poolId as string).toLowerCase() as `0x${string}`;

  const v4Pool = await db.find(v4pools, {
    poolId: poolIdLower,
    chainId: chain.id,
  });

  if (!v4Pool || !v4Pool.migratedFromPool) {
    return;
  }

  const poolKey: PoolKey = {
    currency0: poolKeyTuple.currency0,
    currency1: poolKeyTuple.currency1,
    fee: poolKeyTuple.fee,
    tickSpacing: poolKeyTuple.tickSpacing,
    hooks: poolKeyTuple.hooks,
  };

  if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
    return;
  }

  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const slot0 = await client.readContract({
    abi: StateViewABI,
    address: stateView,
    functionName: "getSlot0",
    args: [poolId],
  });

  const [sqrtPriceX96, currentTick] = slot0;

  const quoteInfo = await getQuoteInfo(v4Pool.quoteToken, timestamp, context);

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: v4Pool.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const isCoinBuy = v4Pool.isToken0 ? amount0 < 0n : amount1 < 0n;
  const type = isCoinBuy ? "buy" : "sell";

  const amountIn = amount0 > 0n ? BigInt(amount0) : BigInt(amount1);
  const amountOut = amount0 < 0n ? BigInt(-amount0) : BigInt(-amount1);

  const tokenEntity = await db.find(token, {
    address: v4Pool.asset!,
    chainId: chain.id,
  });

  if (!tokenEntity) {
    console.warn(`Token not found for DHookMigrator swap: ${v4Pool.asset}`);
    return;
  }

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: tokenEntity.totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });

  const newReserves0 = v4Pool.reserves0 + BigInt(amount0);
  const newReserves1 = v4Pool.reserves1 + BigInt(amount1);

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: v4Pool.isToken0 ? newReserves0 : newReserves1,
    quoteBalance: v4Pool.isToken0 ? newReserves1 : newReserves0,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const quoteDelta = v4Pool.isToken0 ? amount1 : amount0;
  const swapValueUsd = MarketDataService.calculateVolume({
    amountIn: quoteDelta < 0n ? -quoteDelta : quoteDelta,
    amountOut: 0n,
    quotePriceUSD: quoteInfo.quotePrice!,
    isQuoteUSD: false,
    quoteDecimals: quoteInfo.quoteDecimals,
    decimals: quoteInfo.quotePriceDecimals,
  });

  const swapData = SwapOrchestrator.createSwapData({
    poolAddress: v4Pool.migratedFromPool,
    sender: sender,
    transactionHash: event.transaction.hash,
    transactionFrom: event.transaction.from,
    blockNumber: event.block.number,
    timestamp,
    assetAddress: v4Pool.asset!,
    quoteAddress: v4Pool.quoteToken,
    isToken0: v4Pool.isToken0,
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
        parentPoolAddress: v4Pool.migratedFromPool,
        price,
        quotePriceDecimals: quoteInfo.quotePriceDecimals,
        tickLower: 0,
        currentTick,
        graduationTick: 0,
        type: "dhook-migrated",
        baseToken: v4Pool.baseToken,
      },
      chainId: chain.id,
      context,
    },
    entityUpdaters
  );

  const isZeroForOne = amount0 > 0n;
  const feeAmount = (amountIn * BigInt(poolKey.fee)) / 1000000n;

  await Promise.all([
    updateV4Pool({
      poolId: poolIdLower,
      context,
      update: {
        price,
        tick: currentTick,
        sqrtPriceX96,
        volumeUsd: v4Pool.volumeUsd + swapValueUsd,
        lastSwapTimestamp: timestamp,
        lastRefreshed: timestamp,
        totalFee0: isZeroForOne ? v4Pool.totalFee0 + feeAmount : v4Pool.totalFee0,
        totalFee1: !isZeroForOne ? v4Pool.totalFee1 + feeAmount : v4Pool.totalFee1,
        reserves0: newReserves0,
        reserves1: newReserves1,
        dollarLiquidity,
      },
    }),
    updatePool({
      poolAddress: v4Pool.migratedFromPool,
      context,
      update: {
        price,
        sqrtPrice: sqrtPriceX96,
        tick: currentTick,
        lastRefreshed: timestamp,
        lastSwapTimestamp: timestamp,
        dollarLiquidity,
        marketCapUsd,
      },
    }),
  ]);
});

ponder.on("RehypeDopplerHookMigrator:AirlockOwnerFeesClaimed", async ({ event, context }) => {
  const { poolId, airlockOwner, fees0, fees1 } = event.args;
  console.log(`RehypeDopplerHookMigrator:AirlockOwnerFeesClaimed - Pool ${poolId}, Owner ${airlockOwner}, Fees0: ${fees0}, Fees1: ${fees1}`);
});
