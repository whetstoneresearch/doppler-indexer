import { onIndexerEvent } from "./entrypoint";
import { getPoolId } from "@app/utils/v4-utils";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { insertPoolIfNotExistsDHook, updatePool } from "./shared/entities/pool";
import { insertAssetIfNotExists, updateAsset } from "./shared/entities/asset";
import { SwapOrchestrator, PriceService, MarketDataService } from "@app/core";
import { getMulticallOptions } from "@app/core/utils/multicall";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { chainConfigs } from "@app/config/chains";
import { CHAIN_IDS } from "@app/config";
import { pool, token } from "ponder:schema";
import { getQuoteInfo } from "@app/utils/getQuoteInfo";
import { computeReservesFromPositions } from "@app/utils/v4-utils/computeReservesFromPositions";
import { getPositionsForPool, upsertPositionLedger } from "./shared/entities/positionLedger";
import { PoolKey } from "@app/types/v4-types";
import { getDHookPoolData } from "@app/utils/dhook-utils";
import { StateViewABI, DopplerHookInitializerABI } from "@app/abis";
import { isPrecompileAddress } from "@app/utils/validation";
import { updateCumulatedFees } from "./shared/cumulatedFees";
import { Context } from "ponder:registry";
import { transferPoolBeneficiary } from "./shared/entities/multicurve/poolBeneficiary";
import { decodeAbiParameters, Address } from "viem";

// keccak256("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)") — v4 PoolManager.
const POOL_MANAGER_MODIFY_LIQUIDITY_TOPIC =
  "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";

async function seedPositionLedgerFromCreateTx({
  poolAddress,
  context,
  txHash,
}: {
  poolAddress: `0x${string}`;
  context: Context;
  txHash: `0x${string}`;
}): Promise<void> {
  const poolManagerAddress = chainConfigs[context.chain.name].addresses.v4.poolManager.toLowerCase();
  const receipt = await context.client.getTransactionReceipt({ hash: txHash });

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== poolManagerAddress ||
      log.topics[0] !== POOL_MANAGER_MODIFY_LIQUIDITY_TOPIC ||
      log.topics[1]?.toLowerCase() !== poolAddress
    ) {
      continue;
    }
    const [tickLower, tickUpper, liquidityDelta] = decodeAbiParameters(
      [
        { type: "int24" },
        { type: "int24" },
        { type: "int256" },
        { type: "bytes32" },
      ],
      log.data,
    );
    await upsertPositionLedger({
      poolId: poolAddress,
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      liquidityDelta,
      context,
    });
  }
}

onIndexerEvent("DopplerHookInitializer:Create", async ({ event, context }) => {
  const { asset: assetId, numeraire } = event.args;
  const { block, transaction } = event;
  const timestamp = block.timestamp;

  const assetAddress = assetId.toLowerCase() as `0x${string}`;
  const numeraireAddress = numeraire.toLowerCase() as `0x${string}`;
  const creatorAddress = transaction.from.toLowerCase() as `0x${string}`;

  if (isPrecompileAddress(assetAddress) || isPrecompileAddress(numeraireAddress)) {
    return;
  }

  const initializerAddress = event.log.address;

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

  // Seed position_ledger from this transaction's PoolManager.ModifyLiquidity logs.
  // The newer DopplerHookInitializer (0xBDF938...) does not re-emit ModifyLiquidity
  // at the initializer level, and the PoolManager:ModifyLiquidity handler can't
  // populate the ledger for these logs — they fire at a lower log index than this
  // Create event, so the dhook pool cache hasn't been told about the pool yet.
  // Replaying the receipt here makes the ledger authoritative for the seeded state.
  await seedPositionLedgerFromCreateTx({
    poolAddress,
    context,
    txHash: event.transaction.hash,
  });

  const onChainPositions = await getPositionsForPool({
    poolId: poolAddress,
    context,
  });

  if (onChainPositions.length > 0) {
    const tick = poolData.slot0Data.tick;
    const reserves = computeReservesFromPositions(onChainPositions, tick);

    const dollarLiquidity = MarketDataService.calculateLiquidity({
      assetBalance: poolEntity.isToken0 ? reserves.token0Reserve : reserves.token1Reserve,
      quoteBalance: poolEntity.isToken0 ? reserves.token1Reserve : reserves.token0Reserve,
      price,
      quotePriceUSD: quoteInfo.quotePrice!,
      decimals: quoteInfo.quotePriceDecimals,
      assetDecimals: 18,
      quoteDecimals: quoteInfo.quoteDecimals,
    });

    await updatePool({
      poolAddress,
      context,
      update: {
        reserves0: reserves.token0Reserve,
        reserves1: reserves.token1Reserve,
        dollarLiquidity,
      },
    });
  }

  await insertAssetIfNotExists({
    assetAddress,
    timestamp,
    context,
    marketCapUsd,
    poolAddress,
  });
});

