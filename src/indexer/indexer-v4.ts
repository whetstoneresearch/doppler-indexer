import { ponder } from "ponder:registry";
import { getPoolId, getV4PoolData, isV4MigratorHook } from "@app/utils/v4-utils";
import { computeV4Price } from "@app/utils/v4-utils/computeV4Price";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { insertPoolIfNotExistsV4, updatePool } from "./shared/entities/pool";
import { insertAssetIfNotExists, updateAsset } from "./shared/entities/asset";
import { fetchV4MigrationPool, updateV4Pool } from "./shared/entities/v4pools";
import {
  initializeV4MigrationPoolCache,
  isV4MigrationPoolCacheInitialized,
  isKnownV4MigrationPool,
} from "./shared/v4MigrationPoolCache";

import { insertV4ConfigIfNotExists } from "./shared/entities/v4Config";
import { getReservesV4 } from "@app/utils/v4-utils/getV4PoolData";
import { CHAINLINK_ETH_DECIMALS } from "@app/utils/constants";
import { SwapService, SwapOrchestrator, PriceService, MarketDataService } from "@app/core";
import { TickMath } from "@uniswap/v3-sdk";
import { computeGraduationPercentage } from "@app/utils/v4-utils";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { chainConfigs } from "@app/config/chains";
import { insertMulticurvePoolV4Optimized } from "./shared/entities/multicurve/pool";
import { getAmount1Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { getAmount0Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { pool, token } from "ponder:schema";
import { handleOptimizedSwap } from "./shared/swap-optimizer";
import { StateViewABI } from "@app/abis";
import { Address, zeroAddress } from "viem";
import { QuoteToken, QuoteInfo, getQuoteInfo } from "@app/utils/getQuoteInfo";

ponder.on("UniswapV4Initializer:Create", async ({ event, context }) => {
  const { poolOrHook, asset: assetId, numeraire } = event.args;
  const { block } = event;
  const timestamp = block.timestamp;

  const poolAddress = poolOrHook.toLowerCase() as `0x${string}`;
  const assetAddress = assetId.toLowerCase() as `0x${string}`;
  const numeraireAddress = numeraire.toLowerCase() as `0x${string}`;
  
  const creatorAddress = event.transaction.from.toLowerCase() as `0x${string}`;  
    
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

  const quoteInfo = await getQuoteInfo(numeraireAddress, timestamp, context);

  const poolData = await getV4PoolData({
    hook: poolAddress,
    context,
    quoteInfo,
  });

  const { totalSupply } = baseToken;

  const [poolEntity] = await Promise.all([
    insertPoolIfNotExistsV4({
      poolAddress,
      timestamp,
      ethPrice: quoteInfo.quotePrice!,
      poolData,
      context,
    }),
    insertV4ConfigIfNotExists({
      hookAddress: poolAddress,
      context,
    }),
  ]);

  const price = poolEntity.price;
  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals
  });

  await Promise.all([
    insertAssetIfNotExists({
      assetAddress: assetAddress,
      timestamp,
      context,
      marketCapUsd,
    }),
  ]);
});

