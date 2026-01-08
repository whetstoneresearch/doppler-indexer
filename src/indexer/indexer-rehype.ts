import { ponder } from "ponder:registry";
import { getPoolId } from "@app/utils/v4-utils";
import { insertAssetIfNotExists, updatePool } from "./shared/entities";
import { pool, token } from "ponder:schema";
import { handleOptimizedSwap } from "./shared/swap-optimizer";
import { StateViewABI } from "@app/abis";
import { chainConfigs } from "@app/config/chains";
import { getQuoteInfo } from "@app/utils/getQuoteInfo";
import { insertRehypePoolV4 } from "./shared/entities/rehype/pool";
import { getAmount0Delta, getAmount1Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { PriceService, MarketDataService } from "@app/core";

ponder.on("DopplerHookInitializer:Create", async ({ event, context }) => {
  const { asset: assetId, numeraire } = event.args;
  const timestamp = event.block.timestamp;

  const creatorAddress = event.transaction.from.toLowerCase() as `0x${string}`;
  const assetAddress = assetId.toLowerCase() as `0x${string}`;

  const dopplerHookInitializerAddress = chainConfigs[context.chain.name].addresses.v4.dopplerHookInitializer;
  if (!dopplerHookInitializerAddress) return;

  const { DopplerHookInitializerABI } = await import("@app/abis/v4-abis/DopplerHookInitializerABI");

  const poolState = await context.client.readContract({
    abi: DopplerHookInitializerABI,
    address: dopplerHookInitializerAddress,
    functionName: "getState",
    args: [assetId],
  });

  const poolKey = poolState[7];
  const poolId = getPoolId(poolKey);
  const poolAddress = poolId.toLowerCase() as `0x${string}`;

  const poolEntity = await insertRehypePoolV4({
    poolAddress,
    timestamp,
    poolKey,
    context,
    creatorAddress,
  });

  if (!poolEntity) return;

  await insertAssetIfNotExists({
    assetAddress,
    timestamp,
    context,
    marketCapUsd: poolEntity.marketCapUsd,
    poolAddress,
  });
});

ponder.on("DopplerHookInitializer:Swap", async ({ event, context }) => {
  const { sender, poolId, amount0, amount1 } = event.args;
  const timestamp = event.block.timestamp;
  const poolAddress = (poolId as string).toLowerCase() as `0x${string}`;

  const poolEntity = await context.db.find(pool, {
    address: poolAddress,
    chainId: context.chain.id,
  });

  if (!poolEntity) return;

  const slot0 = await context.client.readContract({
    abi: StateViewABI,
    address: chainConfigs[context.chain.name].addresses.v4.stateView,
    functionName: "getSlot0",
    args: [poolId],
  });

  const tick = slot0[1];
  const sqrtPriceX96 = slot0?.[0] ?? 0n;

  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

  const isCoinBuy = poolEntity.isToken0
    ? amount0 > amount1
    : amount1 > amount0;

  await handleOptimizedSwap(
    {
      poolAddress,
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
      tick,
    },
    quoteInfo
  );
});

ponder.on("DopplerHookInitializer:ModifyLiquidity", async ({ event, context }) => {
  const { key, params } = event.args;
  const { tickLower, tickUpper, liquidityDelta } = params;
  const timestamp = event.block.timestamp;

  const creatorAddress = event.transaction.from.toLowerCase() as `0x${string}`;
  const poolId = getPoolId(key);
  const poolAddress = poolId.toLowerCase() as `0x${string}`;

  const poolEntity = await insertRehypePoolV4({
    creatorAddress,
    poolAddress,
    timestamp,
    poolKey: key,
    context,
  });

  if (!poolEntity) return;

  const baseTokenEntity = await context.db.find(token, {
    address: poolEntity.baseToken,
    chainId: context.chain.id,
  });

  if (!baseTokenEntity) return;

  let token0Reserve = poolEntity.reserves0;
  let token1Reserve = poolEntity.reserves1;
  let liquidity = poolEntity.liquidity;
  const tick = poolEntity.tick;
  const sqrtPrice = poolEntity.sqrtPrice;

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
    quoteDecimals: quoteInfo.quoteDecimals,
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: baseTokenEntity.totalSupply,
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
    poolAddress,
    context,
    update: {
      liquidity,
      reserves0: token0Reserve,
      reserves1: token1Reserve,
      dollarLiquidity,
      marketCapUsd,
    },
  });
});
