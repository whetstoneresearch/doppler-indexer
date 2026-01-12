import { PriceService, SwapOrchestrator, SwapService, MarketDataService } from "@app/core";
import { CHAINLINK_ETH_DECIMALS, WAD } from "@app/utils/constants";
import { computeGraduationThresholdDelta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { ponder } from "ponder:registry";
import {
  insertLockableV3PoolIfNotExists,
  insertPoolIfNotExists,
  updatePool,
} from "./shared/entities/pool";
import {
  insertPositionIfNotExists,
  updatePosition,
} from "./shared/entities/position";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { fetchEthPrice, fetchZoraPrice } from "./shared/oracle";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { fetchV3MigrationPool, updateMigrationPool } from "./shared/entities/migrationPool";
import { insertAssetIfNotExists, updateAsset } from "./shared/entities";
import { LockableUniswapV3InitializerABI, UniswapV3PoolABI } from "@app/abis";
import { validatePoolCurrencies, shouldSkipPool } from "./shared/validatePool";

ponder.on("UniswapV3Initializer:Create", async ({ event, context }) => {
  const { poolOrHook, asset, numeraire } = event.args;
  const timestamp = event.block.timestamp;

  const creatorId = event.transaction.from.toLowerCase() as `0x${string}`;
  const numeraireId = numeraire.toLowerCase() as `0x${string}`;
  const assetId = asset.toLowerCase() as `0x${string}`;
  const poolOrHookId = poolOrHook.toLowerCase() as `0x${string}`;

  const validation = await validatePoolCurrencies(
    context, poolOrHookId, assetId, numeraireId, timestamp
  );
  if (!validation.valid) {
    console.log(`[UniswapV3Initializer:Create] Skipping invalid pool ${poolOrHookId}: ${validation.reason}`);
    return;
  }

  await insertTokenIfNotExists({
    tokenAddress: assetId,
    creatorAddress: creatorId,
    poolAddress: poolOrHookId,
    timestamp,
    context,
  });
  await insertTokenIfNotExists({
    tokenAddress: numeraireId,
    creatorAddress: creatorId,
    timestamp,
    context,
    isDerc20: false,
  });

  const [poolEntity, _] = await insertPoolIfNotExists({
    poolAddress: poolOrHookId,
    context,
    timestamp    
  });

  await insertAssetIfNotExists({
    assetAddress: assetId,
    timestamp,
    context,
    marketCapUsd: poolEntity.marketCapUsd,
  });
});

ponder.on("LockableUniswapV3Initializer:Create", async ({ event, context }) => {
  const { poolOrHook, asset, numeraire } = event.args;
  const timestamp = event.block.timestamp;

  const creatorId = event.transaction.from.toLowerCase() as `0x${string}`;
  const numeraireId = numeraire.toLowerCase() as `0x${string}`;
  const assetId = asset.toLowerCase() as `0x${string}`;
  const poolOrHookId = poolOrHook.toLowerCase() as `0x${string}`;

  const validation = await validatePoolCurrencies(
    context, poolOrHookId, assetId, numeraireId, timestamp
  );
  if (!validation.valid) {
    console.log(`[LockableUniswapV3Initializer:Create] Skipping invalid pool ${poolOrHookId}: ${validation.reason}`);
    return;
  }

  await insertTokenIfNotExists({
    tokenAddress: assetId,
    creatorAddress: creatorId,
    poolAddress: poolOrHookId,
    timestamp,
    context,
  });
  await insertTokenIfNotExists({
    tokenAddress: numeraireId,
    creatorAddress: creatorId,
    timestamp,
    context,
    isDerc20: false,
  });
  const result = await insertLockableV3PoolIfNotExists({
    poolAddress: poolOrHookId,
    context,
    timestamp,  
  });

  if (!result) {
    await insertAssetIfNotExists({
      assetAddress: assetId,
      timestamp,
      context,
      marketCapUsd: 0n,
    });
    
    return;
  }

  const [poolEntity, _] = result;

  await insertAssetIfNotExists({
    assetAddress: assetId,
    timestamp,
    context,
    marketCapUsd: poolEntity.marketCapUsd,
  });
});

ponder.on("LockableUniswapV3Initializer:Lock", async ({ event, context }) => {
  const { pool } = event.args;

  await updatePool({
    poolAddress: pool,
    context,
    update: {
      isStreaming: true,
    },
  });
});

ponder.on("LockableUniswapV3Pool:Mint", async ({ event, context }) => {
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const { tickLower, tickUpper, amount, owner, amount0, amount1 } = event.args;
  const timestamp = event.block.timestamp;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  // Price is returned in terms of quote asset
  const result = await insertLockableV3PoolIfNotExists({
    poolAddress: address,
    timestamp,
    context,    
  });

  if (!result) {
    return;
  }

  const [{
    isToken0,
    price,
    liquidity,
    reserves0,
    reserves1,
  }, quoteInfo] = result;

  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;

  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;

  const nextReservesAsset = reserveAssetBefore + reserveAssetDelta;
  const nextReservesQuote = reserveQuoteBefore + reserveQuoteDelta;

  const liquidityUsd = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const positionEntity = await insertPositionIfNotExists({
    poolAddress: address,
    tickLower,
    tickUpper,
    liquidity: amount,
    owner,
    timestamp,
    context,
  });

  await Promise.all([
    updatePool({
      poolAddress: address,
      context,
      update: {
        liquidity: liquidity + amount,
        dollarLiquidity: liquidityUsd,
        reserves0: reserves0 + amount0,
        reserves1: reserves1 + amount1,
      },
    }),
  ]);

  if (positionEntity.createdAt != timestamp) {
    await updatePosition({
      poolAddress: address,
      tickLower,
      tickUpper,
      context,
      update: {
        liquidity: positionEntity.liquidity + amount,
      },
    });
  }
});

ponder.on("LockableUniswapV3Pool:Burn", async ({ event, context }) => {
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const timestamp = event.block.timestamp;
  const { tickLower, tickUpper, owner, amount, amount0, amount1 } = event.args;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  const result = await insertLockableV3PoolIfNotExists({
    poolAddress: address,
    timestamp,
    context,    
  });

  if (!result) {
    return;
  }

  const [{
    isToken0,
    price,
    liquidity,
    reserves0,
    reserves1,
  }, quoteInfo] = result;

  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;

  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;

  const nextReservesAsset = reserveAssetBefore - reserveAssetDelta;
  const nextReservesQuote = reserveQuoteBefore - reserveQuoteDelta;

  const liquidityUsd = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const positionEntity = await insertPositionIfNotExists({
    poolAddress: address,
    tickLower,
    tickUpper,
    liquidity: amount,
    owner,
    timestamp,
    context,
  });

  await Promise.all([
    updatePool({
      poolAddress: address,
      context,
      update: {
        liquidity: liquidity - amount,
        dollarLiquidity: liquidityUsd,
        reserves0: reserves0 - amount0,
        reserves1: reserves1 - amount1,
      },
    }),
    updatePosition({
      poolAddress: address,
      tickLower,
      tickUpper,
      context,
      update: {
        liquidity: positionEntity.liquidity - amount,
      },
    }),
  ]);
});

ponder.on("LockableUniswapV3Pool:Swap", async ({ event, context }) => {
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const timestamp = event.block.timestamp;
  const { amount0, amount1, sqrtPriceX96 } = event.args;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  const slot0 = await context.client.readContract({
    abi: UniswapV3PoolABI,
    address: address,
    functionName: "slot0",
    args: [],
  });
  
  const tick = slot0[1];  

  const result = await insertLockableV3PoolIfNotExists({
    poolAddress: address,
    timestamp,
    context,
  });

  if (!result) {
    return;
  }

  const [{
    isToken0,
    baseToken,
    quoteToken,
    reserves0,
    reserves1,
    fee,
    totalFee0,
    totalFee1,
    graduationBalance,
  }, quoteInfo] = result;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;

  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;

  const nextReservesAsset = reserveAssetBefore + reserveAssetDelta;
  const nextReservesQuote = reserveQuoteBefore + reserveQuoteDelta;

  let amountIn;
  let amountOut;
  let fee0;
  let fee1;
  if (amount0 > 0n) {
    amountIn = amount0;
    amountOut = amount1;
    fee0 = (amountIn * BigInt(fee)) / BigInt(1_000_000);
    fee1 = 0n;
  } else {
    amountIn = amount1;
    amountOut = amount0;
    fee1 = (amountIn * BigInt(fee)) / BigInt(1_000_000);
    fee0 = 0n;
  }

  // buy or sell
  const type = SwapService.determineSwapType({
    isToken0,
    amount0,
    amount1,
  });

  const quoteDelta = isToken0 ? amount1 - fee1 : amount0 - fee0;

  let liquidityUsd = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const { totalSupply } = await insertTokenIfNotExists({
    tokenAddress: baseToken,
    creatorAddress: address,
    timestamp,
    context,
    isDerc20: true,
    poolAddress: address,
  });

  let marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });
  let swapValueUsd = MarketDataService.calculateVolume({
    amountIn: reserveQuoteDelta < 0n ? -reserveQuoteDelta : reserveQuoteDelta,
    amountOut: 0n,
    quotePriceUSD: quoteInfo.quotePrice!,
    isQuoteUSD: false,
    quoteDecimals: quoteInfo.quoteDecimals,
    decimals: quoteInfo.quotePriceDecimals,
  });

  // Create swap data
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

  // Create market metrics
  const metrics = {
    liquidityUsd: liquidityUsd,
    marketCapUsd,
    swapValueUsd,
    percentDayChange: 0,
  };

  // Define entity updaters
  const entityUpdaters = {
    updatePool,
    updateFifteenMinuteBucketUsd,
    updateAsset
  };

  // Perform common updates via orchestrator
  await Promise.all([
    SwapOrchestrator.performSwapUpdates(
      {
        swapData,
        swapType: type,
        metrics,
        poolData: {
          parentPoolAddress: address,
          price,
          tickLower: 0,
          currentTick: tick,
          graduationTick: 0,
          type: 'v3',
          baseToken: baseToken
        },
        chainId: context.chain.id,
        context,
      },
      entityUpdaters
    ),
    // V3-specific pool updates that aren't handled by the orchestrator
    updatePool({
      poolAddress: address,
      context,
      update: {
        sqrtPrice: sqrtPriceX96,
        totalFee0: totalFee0 + fee0,
        totalFee1: totalFee1 + fee1,
        graduationBalance: graduationBalance + quoteDelta,
        lastRefreshed: timestamp,
        reserves0: reserves0 + amount0,
        reserves1: reserves1 + amount1,
      },
    }),
  ]);
});