onIndexerEvent("DopplerHookInitializer:Collect", async ({ event, context }) => {
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

onIndexerEvent("DopplerHookInitializer:UpdateBeneficiary", async ({ event, context }) => {
  const { poolId, oldBeneficiary, newBeneficiary } = event.args;
  const poolAddress = (poolId as string).toLowerCase() as `0x${string}`;

  await transferPoolBeneficiary({
    poolId: poolAddress,
    oldBeneficiary,
    newBeneficiary,
    timestamp: event.block.timestamp,
    context,
  });
});

/**
 * Processes a Doppler-hook (dhook/rehype) pool swap: recomputes price, reserves,
 * market cap and dollar liquidity, then writes the pool / asset / 15-min-bucket
 * updates (this path never persists a swap row and never uses `sender`).
 *
 * `priceData` supplies the post-swap sqrtPriceX96 and tick. When omitted (the
 * DopplerHookInitializer:Swap path used on non-robinhood chains) we read them with a
 * getSlot0 RPC. On robinhood the caller (PoolManager:Swap) passes them straight from
 * the event, eliminating that per-swap RPC — the realtime-throughput bottleneck on
 * that high-block-rate chain.
 */
export async function processDHookSwap({
  context,
  poolAddress,
  sender,
  amount0,
  amount1,
  timestamp,
  transactionHash,
  transactionFrom,
  blockNumber,
  priceData,
}: {
  context: Context;
  poolAddress: `0x${string}`;
  sender: Address;
  amount0: bigint;
  amount1: bigint;
  timestamp: bigint;
  transactionHash: `0x${string}`;
  transactionFrom: Address;
  blockNumber: bigint;
  priceData?: { sqrtPriceX96: bigint; currentTick: number };
}): Promise<void> {
  const { chain, client, db } = context;

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

  // On chains that don't supply the post-swap price in the event, read it once here,
  // concurrently with the ledger / quote / token reads below.
  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const slot0Promise = priceData
    ? null
    : client.readContract({
        abi: StateViewABI,
        address: stateView,
        functionName: "getSlot0",
        args: [poolAddress],
      });

  const [onChainPositions, quoteInfo, tokenEntity] = await Promise.all([
    getPositionsForPool({ poolId: poolAddress, context }),
    getQuoteInfo(poolEntity.quoteToken, timestamp, context),
    db.find(token, {
      address: poolEntity.baseToken,
      chainId: chain.id,
    }),
  ]);

  if (!tokenEntity) {
    console.warn(`Token not found for DHook swap: ${poolEntity.baseToken}`);
    return;
  }

  let sqrtPriceX96: bigint;
  let currentTick: number;
  if (priceData) {
    sqrtPriceX96 = priceData.sqrtPriceX96;
    currentTick = priceData.currentTick;
  } else {
    const slot0 = await slot0Promise!;
    sqrtPriceX96 = slot0[0];
    currentTick = slot0[1];
  }

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

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: tokenEntity.totalSupply,
    decimals: quoteInfo.quotePriceDecimals,
  });

  // Compute reserves from on-chain positions
  const reserves = computeReservesFromPositions(onChainPositions, currentTick);
  const newReserves0 = reserves.token0Reserve;
  const newReserves1 = reserves.token1Reserve;

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
    sender,
    transactionHash,
    transactionFrom,
    blockNumber,
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

  await Promise.all([
    SwapOrchestrator.performSwapUpdates(
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
    ),
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
}

onIndexerEvent("DopplerHookInitializer:Swap", async ({ event, context }) => {
  // Robinhood dhook/rehype swaps are processed in PoolManager:Swap instead, which
  // carries the post-swap sqrtPriceX96/tick and so avoids a getSlot0 RPC per swap —
  // the realtime-throughput bottleneck on that high-block-rate chain. Skipping here
  // avoids double-processing the same swap; other chains keep using this handler.
  if (context.chain.id === CHAIN_IDS.robinhood) {
    return;
  }

  const { sender, poolId, amount0, amount1 } = event.args;

  await processDHookSwap({
    context,
    poolAddress: (poolId as string).toLowerCase() as `0x${string}`,
    sender,
    amount0,
    amount1,
    timestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    transactionFrom: event.transaction.from,
    blockNumber: event.block.number,
  });
});

onIndexerEvent("DopplerHookInitializer:ModifyLiquidity", async ({ event, context }) => {
  const { key: poolKeyTuple } = event.args;
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

  // Position ledger is upserted by the PoolManager:ModifyLiquidity handler.

  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId: chain.id,
  });

  if (!poolEntity) {
    return;
  }

  const { stateView } = chainConfigs[chain.name].addresses.v4;
  const [multicallResults, onChainPositions] = await Promise.all([
    client.multicall({
      contracts: [
        {
          abi: StateViewABI,
          address: stateView,
          functionName: "getSlot0",
          args: [computedPoolId],
        },
        {
          abi: StateViewABI,
          address: stateView,
          functionName: "getLiquidity",
          args: [computedPoolId],
        },
      ],
      ...getMulticallOptions(chain),
    }),
    getPositionsForPool({ poolId: poolAddress, context }),
  ]);

  const [slot0, liquidityResult] = multicallResults;
  const tick = slot0.result?.[1] ?? 0;
  const sqrtPriceX96 = slot0.result?.[0] ?? 0n;
  const liquidity = liquidityResult.result ?? 0n;

  const reserves = computeReservesFromPositions(onChainPositions, tick);

  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: poolEntity.isToken0,
    decimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: poolEntity.isToken0 ? reserves.token0Reserve : reserves.token1Reserve,
    quoteBalance: poolEntity.isToken0 ? reserves.token1Reserve : reserves.token0Reserve,
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
      liquidity,
      reserves0: reserves.token0Reserve,
      reserves1: reserves.token1Reserve,
      dollarLiquidity,
      marketCapUsd,
      price,
      sqrtPrice: sqrtPriceX96,
      tick,
      lastRefreshed: timestamp,
    },
  });
});