ponder.on("UniswapV4Pool:Swap", async ({ event, context }) => {
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const { chain } = context;
  const { currentTick, totalProceeds, totalTokensSold } = event.args;
  const timestamp = event.block.timestamp;

  const v4PoolData = 
    await getV4PoolData({
      hook: address,
      context,
    });
  
  const quoteAddress = v4PoolData.poolConfig.isToken0
    ? v4PoolData.poolKey.currency1
    : v4PoolData.poolKey.currency0;
  
  const quoteInfo = await getQuoteInfo(quoteAddress, timestamp, context);

  const [reserves, poolEntity] = await Promise.all([
    getReservesV4({
      hook: address,
      context,
    }),
    insertPoolIfNotExistsV4({
      poolAddress: address,
      timestamp,
      ethPrice: quoteInfo.quotePrice!,
      poolData: v4PoolData,
      context,
    }),
  ]);

  const {
    isToken0,
    baseToken,
    quoteToken,
    totalProceeds: totalProceedsPrev,
    totalTokensSold: totalTokensSoldPrev,
    marketCapUsd: marketCapUsdPrev,
  } = poolEntity;

  const quoteIn = totalProceeds > totalProceedsPrev;
  const amountIn = quoteIn
    ? totalProceeds - totalProceedsPrev
    : totalTokensSoldPrev - totalTokensSold;
  const amountOut = quoteIn
    ? totalTokensSoldPrev - totalTokensSold
    : totalProceedsPrev - totalProceeds;

  const type = SwapService.determineSwapTypeV4({
    currentProceeds: totalProceeds,
    previousProceeds: totalProceedsPrev,
  });

  const { totalSupply } = await insertTokenIfNotExists({
    tokenAddress: baseToken,
    creatorAddress: event.transaction.from,
    timestamp,
    context,
  });

  const sqrtPriceX96 = BigInt(
    TickMath.getSqrtRatioAtTick(currentTick).toString()
  );
  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const { token0Reserve, token1Reserve } = reserves;

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: isToken0 ? token0Reserve : token1Reserve,
    quoteBalance: isToken0 ? token1Reserve : token0Reserve,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  let marketCapUsd;
  if (price == 340256786698763678858396856460488307819979090561464864775n) {
    marketCapUsd = marketCapUsdPrev;
  } else {
    marketCapUsd = MarketDataService.calculateMarketCap({
      price,
      quotePriceUSD: quoteInfo.quotePrice!,
      totalSupply,
      decimals: quoteInfo.quotePriceDecimals
    });
  }

  // Calculate swap value using quote token delta
  const quoteDelta = totalProceeds - totalProceedsPrev;
  const swapValueUsd = ((quoteDelta < 0n ? -quoteDelta : quoteDelta) * quoteInfo.quotePrice!) / (BigInt(10) ** BigInt(quoteInfo.quotePriceDecimals));

  const swapData = SwapOrchestrator.createSwapData({
    poolAddress: address,
    sender: event.transaction.from,
    transactionHash: event.transaction.hash,
    transactionFrom: event.transaction.from,
    blockNumber: event.block.number,
    timestamp,
    assetAddress: baseToken,
    quoteAddress: quoteToken,
    isToken0,
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
    updateAsset
  };

  await SwapOrchestrator.performSwapUpdates(
    {
      swapData,
      swapType: type,
      metrics: marketMetrics,
      poolData: {
        parentPoolAddress: address,
        price,
        tickLower: 0,
        currentTick: currentTick,
        graduationTick: 0,
        type: 'multicurve',
        baseToken: poolEntity.baseToken
      },
      chainId: chain.id,
      context,
    },
    entityUpdaters
  );

  // Calculate graduation percentage
  const graduationPercentage = computeGraduationPercentage({
    maxThreshold: poolEntity.maxThreshold,
    graduationBalance: totalProceeds,
  });

  // V4-specific updates
  await Promise.all([
    updatePool({
      poolAddress: address,
      context,
      update: {
        liquidity: v4PoolData.liquidity,
        graduationBalance: totalProceeds,
        graduationPercentage,
        totalProceeds,
        totalTokensSold,
      },
    }),
  ]);
});

ponder.on(
  "UniswapV4MulticurveInitializer:Create",
  async ({ event, context }) => {
    const { asset: assetId } = event.args;
    const { block } = event;
    const timestamp = block.timestamp;

    const poolState = await context.client.readContract({
      abi: UniswapV4MulticurveInitializerABI,
      address:
        chainConfigs[context.chain.name].addresses.v4.v4MulticurveInitializer,
      functionName: "getState",
      args: [assetId],
    });

    const poolKey = poolState[2];

    const poolId = getPoolId(poolKey);

    const poolAddress = poolId.toLowerCase() as `0x${string}`;
    const assetAddress = assetId.toLowerCase() as `0x${string}`;
    const creatorAddress =
      event.transaction.from.toLowerCase() as `0x${string}`;

    const poolEntity = await insertMulticurvePoolV4Optimized({
      poolAddress,
      timestamp,
      poolKey,
      context,
      creatorAddress,
      scheduled: false
    });
    if (!poolEntity) return;
    const assetEntity = await insertAssetIfNotExists({
      assetAddress: assetAddress,
      timestamp,
      context,
      marketCapUsd: poolEntity.marketCapUsd,
      poolAddress,
    });
    await updatePool({
      poolAddress: poolAddress,
      context,
      update: {
        integrator: assetEntity.integrator,
      },
    })
  }
);

ponder.on(
  "UniswapV4MulticurveInitializerHook:ModifyLiquidity",
  async ({ event, context }) => {
    const { key, params } = event.args;
    const { block } = event;
    const timestamp = block.timestamp;

    const creatorAddress =
      event.transaction.from.toLowerCase() as `0x${string}`;
    const poolId = getPoolId(key);
    const poolAddress = poolId.toLowerCase() as `0x${string}`;

    const poolEntity = await insertMulticurvePoolV4Optimized({
      creatorAddress,
      poolAddress,
      timestamp,
      poolKey: key,
      context,
      scheduled: false
    });

    if (!poolEntity) return;

    const baseTokenEntity = await context.db.find(token, {
      address: poolEntity.baseToken,
      chainId: context.chain.id,
    });    

    // Calculate reserves only if needed
    let token0Reserve = poolEntity.reserves0;
    let token1Reserve = poolEntity.reserves1;
    let liquidity = poolEntity.liquidity;
    const tick = poolEntity.tick;
    const sqrtPrice = poolEntity.sqrtPrice;

    const { tickLower, tickUpper, liquidityDelta } = params;
    liquidity += liquidityDelta;
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
      sqrtPriceX96: sqrtPrice,
      isToken0: poolEntity.isToken0,
      decimals: 18,
      quoteDecimals: quoteInfo.quoteDecimals
    });
    
    const marketCapUsd = MarketDataService.calculateMarketCap({
      price,
      quotePriceUSD: quoteInfo.quotePrice!,
      totalSupply: baseTokenEntity!.totalSupply,
      decimals: quoteInfo.quotePriceDecimals,
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


    await updatePool({
      poolAddress: poolAddress,
      context,
      update: {
        liquidity,
        reserves0: token0Reserve,
        reserves1: token1Reserve,
        dollarLiquidity,
        marketCapUsd,
      },
    });
  }
);

ponder.on(
  "UniswapV4MulticurveInitializerHook:Swap",
  async ({ event, context }) => {
    const { poolId, sender, amount0, amount1 } = event.args;
    const timestamp = event.block.timestamp;

    const poolEntity = await context.db.find(pool, {
      address: poolId,
      chainId: context.chain.id,
    });

    if (!poolEntity) {
      return;
    }

    const slot0 = await context.client.readContract({
      abi: StateViewABI,
      address: chainConfigs[context.chain.name].addresses.v4.stateView,
      functionName: "getSlot0",
      args: [poolId],
    });
    
    const tick = slot0[1];

    const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);
    
    const sqrtPriceX96 = slot0?.[0] ?? 0n;

    const isCoinBuy = poolEntity.isToken0
      ? amount0 > amount1
      : amount1 > amount0;

    await handleOptimizedSwap(
      {
        poolAddress: poolId,
        swapSender: sender,
        amount0,
        amount1,
        sqrtPriceX96,
        isCoinBuy,
        timestamp,
        transactionHash: event.transaction.hash,
        transactionFrom: event.transaction.from,
        blockNumber: event.block.number,
        context,
        tick
      },
      quoteInfo
    );
  },
);