ponder.on("UniswapV3Pool:Mint", async ({ event, context }) => {
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const { tickLower, tickUpper, amount, owner, amount0, amount1 } = event.args;
  const timestamp = event.block.timestamp;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  const [{
    baseToken,
    isToken0,
    price,
    liquidity,
    reserves0,
    reserves1,
    maxThreshold,
  }, quoteInfo] = await insertPoolIfNotExists({
    poolAddress: address,
    timestamp,
    context,    
  });

  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;

  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;

  const nextReservesAsset = reserveAssetBefore + reserveAssetDelta;
  const nextReservesQuote = reserveQuoteBefore + reserveQuoteDelta;

  const liquidityUsd = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const graduationThresholdDelta = computeGraduationThresholdDelta({
    tickLower,
    tickUpper,
    liquidity: amount,
    isToken0,
  });

  const [positionEntity] = await Promise.all([
    insertPositionIfNotExists({
      poolAddress: address,
      tickLower,
      tickUpper,
      liquidity: amount,
      owner,
      timestamp,
      context,
    }),
  ]);

  await Promise.all([
    updatePool({
      poolAddress: address,
      context,
      update: {
        maxThreshold: maxThreshold + graduationThresholdDelta,
        liquidity: liquidity + amount,
        dollarLiquidity: liquidityUsd,
        reserves0: reserves0 + amount0,
        reserves1: reserves1 + amount1,
      },
    }),
  ]);

  if (positionEntity.createdAt != timestamp) {
    await updatePosition({
      poolAddress: address,
      tickLower,
      tickUpper,
      context,
      update: {
        liquidity: positionEntity.liquidity + amount,
      },
    });
  }
});

