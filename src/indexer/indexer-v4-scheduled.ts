import { ponder } from "ponder:registry";
import { getPoolId, getV4PoolData } from "@app/utils/v4-utils";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { insertScheduledPool } from "./shared/entities/multicurve/scheduledPool";
import {
  fetchEthPrice,
  fetchFxhPrice,
  fetchNoicePrice,
} from "./shared/oracle";
import { MarketDataService } from "@app/core/market";
import { insertPoolIfNotExistsV4, updatePool } from "./shared/entities/pool";
import { insertAssetIfNotExists } from "./shared/entities/asset";
import { insertV4ConfigIfNotExists } from "./shared/entities/v4Config";
import { getReservesV4 } from "@app/utils/v4-utils/getV4PoolData";
import { CHAINLINK_ETH_DECIMALS } from "@app/utils/constants";
import { SwapService, SwapOrchestrator, PriceService } from "@app/core";
import { TickMath } from "@uniswap/v3-sdk";
import { computeGraduationPercentage } from "@app/utils/v4-utils";
import { updateFifteenMinuteBucketUsd } from "@app/utils/time-buckets";
import { UniswapV4ScheduledMulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerABI";
import { chainConfigs } from "@app/config/chains";
import { insertMulticurvePoolV4Optimized } from "./shared/entities/multicurve/pool";
import { getAmount1Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { getAmount0Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { pool, token } from "ponder:schema";
import { handleOptimizedSwap } from "./shared/swap-optimizer";
import { StateViewABI } from "@app/abis";
import { zeroAddress } from "viem";

ponder.on(
  "UniswapV4ScheduledMulticurveInitializer:Create",
  async ({ event, context }) => {
    const { asset: assetId } = event.args;
    const { block } = event;
    const timestamp = block.timestamp;

    const poolState = await context.client.readContract({
      abi: UniswapV4ScheduledMulticurveInitializerABI,
      address:
        chainConfigs[context.chain.name].addresses.v4.v4ScheduledMulticurveInitializer,
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
      scheduled: true
    });
    if (!poolEntity) return;
    
    const assetEntity = await insertAssetIfNotExists({
      assetAddress: assetAddress,
      timestamp,
      context,
      marketCapUsd: poolEntity.marketCapUsd,
      poolAddress,
    });
    await insertScheduledPool({
      poolId,
      context
    })
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
  "UniswapV4ScheduledMulticurveInitializerHook:ModifyLiquidity",
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
      scheduled: true
    });

    if (!poolEntity) return;

    const baseTokenEntity = await context.db.find(token, {
      address: poolEntity.baseToken,
      chainId: context.chain.id,
    });

    const quoteToken = poolEntity.quoteToken;
    const isQuoteFxh =
      quoteToken != zeroAddress &&
      quoteToken ===
        chainConfigs[context.chain.name].addresses.shared.fxHash.fxhAddress.toLowerCase();
    const isQuoteNoice =
      quoteToken != zeroAddress &&
      quoteToken ===
        chainConfigs[context.chain.name].addresses.shared.noice.noiceAddress.toLowerCase();

    var ethPrice, fxhWethPrice, noiceWethPrice;
    if (isQuoteFxh) {
      [ethPrice, fxhWethPrice] = await Promise.all([
        fetchEthPrice(timestamp, context),
        fetchFxhPrice(timestamp, context),
      ]);
    } else if (isQuoteNoice) {
      [ethPrice, noiceWethPrice] = await Promise.all([
        fetchEthPrice(timestamp, context),
        fetchNoicePrice(timestamp, context),
      ]);
    } else {
      ethPrice = await fetchEthPrice(timestamp, context);
    }

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

    let fxhUsdPrice, noiceUsdPrice;
    var price;
    if (isQuoteFxh) {
      fxhUsdPrice = fxhWethPrice! * ethPrice / 10n ** 8n;
      price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96: sqrtPrice,
        isToken0: poolEntity.isToken0,
        decimals: 18,
      });
    } else if (isQuoteNoice) {
      noiceUsdPrice = noiceWethPrice! * ethPrice / 10n ** 8n;
      price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96: sqrtPrice,
        isToken0: poolEntity.isToken0,
        decimals: 18,
      });
    } else {
      price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96: sqrtPrice,
        isToken0: poolEntity.isToken0,
        decimals: 18,
      });
    }
    const marketCapUsd = MarketDataService.calculateMarketCap({
      price,
      ethPriceUSD: isQuoteFxh ? fxhUsdPrice! : isQuoteNoice ? noiceUsdPrice! : ethPrice,
      totalSupply: baseTokenEntity!.totalSupply,
      decimals: poolEntity.isQuoteEth ? 8 : 18,
    });

    const dollarLiquidity = MarketDataService.calculateLiquidity({
      assetBalance: poolEntity.isToken0 ? token0Reserve : token1Reserve,
      quoteBalance: poolEntity.isToken0 ? token1Reserve : token0Reserve,
      price,
      ethPriceUSD: isQuoteFxh ? fxhUsdPrice! : isQuoteNoice ? noiceUsdPrice! : ethPrice,
      decimals: poolEntity.isQuoteEth ? 8 : 18,
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
  "UniswapV4ScheduledMulticurveInitializerHook:Swap",
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

    const isQuoteFxh =
      poolEntity!.quoteToken != zeroAddress &&
      poolEntity!.quoteToken ===
        chainConfigs[context.chain.name].addresses.shared.fxHash.fxhAddress.toLowerCase();
    const isQuoteNoice =
      poolEntity!.quoteToken != zeroAddress &&
      poolEntity!.quoteToken ===
        chainConfigs[context.chain.name].addresses.shared.noice.noiceAddress.toLowerCase();

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
      },
      false,
      isQuoteFxh,
      isQuoteNoice,
    );
  },
);