ponder.on("PoolManager:Swap", async ({ event, context }) => {
  const { id: poolId, sender, amount0, amount1, sqrtPriceX96, liquidity, tick, fee } = event.args;
  const { timestamp } = event.block;
  const { hash: txHash, from: txFrom } = event.transaction;
  const { chain, client } = context;

  if (!isV4MigrationPoolCacheInitialized()) {
    await initializeV4MigrationPoolCache(context);
  }

  if (!isKnownV4MigrationPool(chain.id, poolId as string)) {
    return;
  }

  const v4Pool = await fetchV4MigrationPool({
    poolId: poolId as `0x${string}`,
    context,
  });

  if (!v4Pool || !v4Pool.migratedFromPool) {
    return;
  }

  if (!isV4MigratorHook(v4Pool.hooks, chain.name)) {
    return;
  }

  const quoteInfo = await getQuoteInfo(v4Pool.quoteToken, timestamp, context);

  const newTick = Number(tick);
  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: v4Pool.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const amountIn = amount0 > 0n ? BigInt(amount0) : BigInt(amount1);
  const amountOut = amount0 < 0n ? BigInt(-amount0) : BigInt(-amount1);
  const isZeroForOne = amount0 > 0n;

  const type = SwapService.determineSwapType({
    isToken0: v4Pool.isToken0,
    amount0: amount0 > 0n ? BigInt(amount0) : BigInt(-amount0),
    amount1: amount1 > 0n ? BigInt(amount1) : BigInt(-amount1),
  });

  let existingToken = await context.db.find(token, {
    address: v4Pool.asset!,
    chainId: chain.id,
  });
  
  if (!existingToken) {
    existingToken = await insertTokenIfNotExists({
      tokenAddress: v4Pool.asset!,
      creatorAddress: txFrom.toLowerCase() as Address,
      timestamp,
      context,
      isDerc20: true,
    });
  }
  
  const { totalSupply } = existingToken;

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice ?? 0n,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });

  let quoteDelta: bigint;
  if (v4Pool.isToken0) {
    quoteDelta = amount1 > 0n ? BigInt(amount1) : BigInt(-amount1);
  } else {
    quoteDelta = amount0 > 0n ? BigInt(amount0) : BigInt(-amount0);
  }
  const swapValueUsd = (quoteDelta * (quoteInfo.quotePrice ?? 0n)) / 
    (BigInt(10) ** BigInt(quoteInfo.quotePriceDecimals));

  const swapData = SwapOrchestrator.createSwapData({
    poolAddress: v4Pool.migratedFromPool, // Use parent pool address for tracking
    sender: sender.toLowerCase() as Address,
    transactionHash: txHash,
    transactionFrom: txFrom,
    blockNumber: event.block.number,
    timestamp,
    assetAddress: v4Pool.asset!,
    quoteAddress: v4Pool.quoteToken,
    isToken0: v4Pool.isToken0,
    amountIn,
    amountOut,
    price,
    usdPrice: quoteInfo.quotePrice ?? 0n,
  });

  const feeAmount = (amountIn * BigInt(fee)) / 1000000n;
  
  const entityUpdaters = {
    updatePool,
    updateFifteenMinuteBucketUsd,
    updateAsset,
  };

  const newReserves0 = v4Pool.reserves0 + BigInt(amount0);
  const newReserves1 = v4Pool.reserves1 + BigInt(amount1);

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: v4Pool.isToken0 ? newReserves0 : newReserves1,
    quoteBalance: v4Pool.isToken0 ? newReserves1 : newReserves0,
    price,
    quotePriceUSD: quoteInfo.quotePrice ?? 0n,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const marketMetrics = {
    liquidityUsd: dollarLiquidity,
    marketCapUsd,
    swapValueUsd,
  };

  await Promise.all([
    SwapOrchestrator.performSwapUpdates(
      {
        swapData,
        swapType: type,
        metrics: marketMetrics,
        poolData: {
          parentPoolAddress: v4Pool.migratedFromPool,
          price,
          tickLower: 0,
          currentTick: newTick,
          graduationTick: 0,
          type: "v4-migrated",
          baseToken: v4Pool.baseToken,
        },
        chainId: chain.id,
        context,
      },
      entityUpdaters
    ),    
    updateV4Pool({
      poolId: poolId as `0x${string}`,
      context,
      update: {
        price,
        tick: newTick,
        sqrtPriceX96,
        liquidity,
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
        tick: newTick,
        lastRefreshed: timestamp,
        lastSwapTimestamp: timestamp,
        dollarLiquidity,
        marketCapUsd,
      },
    }),
  ]);
});