ponder.on("UniswapV3Pool:Burn", async ({ event, context }) => {
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const timestamp = event.block.timestamp;
  const { tickLower, tickUpper, owner, amount, amount0, amount1 } = event.args;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  const [{
    baseToken,
    isToken0,
    price,
    liquidity,
    reserves0,
    reserves1,
    maxThreshold,
  }, quoteInfo] = await insertPoolIfNotExists({
    poolAddress: address,
    timestamp,
    context    
  });

  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;

  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;

  const nextReservesAsset = reserveAssetBefore - reserveAssetDelta;
  const nextReservesQuote = reserveQuoteBefore - reserveQuoteDelta;

  const liquidityUsd = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const graduationThresholdDelta = computeGraduationThresholdDelta({
    tickLower,
    tickUpper,
    liquidity,
    isToken0,
  });

  const positionEntity = await insertPositionIfNotExists({
    poolAddress: address,
    tickLower,
    tickUpper,
    liquidity: amount,
    owner,
    timestamp,
    context,
  });

  await Promise.all([

    updatePool({
      poolAddress: address,
      context,
      update: {
        liquidity: liquidity - amount,
        dollarLiquidity: liquidityUsd,
        maxThreshold: maxThreshold - graduationThresholdDelta,
        reserves0: reserves0 - amount0,
        reserves1: reserves1 - amount1,
      },
    }),
    updatePosition({
      poolAddress: address,
      tickLower,
      tickUpper,
      context,
      update: {
        liquidity: positionEntity.liquidity - amount,
      },
    }),
  ]);
});