// ponder.on("DopplerHookMigrator:Migrate", async ({ event, context }) => {
//   const { asset: assetAddress, poolKey: poolKeyTuple } = event.args;
//   const timestamp = event.block.timestamp;
//   const { chain, client, db } = context;

//   const poolKey: PoolKey = {
//     currency0: poolKeyTuple.currency0,
//     currency1: poolKeyTuple.currency1,
//     fee: poolKeyTuple.fee,
//     tickSpacing: poolKeyTuple.tickSpacing,
//     hooks: poolKeyTuple.hooks,
//   };

//   if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
//     return;
//   }

//   const poolId = getPoolId(poolKey);
//   const poolIdLower = poolId.toLowerCase() as `0x${string}`;

//   const { stateView } = chainConfigs[chain.name].addresses.v4;

//   const [slot0Result, liquidityResult] = await client.multicall({
//     contracts: [
//       {
//         abi: StateViewABI,
//         address: stateView,
//         functionName: "getSlot0",
//         args: [poolId],
//       },
//       {
//         abi: StateViewABI,
//         address: stateView,
//         functionName: "getLiquidity",
//         args: [poolId],
//       },
//     ],
//   });

//   const sqrtPriceX96 = slot0Result.result?.[0] ?? 0n;
//   const tick = slot0Result.result?.[1] ?? 0;
//   const liquidity = liquidityResult.result ?? 0n;

//   const MIN_TICK = -887270;
//   const MAX_TICK = 887270;

//   let reserves0 = 0n;
//   let reserves1 = 0n;

