import { ponder } from "ponder:registry";
import { v2Pool } from "ponder:schema";
import { zeroAddress } from "viem";
import { CHAINLINK_ETH_DECIMALS, SHARED_ADDRESSES } from "@app/config/const";
import { SwapService, PriceService, SwapOrchestrator } from "@app/core";
import { updateAsset } from "./shared/entities/asset";
import { insertPoolIfNotExists, updatePool } from "./shared/entities/pool";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { updateV2Pool } from "./shared/entities/v2Pool";
import { fetchEthPrice } from "./shared/oracle";
import { tryAddActivePool } from "./shared/scheduledJobs";
import { compute24HourPriceChange, insertOrUpdateBuckets, insertOrUpdateDailyVolume } from "./shared/timeseries";
import { getPairData } from "./utils";
import { insertSwapIfNotExists } from "./shared/entities/swap";

ponder.on("UniswapV2Pair:Swap", async ({ event, context }) => {
  const { db, chain } = context;
  const { timestamp } = event.block;
  const { amount0In, amount1In, amount0Out, amount1Out } = event.args;

  const address = event.log.address.toLowerCase() as `0x${string}`;

  const v2PoolData = await db.find(v2Pool, { address });

  const parentPool = v2PoolData?.parentPool.toLowerCase();

  if (!parentPool) {
    // TODO: find proper way to handle this
    return;
  }

  const [reserves, ethPrice] = await Promise.all([
    getPairData({ address, context }),
    fetchEthPrice(timestamp, context),
  ]);

  const { reserve0, reserve1 } = reserves;

  const { isToken0, baseToken, quoteToken } = await insertPoolIfNotExists({
    poolAddress: parentPool as `0x${string}`,
    timestamp,
    context,
    ethPrice,
  });

  let v2isToken0 = isToken0;
  if (quoteToken.toLowerCase() == zeroAddress) {
    v2isToken0 = baseToken.toLowerCase() < SHARED_ADDRESSES.weth.toLowerCase();
  }

  const assetBalance = v2isToken0 ? reserve0 : reserve1;
  const quoteBalance = v2isToken0 ? reserve1 : reserve0;

  const amount0 = amount0In > 0 ? amount0In : -amount0Out;

  const type = SwapService.determineSwapType({
    isToken0: v2isToken0,
    amount0,
  });

  const price = PriceService.computePriceFromReserves({
    assetBalance,
    quoteBalance,
  });

  const { totalSupply } = await insertTokenIfNotExists({
    tokenAddress: baseToken,
    creatorAddress: address,
    timestamp,
    context,
    isDerc20: true,
  });

  const metrics = SwapService.calculateMarketMetrics({
    totalSupply,
    price,
    swapAmountIn: amount0In > 0 ? amount0In : amount1In,
    swapAmountOut: amount0Out > 0 ? amount0Out : amount1Out,
    ethPriceUSD: ethPrice,
    assetDecimals: 18,
    assetBalance,
    quoteBalance,
    isQuoteETH: true,
  });

  let quoteDelta = 0n;
  if (v2isToken0) {
    if (amount1In > 0n) {
      quoteDelta = amount1In;
    } else {
      quoteDelta = amount1Out;
    }
  } else {
    if (amount0In > 0n) {
      quoteDelta = amount0In;
    } else {
      quoteDelta = amount0Out;
    }
  }
  const swapValueUsd = (quoteDelta * ethPrice) / CHAINLINK_ETH_DECIMALS;

  const priceChange = await compute24HourPriceChange({
    poolAddress: address,
    marketCapUsd: metrics.marketCapUsd,
    context,
  });

  // Create swap data
  const swapData = SwapOrchestrator.createSwapData({
    poolAddress: parentPool as `0x${string}`,
    sender: event.transaction.from,
    transactionHash: event.transaction.hash,
    transactionFrom: event.transaction.from,
    blockNumber: event.block.number,
    timestamp,
    assetAddress: baseToken,
    quoteAddress: quoteToken,
    isToken0: v2isToken0,
    amountIn: amount0In > 0 ? amount0In : amount1In,
    amountOut: amount0Out > 0 ? amount0Out : amount1Out,
    price,
    ethPriceUSD: ethPrice,
  });

  // Create market metrics
  const marketMetrics = {
    liquidityUsd: metrics.liquidityUsd,
    marketCapUsd: metrics.marketCapUsd,
    swapValueUsd,
    percentDayChange: priceChange,
  };

  // Define entity updaters
  const entityUpdaters = {
    updatePool,
    updateAsset,
    insertSwap: insertSwapIfNotExists,
    insertOrUpdateBuckets,
    insertOrUpdateDailyVolume,
    tryAddActivePool,
  };

  // Perform common updates via orchestrator
  await Promise.all([
    await SwapOrchestrator.performSwapUpdates(
      {
        swapData,
        swapType: type,
        metrics: marketMetrics,
        poolData: {
          parentPoolAddress: parentPool as `0x${string}`,
          price,
        },
        chainId: BigInt(chain!.id),
        context,
      },
      entityUpdaters
    ),
    await updateV2Pool({
      poolAddress: address,
      context,
      update: { price: (price * ethPrice) / CHAINLINK_ETH_DECIMALS },
    }),
  ]);

  // V2-specific updates
});