ponder.on("UniswapV3Pool:Swap", async ({ event, context }) => {
  const { chain } = context;
  const address = event.log.address.toLowerCase() as `0x${string}`;
  const timestamp = event.block.timestamp;
  const { amount0, amount1, sqrtPriceX96 } = event.args;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  const slot0 = await context.client.readContract({
    abi: UniswapV3PoolABI,
    address: address,
    functionName: "slot0",
    args: [],
  });
  
  const tick = slot0[1];

  const [{
    isToken0,
    baseToken,
    quoteToken,
    reserves0,
    reserves1,
    fee,
    totalFee0,
    totalFee1,
    graduationBalance,
    migrated,
  }, quoteInfo] = await insertPoolIfNotExists({
    poolAddress: address,
    timestamp,
    context    
  });

  if (migrated) {
    return;
  }

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;

  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;

  const nextReservesAsset = reserveAssetBefore + reserveAssetDelta;
  const nextReservesQuote = reserveQuoteBefore + reserveQuoteDelta;

  let amountIn;
  let amountOut;
  let fee0;
  let fee1;
  if (amount0 > 0n) {
    amountIn = amount0;
    amountOut = amount1;
    fee0 = (amountIn * BigInt(fee)) / BigInt(1_000_000);
    fee1 = 0n;
  } else {
    amountIn = amount1;
    amountOut = amount0;
    fee1 = (amountIn * BigInt(fee)) / BigInt(1_000_000);
    fee0 = 0n;
  }

  // buy or sell
  const type = SwapService.determineSwapType({
    isToken0,
    amount0,
    amount1,
  });

  const quoteDelta = isToken0 ? amount1 - fee1 : amount0 - fee0;

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const { totalSupply } = await insertTokenIfNotExists({
    tokenAddress: baseToken,
    creatorAddress: address,
    timestamp,
    context,
    isDerc20: true,
    poolAddress: address,
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals
  });

  const swapValueUsd = MarketDataService.calculateVolume({
    amountIn: reserveQuoteDelta < 0n ? -reserveQuoteDelta : reserveQuoteDelta,
    amountOut: 0n,
    quotePriceUSD: quoteInfo.quotePrice!,
    isQuoteUSD: false,
    quoteDecimals: quoteInfo.quoteDecimals,
    decimals: quoteInfo.quotePriceDecimals,
  });

  // Create swap data
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

  // Create market metrics
  const metrics = {
    liquidityUsd: dollarLiquidity,
    marketCapUsd,
    swapValueUsd,
    percentDayChange: 0,
  };

  // Define entity updaters
  const entityUpdaters = {
    updatePool,
    updateFifteenMinuteBucketUsd,
    updateAsset
  };

  // Perform common updates via orchestrator
  await Promise.all([
    SwapOrchestrator.performSwapUpdates(
      {
        swapData,
        swapType: type,
        metrics,
        poolData: {
          parentPoolAddress: address,
          price,
          tickLower: 0,
          currentTick: tick,
          graduationTick: 0,
          type: 'v3',
          baseToken: baseToken
        },
        chainId: context.chain.id,
        context,
      },
      entityUpdaters
    ),
    // V3-specific pool updates that aren't handled by the orchestrator
    updatePool({
      poolAddress: address,
      context,
      update: {
        sqrtPrice: sqrtPriceX96,
        totalFee0: totalFee0 + fee0,
        totalFee1: totalFee1 + fee1,
        graduationBalance: graduationBalance + quoteDelta,
        lastRefreshed: timestamp,
        reserves0: reserves0 + amount0,
        reserves1: reserves1 + amount1,
      },
    }),
  ]);
});