//   if (liquidity > 0n) {
//     reserves0 = getAmount0Delta({
//       tickLower: tick,
//       tickUpper: MAX_TICK,
//       liquidity,
//       roundUp: false,
//     });

//     reserves1 = getAmount1Delta({
//       tickLower: MIN_TICK,
//       tickUpper: tick,
//       liquidity,
//       roundUp: false,
//     });
//   }

//   const v4Pool = await db.find(v4pools, {
//     poolId: poolIdLower,
//     chainId: chain.id,
//   });

//   if (!v4Pool) {
//     console.warn(`DopplerHookMigrator:Migrate - Pool ${poolId} not found`);
//     return;
//   }

//   const isToken0 = assetAddress.toLowerCase() === poolKey.currency0.toLowerCase();
//   const quoteToken = isToken0 ? poolKey.currency1 : poolKey.currency0;
//   const quoteInfo = await getQuoteInfo(quoteToken, timestamp, context);

//   const price = PriceService.computePriceFromSqrtPriceX96({
//     sqrtPriceX96,
//     isToken0,
//     decimals: 18,
//     quoteDecimals: quoteInfo.quoteDecimals,
//   });

//   const dollarLiquidity = MarketDataService.calculateLiquidity({
//     assetBalance: isToken0 ? reserves0 : reserves1,
//     quoteBalance: isToken0 ? reserves1 : reserves0,
//     price,
//     quotePriceUSD: quoteInfo.quotePrice ?? 0n,
//     decimals: quoteInfo.quotePriceDecimals,
//     assetDecimals: 18,
//     quoteDecimals: quoteInfo.quoteDecimals,
//   });

//   await updateV4Pool({
//     poolId: poolIdLower,
//     context,
//     update: {
//       sqrtPriceX96,
//       tick,
//       liquidity,
//       reserves0,
//       reserves1,
//       price,
//       dollarLiquidity,
//       lastRefreshed: timestamp,
//     },
//   });
// });

// ponder.on("DopplerHookMigrator:Swap", async ({ event, context }) => {
//   const { sender, poolKey: poolKeyTuple, poolId, params, amount0, amount1 } = event.args;
//   const timestamp = event.block.timestamp;
//   const { chain, client, db } = context;

//   const poolIdLower = (poolId as string).toLowerCase() as `0x${string}`;

//   const v4Pool = await db.find(v4pools, {
//     poolId: poolIdLower,
//     chainId: chain.id,
//   });

//   if (!v4Pool || !v4Pool.migratedFromPool) {
//     return;
//   }

//   const poolKey: PoolKey = {
//     currency0: poolKeyTuple.currency0,
//     currency1: poolKeyTuple.currency1,
//     fee: poolKeyTuple.fee,
//     tickSpacing: poolKeyTuple.tickSpacing,
//     hooks: poolKeyTuple.hooks,
//   };

//   if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
//     return;
//   }

//   const { stateView } = chainConfigs[chain.name].addresses.v4;
//   const slot0 = await client.readContract({
//     abi: StateViewABI,
//     address: stateView,
//     functionName: "getSlot0",
//     args: [poolId],
//   });

//   const [sqrtPriceX96, currentTick] = slot0;

//   const quoteInfo = await getQuoteInfo(v4Pool.quoteToken, timestamp, context);

//   const price = PriceService.computePriceFromSqrtPriceX96({
//     sqrtPriceX96,
//     isToken0: v4Pool.isToken0,
//     decimals: 18,
//     quoteDecimals: quoteInfo.quoteDecimals,
//   });

//   const isCoinBuy = v4Pool.isToken0 ? amount0 < 0n : amount1 < 0n;
//   const type = isCoinBuy ? "buy" : "sell";

//   const amountIn = amount0 > 0n ? BigInt(amount0) : BigInt(amount1);
//   const amountOut = amount0 < 0n ? BigInt(-amount0) : BigInt(-amount1);

//   const tokenEntity = await db.find(token, {
//     address: v4Pool.asset!,
//     chainId: chain.id,
//   });

//   if (!tokenEntity) {
//     console.warn(`Token not found for DHookMigrator swap: ${v4Pool.asset}`);
//     return;
//   }