/* =================== INFO =================== */
/* COMMENT THIS OUT IF DOING LOCAL DEVELOPMENT */
/* DONT ASK QUESTIONS JUST DO IT */
/* ========================================= */
// TODO: Better solution
// ponder.on("UniswapV2PairUnichain:Swap", async ({ event, context }) => {
//   const { db, chain } = context;
//   const { address } = event.log;
//   const { timestamp } = event.block;
//   const { amount0In, amount1In, amount0Out, amount1Out } = event.args;

//   const v2PoolData = await db.find(v2Pool, { address });
//   if (!v2PoolData) return;

//   const { parentPool } = v2PoolData;

//   const { reserve0, reserve1 } = await getPairData({ address, context });

//   const ethPrice = await fetchEthPrice(timestamp, context);

//   const { isToken0, baseToken, quoteToken } = await insertPoolIfNotExists({
//     poolAddress: parentPool,
//     timestamp,
//     context,
//     ethPrice,
//   });

//   const amountIn = amount0In > 0 ? amount0In : amount1In;
//   const amountOut = amount0Out > 0 ? amount0Out : amount1Out;

//   const assetBalance = isToken0 ? reserve0 : reserve1;
//   const quoteBalance = isToken0 ? reserve1 : reserve0;

//   const amount0 = amount0In > 0 ? amount0In : -amount0Out;
//   const amount1 = amount0Out > 0 ? amount0Out : -amount1Out;

//   const type = SwapService.determineSwapType({
//     isToken0,
//     amount0,
//     amount1,
//   });

//   const price = PriceService.computePriceFromReserves({
//     assetBalance,
//     quoteBalance,
//   });

//   const { totalSupply } = await insertTokenIfNotExists({
//     tokenAddress: baseToken,
//     creatorAddress: address,
//     timestamp,
//     context,
//     isDerc20: true,
//   });

//   const marketCapUsd = computeMarketCap({
//     price,
//     ethPrice,
//     totalSupply,
//   });

//   const priceChange = await compute24HourPriceChange({
//     poolAddress: parentPool,
//     marketCapUsd,
//     context,
//   });

//   const liquidityUsd = await computeDollarLiquidity({
//     assetBalance,
//     quoteBalance,
//     price,
//     ethPrice,
//   });

//   let quoteDelta = 0n;
//   if (isToken0) {
//     if (amount1In > 0n) {
//       quoteDelta = amount1In;
//     } else {
//       quoteDelta = amount1Out;
//     }
//   } else {
//     if (amount0In > 0n) {
//       quoteDelta = amount0In;
//     } else {
//       quoteDelta = amount0Out;
//     }
//   }
//   const swapValueUsd = (quoteDelta * ethPrice) / CHAINLINK_ETH_DECIMALS;

//   // Create swap data
//   const swapData = SwapOrchestrator.createSwapData({
//     poolAddress: parentPool,
//     sender: event.transaction.from,
//     transactionHash: event.transaction.hash,
//     transactionFrom: event.transaction.from,
//     blockNumber: event.block.number,
//     timestamp,
//     assetAddress: baseToken,
//     quoteAddress: quoteToken,
//     isToken0,
//     amountIn,
//     amountOut,
//     price,
//     ethPriceUSD: ethPrice,
//   });

//   // Create market metrics
//   const marketMetrics = {
//     liquidityUsd,
//     marketCapUsd,
//     swapValueUsd,
//     percentDayChange: priceChange,
//   };

//   // Define entity updaters
//   const entityUpdaters = {
//     updatePool,
//     updateAsset,
//     insertSwap: insertSwapIfNotExists,
//     insertOrUpdateBuckets,
//     insertOrUpdateDailyVolume,
//     tryAddActivePool,
//   };

//   // Perform common updates via orchestrator
//   await SwapOrchestrator.performSwapUpdates(
//     {
//       swapData,
//       swapType: type,
//       metrics: marketMetrics,
//       poolData: {
//         parentPoolAddress: parentPool,
//         price,
//       },
//       chainId: BigInt(chain.id),
//       context,
//     },
//     entityUpdaters
//   );

//   // V2-specific updates
//   await updateV2Pool({
//     poolAddress: address,
//     context,
//     update: { price: (price * ethPrice) / CHAINLINK_ETH_DECIMALS },
//   });
// });