ponder.on("MigrationPool:Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)", async ({ event, context }) => {
  const { timestamp } = event.block;
  const { amount0, amount1, sqrtPriceX96 } = event.args;

  const address = event.log.address.toLowerCase() as `0x${string}`;

  if (await shouldSkipPool(context, address)) {
    return;
  }

  const slot0 = await context.client.readContract({
    abi: UniswapV3PoolABI,
    address: address,
    functionName: "slot0",
    args: [],
  });
  
  const tick = slot0[1];
  
  const v3MigrationPool = await
    fetchV3MigrationPool({
      poolAddress: address,
      context,
    });

  if (!v3MigrationPool) {
    return;
  }

  const { isToken0, reserveBaseToken, reserveQuoteToken, fee } =
    v3MigrationPool!;

  const parentPool = v3MigrationPool!.parentPool.toLowerCase() as `0x${string}`;

  const [{ baseToken, quoteToken }, quoteInfo] = await insertPoolIfNotExists({
    poolAddress: parentPool,
    timestamp,
    context    
  });
  
  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const baseTokenReserveBefore = reserveBaseToken;
  const quoteTokenReserveBefore = reserveQuoteToken;

  const baseTokenReserveDelta = isToken0 ? amount0 : amount1;
  const quoteTokenReserveDelta = isToken0 ? amount1 : amount0;

  const baseTokenReserveAfter = baseTokenReserveBefore + baseTokenReserveDelta;
  const quoteTokenReserveAfter =
    quoteTokenReserveBefore + quoteTokenReserveDelta;

  let amountIn;
  let amountOut;
  let fee0;
  let fee1;
  if (amount0 > 0n) {
    amountIn = amount0;
    amountOut = amount1;
    fee0 = (amountIn * BigInt(fee)) / BigInt(1_000_000);
    fee1 = 0n;
  } else {
    amountIn = amount1;
    amountOut = amount0;
    fee1 = (amountIn * BigInt(fee)) / BigInt(1_000_000);
    fee0 = 0n;
  }

  const type = SwapService.determineSwapType({
    isToken0,
    amount0,
    amount1,
  });

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: baseTokenReserveAfter,
    quoteBalance: quoteTokenReserveAfter,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const { totalSupply } = await insertTokenIfNotExists({
    tokenAddress: baseToken,
    creatorAddress: address,
    timestamp,
    context,
    isDerc20: true,
    poolAddress: address,
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals
  });

  const swapValueUsd = MarketDataService.calculateVolume({
    amountIn: quoteTokenReserveDelta < 0n ? -quoteTokenReserveDelta : quoteTokenReserveDelta,
    amountOut: 0n,
    quotePriceUSD: quoteInfo.quotePrice!,
    isQuoteUSD: false,
    quoteDecimals: quoteInfo.quoteDecimals,
    decimals: quoteInfo.quotePriceDecimals,
  });

  // Create swap data
  const swapData = SwapOrchestrator.createSwapData({
    poolAddress: parentPool,
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

  // Create market metrics
  const metrics = {
    liquidityUsd: dollarLiquidity,
    marketCapUsd,
    swapValueUsd,
  };

  // Define entity updaters
  const entityUpdaters = {
    updatePool,
    updateFifteenMinuteBucketUsd,
    updateAsset
  };

  // Perform common updates via orchestrator
  await Promise.all([
    SwapOrchestrator.performSwapUpdates(
      {
        swapData,
        swapType: type,
        metrics,
        poolData: {
          parentPoolAddress: parentPool,
          price,
          tickLower: 0,
          currentTick: tick,
          graduationTick: 0,
          type: 'v3',
          baseToken: baseToken
        },
        chainId: context.chain.id,
        context,
      },
      entityUpdaters
    ),
    // V3-specific pool updates that aren't handled by the orchestrator
    updatePool({
      poolAddress: parentPool,
      context,
      update: {
        sqrtPrice: sqrtPriceX96,
        lastRefreshed: timestamp,
        reserves0: baseTokenReserveAfter,
        reserves1: quoteTokenReserveAfter,
        dollarLiquidity: dollarLiquidity,
        marketCapUsd: marketCapUsd,
      },
    }),
    updateMigrationPool({
      poolAddress: address,
      context,
      update: {
        reserveBaseToken: baseTokenReserveAfter,
        reserveQuoteToken: quoteTokenReserveAfter,
      },
    }),
  ]);
});