//   const marketCapUsd = MarketDataService.calculateMarketCap({
//     price,
//     quotePriceUSD: quoteInfo.quotePrice!,
//     totalSupply: tokenEntity.totalSupply,
//     decimals: quoteInfo.quotePriceDecimals,
//   });

//   const newReserves0 = v4Pool.reserves0 + BigInt(amount0);
//   const newReserves1 = v4Pool.reserves1 + BigInt(amount1);

//   const dollarLiquidity = MarketDataService.calculateLiquidity({
//     assetBalance: v4Pool.isToken0 ? newReserves0 : newReserves1,
//     quoteBalance: v4Pool.isToken0 ? newReserves1 : newReserves0,
//     price,
//     quotePriceUSD: quoteInfo.quotePrice!,
//     decimals: quoteInfo.quotePriceDecimals,
//     assetDecimals: 18,
//     quoteDecimals: quoteInfo.quoteDecimals,
//   });

//   const quoteDelta = v4Pool.isToken0 ? amount1 : amount0;
//   const swapValueUsd = MarketDataService.calculateVolume({
//     amountIn: quoteDelta < 0n ? -quoteDelta : quoteDelta,
//     amountOut: 0n,
//     quotePriceUSD: quoteInfo.quotePrice!,
//     isQuoteUSD: false,
//     quoteDecimals: quoteInfo.quoteDecimals,
//     decimals: quoteInfo.quotePriceDecimals,
//   });

//   const swapData = SwapOrchestrator.createSwapData({
//     poolAddress: v4Pool.migratedFromPool,
//     sender: sender,
//     transactionHash: event.transaction.hash,
//     transactionFrom: event.transaction.from,
//     blockNumber: event.block.number,
//     timestamp,
//     assetAddress: v4Pool.asset!,
//     quoteAddress: v4Pool.quoteToken,
//     isToken0: v4Pool.isToken0,
//     amountIn,
//     amountOut,
//     price,
//     usdPrice: quoteInfo.quotePrice!,
//   });

//   const marketMetrics = {
//     liquidityUsd: dollarLiquidity,
//     marketCapUsd,
//     swapValueUsd,
//   };

//   const entityUpdaters = {
//     updatePool,
//     updateFifteenMinuteBucketUsd,
//     updateAsset,
//   };

//   await SwapOrchestrator.performSwapUpdates(
//     {
//       swapData,
//       swapType: type,
//       metrics: marketMetrics,
//       poolData: {
//         parentPoolAddress: v4Pool.migratedFromPool,
//         price,
//         quotePriceDecimals: quoteInfo.quotePriceDecimals,
//         tickLower: 0,
//         currentTick,
//         graduationTick: 0,
//         type: "dhook-migrated",
//         baseToken: v4Pool.baseToken,
//       },
//       chainId: chain.id,
//       context,
//     },
//     entityUpdaters
//   );

//   const isZeroForOne = amount0 > 0n;
//   const feeAmount = (amountIn * BigInt(poolKey.fee)) / 1000000n;

//   await Promise.all([
//     updateV4Pool({
//       poolId: poolIdLower,
//       context,
//       update: {
//         price,
//         tick: currentTick,
//         sqrtPriceX96,
//         volumeUsd: v4Pool.volumeUsd + swapValueUsd,
//         lastSwapTimestamp: timestamp,
//         lastRefreshed: timestamp,
//         totalFee0: isZeroForOne ? v4Pool.totalFee0 + feeAmount : v4Pool.totalFee0,
//         totalFee1: !isZeroForOne ? v4Pool.totalFee1 + feeAmount : v4Pool.totalFee1,
//         reserves0: newReserves0,
//         reserves1: newReserves1,
//         dollarLiquidity,
//       },
//     }),
//     updatePool({
//       poolAddress: v4Pool.migratedFromPool,
//       context,
//       update: {
//         price,
//         sqrtPrice: sqrtPriceX96,
//         tick: currentTick,
//         lastRefreshed: timestamp,
//         lastSwapTimestamp: timestamp,
//         dollarLiquidity,
//         marketCapUsd,
//       },
//     }),
//   ]);
// });
