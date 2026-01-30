import { ponder } from "ponder:registry";
import { getPoolId, getV4PoolData } from "@app/utils/v4-utils";
import { isPrecompileAddress } from "@app/utils/validation";
import { insertTokenIfNotExists } from "./shared/entities/token";
import { insertScheduledPool } from "./shared/entities/multicurve/scheduledPool";
import {
  fetchEthPrice,
  fetchFxhPrice,
  fetchNoicePrice,
  fetchMonadPrice,
  fetchUsdcPrice,
  fetchUsdtPrice
} from "./shared/oracle";
import { insertPoolIfNotExistsV4, updatePool } from "./shared/entities/pool";
import { insertAssetIfNotExists } from "./shared/entities/asset";
import { insertV4ConfigIfNotExists } from "./shared/entities/v4Config";
import { getReservesV4 } from "@app/utils/v4-utils/getV4PoolData";
import { CHAINLINK_ETH_DECIMALS } from "@app/utils/constants";
import { SwapService, SwapOrchestrator, PriceService, MarketDataService } from "@app/core";
import { TickMath } from "@uniswap/v3-sdk";
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
import { getQuoteInfo } from "@app/utils/getQuoteInfo";

ponder.on(
  "UniswapV4ScheduledMulticurveInitializer:Create",
  async ({ event, context }) => {
    const { asset: assetId } = event.args;
    const { block } = event;
    const timestamp = block.timestamp;

    // Skip events where asset is a precompile address
    if (isPrecompileAddress(assetId)) {
      return;
    }

    let poolState;
    const v4ScheduledMulticurveInitializer = chainConfigs[context.chain.name].addresses.v4.v4ScheduledMulticurveInitializer;
    if (Array.isArray(v4ScheduledMulticurveInitializer)) {
      const poolStates = await Promise.all(v4ScheduledMulticurveInitializer.map(async (initializer) => {
        try {
          return await context.client.readContract({
            abi: UniswapV4ScheduledMulticurveInitializerABI,
            address: initializer,
            functionName: "getState",
            args: [assetId],
          });
        } catch {
          return null;
        }
      }));
      poolState = poolStates.find((state) => state && state[2].hooks !== zeroAddress);
      if (!poolState) {
        console.error("Missing v4MulticurveInitializer for asset", assetId);
        return;
      }
    } else {
      try {
        poolState = await context.client.readContract({
          abi: UniswapV4ScheduledMulticurveInitializerABI,
          address: v4ScheduledMulticurveInitializer,
          functionName: "getState",
          args: [assetId],
        });
      } catch {
        console.error("Could not retrieve pool state for asset", assetId);
        return;
      }
    }

    const poolKey = poolState[2];

    // Skip events where either currency in the pool is a precompile address
    if (isPrecompileAddress(poolKey.currency0) || isPrecompileAddress(poolKey.currency1)) {
      return;
    }

    const poolId = getPoolId(poolKey);

    const poolAddress = poolId.toLowerCase() as `0x${string}`;
    const assetAddress = assetId.toLowerCase() as `0x${string}`;
    const creatorAddress =
      event.transaction.from.toLowerCase() as `0x${string}`;

    const poolEntity = await insertMulticurvePoolV4Optimized({
      poolAddress,
      timestamp,
      blockNumber: block.number,
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

    // Skip events where either currency in the pool is a precompile address
    if (isPrecompileAddress(key.currency0) || isPrecompileAddress(key.currency1)) {
      return;
    }

    const creatorAddress =
      event.transaction.from.toLowerCase() as `0x${string}`;
    const poolId = getPoolId(key);
    const poolAddress = poolId.toLowerCase() as `0x${string}`;

    const poolEntity = await insertMulticurvePoolV4Optimized({
      creatorAddress,
      poolAddress,
      timestamp,
      blockNumber: block.number,
      poolKey: key,
      context,
      scheduled: true
    });

    if (!poolEntity) return;

    const baseTokenEntity = await context.db.find(token, {
      address: poolEntity.baseToken,
      chainId: context.chain.id,
    });

    const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);

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

    let newGraduationTick = poolEntity.graduationTick;
    if (poolEntity.isToken0) {
      if (poolEntity.graduationTick == 0 || poolEntity.graduationTick < tickUpper) {
        newGraduationTick = tickUpper;
      }
    } else {
      if (poolEntity.graduationTick == 0 || poolEntity.graduationTick > tickUpper) {
        newGraduationTick = tickUpper;
      }
    }

    await updatePool({
      poolAddress: poolAddress,
      context,
      update: {
        liquidity,
        reserves0: token0Reserve,
        reserves1: token1Reserve,
        dollarLiquidity,
        marketCapUsd,
        graduationTick: newGraduationTick
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

    if (isPrecompileAddress(poolEntity.baseToken) || isPrecompileAddress(poolEntity.quoteToken)) {
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
