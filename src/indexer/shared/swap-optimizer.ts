import { Context } from "ponder:registry";
import { pool, token } from "ponder:schema";
import { Address, zeroAddress } from "viem";
import { SwapOrchestrator } from "@app/core";
import { SwapService, MarketDataService, PriceService } from "@app/core";
import { QuoteToken, QuoteInfo, getQuoteInfo } from "@app/utils/getQuoteInfo";
import { updateAsset, updatePool } from "./entities";
import { chainConfigs } from "@app/config";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { SwapType } from "@app/types";
import { CHAINLINK_ETH_DECIMALS, WAD } from "@app/utils/constants";
import { insertSwapIfNotExists } from "./entities/swap";

interface SwapHandlerParams {
  poolAddress: `0x${string}`; // can be 32byte poolid or 20byte pool address
  swapSender: Address;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  isCoinBuy: boolean;
  timestamp: bigint;
  transactionHash: `0x${string}`;
  transactionFrom: Address;
  blockNumber: bigint;
  context: Context;
  tick: number;
}

interface ProcessedSwapData {
  price: bigint;
  dollarLiquidity: bigint;
  marketCapUsd: bigint;
  swapValueUsd: bigint;
  nextReserves0: bigint;
  nextReserves1: bigint;
  fee0: bigint;
  fee1: bigint;
  swapType: SwapType;
  amountIn: bigint;
  amountOut: bigint;
}

/**
 * Process swap calculations in batch
 */
export function processSwapCalculations(
  poolEntity: typeof pool.$inferSelect,
  params: SwapHandlerParams,
  usdPrice: bigint,
  quoteDecimals: number = 18
): ProcessedSwapData {
  const { amount0, amount1, sqrtPriceX96, isCoinBuy } = params;
  const { isToken0, reserves0, reserves1, fee } = poolEntity;
  
  // Calculate price
  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: 18,
    quoteDecimals
  });
  
  // Calculate reserves
  const reserveAssetBefore = isToken0 ? reserves0 : reserves1;
  const reserveQuoteBefore = isToken0 ? reserves1 : reserves0;
  const reserveAssetDelta = isToken0 ? amount0 : amount1;
  const reserveQuoteDelta = isToken0 ? amount1 : amount0;
  
  const realQuoteDelta = isCoinBuy ? reserveQuoteDelta : -reserveQuoteDelta;
  const realAssetDelta = isCoinBuy ? -reserveAssetDelta : reserveAssetDelta;
  
  const nextReservesAsset = reserveAssetBefore + realAssetDelta;
  const nextReservesQuote = reserveQuoteBefore + realQuoteDelta;
  
  // Calculate fees
  let amountIn, amountOut, fee0, fee1;
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
  
  // Determine swap type
  const swapType = SwapService.determineSwapType({
    isToken0,
    amount0,
    amount1,
  });
  
  // Calculate dollar values
  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: nextReservesAsset,
    quoteBalance: nextReservesQuote,
    price,
    quotePriceUSD: usdPrice,
    decimals: quoteDecimals,
  });
  
  const swapValueUsd = ((reserveQuoteDelta < 0n ? -reserveQuoteDelta : reserveQuoteDelta) * 
    usdPrice) / (BigInt(10) ** BigInt(quoteDecimals));
  
  return {
    price,
    dollarLiquidity,
    marketCapUsd: 0n, // Will be calculated after token fetch
    swapValueUsd,
    nextReserves0: reserves0 - amount0,
    nextReserves1: reserves1 - amount1,
    fee0,
    fee1,
    swapType,
    amountIn,
    amountOut,
  };
}

/**
 * Optimized swap handler for both V4 hooks
 */
export async function handleOptimizedSwap(
  params: SwapHandlerParams,
  quoteInfo: QuoteInfo
): Promise<void> {
  const { context, timestamp } = params;
  const { db, chain } = context;
  const poolAddress = params.poolAddress;

  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId: chain.id,
  })
  
  if (!poolEntity) {
    return;
  }  
  
  const swapData = processSwapCalculations(
    poolEntity,
    params,
    quoteInfo.quotePrice!,
    quoteInfo.quoteDecimals
  );

  const tokenEntity = await db.find(token, {
    address: poolEntity.baseToken,
    chainId: chain.id,
  });

  if (!tokenEntity) {
    return;
  }
  
  // Calculate market cap
  const marketCapUsd = MarketDataService.calculateMarketCap({
    price: swapData.price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: tokenEntity.totalSupply,
    decimals: quoteInfo.quoteDecimals,
  });


  
  // Create swap data for orchestrator
  const orchestratorSwapData = SwapOrchestrator.createSwapData({
    poolAddress,
    sender: params.transactionFrom,
    transactionHash: params.transactionHash,
    transactionFrom: params.transactionFrom,
    blockNumber: params.blockNumber,
    timestamp,
    assetAddress: poolEntity.baseToken,
    quoteAddress: poolEntity.quoteToken,
    isToken0: poolEntity.isToken0,
    amountIn: swapData.amountIn,
    amountOut: swapData.amountOut,
    price: swapData.price,
    usdPrice: quoteInfo.quotePrice!,
  });

  // Create metrics
  const metrics = {
    liquidityUsd: swapData.dollarLiquidity,
    marketCapUsd,
    swapValueUsd: swapData.swapValueUsd,
  };
  
  // Define entity updaters
  const entityUpdaters = {
    updatePool,
    updateFifteenMinuteBucketUsd,
    updateAsset
  };

  const isQuoteEth = (quoteInfo.quoteToken === QuoteToken.Eth) ? true : false
  // Execute all updates in parallel
  await Promise.all([
    SwapOrchestrator.performSwapUpdates(
      {
        swapData: orchestratorSwapData,
        swapType: swapData.swapType,
        metrics,
        poolData: {
          parentPoolAddress: poolAddress,
          price: swapData.price,
          isQuoteEth,
          tickLower: poolEntity.tickLower,
          currentTick: params.tick,
          graduationTick: poolEntity.graduationTick,
          type: poolEntity.type,
          baseToken: poolEntity.baseToken
        },
        chainId: chain.id,
        context,
      },
      entityUpdaters
    ),
    insertSwapIfNotExists({
      txHash: params.transactionHash,
      timestamp,
      context,
      pool: poolAddress,
      asset: poolEntity.baseToken,
      chainId: context.chain.id,
      type: swapData.swapType,
      user: params.transactionFrom,
      amountIn: swapData.amountIn,
      amountOut: swapData.amountOut,
      swapValueUsd: swapData.swapValueUsd,
    }),
  ]);

  await updatePool({
    poolAddress: poolAddress,
    context,
    update: {
      reserves0: swapData.nextReserves0,
      reserves1: swapData.nextReserves1,
    },
  });
}