ponder.on("UniswapV4MigratorHook:ModifyLiquidity", async ({ event, context }) => {
  const { key, params } = event.args;
  const { tickLower, tickUpper, liquidityDelta } = params;
  const { timestamp } = event.block;

  const poolId = getPoolId({
    currency0: key.currency0,
    currency1: key.currency1,
    fee: key.fee,
    tickSpacing: key.tickSpacing,
    hooks: key.hooks,
  });

  let v4Pool = await fetchV4MigrationPool({
    poolId: poolId as `0x${string}`,
    context,
  });

  if (!v4Pool) {
    return;
  }



  const quoteInfo = await getQuoteInfo(v4Pool.quoteToken, timestamp, context);

  const newLiquidity = liquidityDelta > 0n
    ? v4Pool.liquidity + BigInt(liquidityDelta)
    : v4Pool.liquidity - BigInt(-liquidityDelta);

  const tick = v4Pool.tick;
  let reserves0Delta = 0n;
  let reserves1Delta = 0n;

  if (tick < tickLower) {
    reserves0Delta = getAmount0Delta({
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      liquidity: liquidityDelta,
      roundUp: false,
    });
  } else if (tick < tickUpper) {
    reserves0Delta = getAmount0Delta({
      tickLower: tick,
      tickUpper: Number(tickUpper),
      liquidity: liquidityDelta,
      roundUp: false,
    });
    reserves1Delta = getAmount1Delta({
      tickLower: Number(tickLower),
      tickUpper: tick,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  } else {
    reserves1Delta = getAmount1Delta({
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      liquidity: liquidityDelta,
      roundUp: false,
    });
  }

  const newReserves0 = v4Pool.reserves0 + reserves0Delta;
  const newReserves1 = v4Pool.reserves1 + reserves1Delta;

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: v4Pool.isToken0 ? newReserves0 : newReserves1,
    quoteBalance: v4Pool.isToken0 ? newReserves1 : newReserves0,
    price: v4Pool.price,
    quotePriceUSD: quoteInfo.quotePrice ?? 0n,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  await updateV4Pool({
    poolId: poolId as `0x${string}`,
    context,
    update: {
      liquidity: newLiquidity,
      reserves0: newReserves0,
      reserves1: newReserves1,
      dollarLiquidity,
      lastRefreshed: timestamp,
    },
  });
});

ponder.on("PoolManager:Donate", async ({ event, context }) => {
  const { id: poolId, amount0, amount1 } = event.args;
  const { timestamp } = event.block;
  const { chain } = context;

  const v4Pool = await fetchV4MigrationPool({
    poolId: poolId as `0x${string}`,
    context,
  });

  if (!v4Pool || !v4Pool.migratedFromPool) {
    return;
  }

  if (!isV4MigratorHook(v4Pool.hooks, chain.name)) {
    return;
  }

  const newReserves0 = v4Pool.reserves0 + amount0;
  const newReserves1 = v4Pool.reserves1 + amount1;

  const quoteInfo = await getQuoteInfo(v4Pool.quoteToken, timestamp, context);

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: v4Pool.isToken0 ? newReserves0 : newReserves1,
    quoteBalance: v4Pool.isToken0 ? newReserves1 : newReserves0,
    price: v4Pool.price,
    quotePriceUSD: quoteInfo.quotePrice ?? 0n,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  await updateV4Pool({
    poolId: poolId as `0x${string}`,
    context,
    update: {
      reserves0: newReserves0,
      reserves1: newReserves1,
      dollarLiquidity,
      lastRefreshed: timestamp,
    },
  });
});

ponder.on("PoolManager:Initialize", async ({ event, context }) => {
  const { id: poolId, currency0, currency1, fee, tickSpacing, hooks, sqrtPriceX96, tick } = event.args;
  const { timestamp } = event.block;
  const { chain } = context;

  if (!isV4MigratorHook(hooks, chain.name)) {
    return;
  }

  let existingV4Pool = await fetchV4MigrationPool({
    poolId: poolId as `0x${string}`,
    context,
  });

  if (!existingV4Pool) {
    const { insertV4PoolFromInitialize } = await import("./shared/entities/v4pools");
    existingV4Pool = await insertV4PoolFromInitialize({
      poolId: poolId as `0x${string}`,
      currency0: currency0 as `0x${string}`,
      currency1: currency1 as `0x${string}`,
      fee,
      tickSpacing,
      hooks: hooks as `0x${string}`,
      sqrtPriceX96,
      tick,
      timestamp,
      context,
    });
    
    if (!existingV4Pool) {
      console.warn(`Failed to create V4 pool ${poolId} from Initialize event`);
      return;
    }
  }

  const quoteInfo = await getQuoteInfo(existingV4Pool.quoteToken, timestamp, context);

  const price = computeV4Price({
    currentTick: Number(tick),
    isToken0: existingV4Pool.isToken0,
    baseTokenDecimals: 18,
    quoteTokenDecimals: quoteInfo.quoteDecimals,
  });

  await updateV4Pool({
    poolId: poolId as `0x${string}`,
    context,
    update: {
      price,
      tick: Number(tick),
      sqrtPriceX96: sqrtPriceX96,
      lastRefreshed: timestamp,
    },
  });
});
