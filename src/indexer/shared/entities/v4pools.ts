import { Context } from "ponder:registry";
import { v4pools } from "ponder:schema";
import { Address } from "viem";
import { MarketDataService } from "@app/core";
import { getV4MigrationPoolData } from "@app/utils/v4-utils/getV4MigrationPoolData";
import { QuoteToken, getQuoteInfo } from "@app/utils/getQuoteInfo";
import { computeV4Price } from "@app/utils/v4-utils/computeV4Price";
import { getAmount0Delta, getAmount1Delta } from "@app/utils/v3-utils/computeGraduationThreshold";
import { addToV4MigrationPoolCache } from "../v4MigrationPoolCache";

export const fetchExistingV4Pool = async ({
  poolId,
  context,
}: {
  poolId: `0x${string}`;
  context: Context;
}) => {
  const { db, chain } = context;
  if (!chain) {
    throw new Error("Chain not available in context");
  }
  
  const existingPool = await db.find(v4pools, {
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  });
  
  if (!existingPool) {
    throw new Error(`V4 pool ${poolId} not found`);
  }
  
  return existingPool;
};

export const fetchV4MigrationPool = async ({
  poolId,
  context,
}: {
  poolId: `0x${string}`;
  context: Context;
}): Promise<typeof v4pools.$inferSelect | null> => {
  const { db, chain } = context;
  if (!chain) {
    return null;
  }
  
  const existingPool = await db.find(v4pools, {
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  });
  
  return existingPool ?? null;
};

export const updateV4Pool = async ({
  poolId,
  context,
  update,
}: {
  poolId: `0x${string}`;
  context: Context;
  update: Partial<typeof v4pools.$inferInsert>;
}) => {
  const { db, chain } = context;
  if (!chain) {
    throw new Error("Chain not available in context");
  }
  
  await db.update(v4pools, {
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  }).set(update);
};

export const insertV4PoolFromInitialize = async ({
  poolId,
  currency0,
  currency1,
  fee,
  tickSpacing,
  hooks,
  sqrtPriceX96,
  tick,
  timestamp,
  context,
}: {
  poolId: `0x${string}`;
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  sqrtPriceX96: bigint;
  tick: number;
  timestamp: bigint;
  context: Context;
}): Promise<typeof v4pools.$inferSelect | null> => {
  const { db, chain } = context;

  const existingPool = await db.find(v4pools, {
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  });

  if (existingPool) {
    return existingPool;
  }

  // Default to currency0 as base, will be corrected in Migrate if needed
  const baseToken = currency0.toLowerCase() as `0x${string}`;
  const quoteToken = currency1.toLowerCase() as `0x${string}`;
  const isToken0 = true;

  const quoteInfo = await getQuoteInfo(quoteToken, timestamp, context);
  const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;

  const price = computeV4Price({
    isToken0,
    currentTick: tick,
    baseTokenDecimals: 18,
    quoteTokenDecimals: quoteInfo.quoteDecimals,
  });

  return await db.insert(v4pools).values({
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
    currency0: currency0.toLowerCase() as `0x${string}`,
    currency1: currency1.toLowerCase() as `0x${string}`,
    fee,
    tickSpacing,
    hooks: hooks.toLowerCase() as `0x${string}`,
    sqrtPriceX96,
    liquidity: 0n, // Will be set by ModifyLiquidity
    tick,
    baseToken,
    quoteToken,
    asset: null, // Will be set by Migrate
    migratedFromPool: null, // Will be set by Migrate
    migratedAt: timestamp,
    migratorVersion: "v4",
    lockDuration: null,
    beneficiaries: null,
    price,
    volumeUsd: 0n,
    dollarLiquidity: 0n,
    totalFee0: 0n,
    totalFee1: 0n,
    reserves0: 0n, // Will be set by ModifyLiquidity
    reserves1: 0n, // Will be set by ModifyLiquidity
    createdAt: timestamp,
    lastRefreshed: timestamp,
    percentDayChange: 0,
    isToken0,
    isQuoteEth,
  });
};

export const updateV4PoolReservesFromModifyLiquidity = async ({
  poolId,
  tickLower,
  tickUpper,
  liquidityDelta,
  context,
}: {
  poolId: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
  context: Context;
}): Promise<typeof v4pools.$inferSelect | null> => {
  const { db, chain } = context;

  const v4Pool = await db.find(v4pools, {
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  });

  if (!v4Pool) {
    return null;
  }

  const tick = v4Pool.tick;
  let reserves0Delta = 0n;
  let reserves1Delta = 0n;

  if (tick < tickLower) {
    reserves0Delta = getAmount0Delta({
      tickLower,
      tickUpper,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  } else if (tick < tickUpper) {
    reserves0Delta = getAmount0Delta({
      tickLower: tick,
      tickUpper,
      liquidity: liquidityDelta,
      roundUp: false,
    });
    reserves1Delta = getAmount1Delta({
      tickLower,
      tickUpper: tick,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  } else {
    reserves1Delta = getAmount1Delta({
      tickLower,
      tickUpper,
      liquidity: liquidityDelta,
      roundUp: false,
    });
  }

  const newLiquidity = liquidityDelta > 0n
    ? v4Pool.liquidity + liquidityDelta
    : v4Pool.liquidity - (-liquidityDelta);
  const newReserves0 = v4Pool.reserves0 + reserves0Delta;
  const newReserves1 = v4Pool.reserves1 + reserves1Delta;

  await db.update(v4pools, {
    poolId: poolId.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  }).set({
    liquidity: newLiquidity,
    reserves0: newReserves0,
    reserves1: newReserves1,
  });

  return {
    ...v4Pool,
    liquidity: newLiquidity,
    reserves0: newReserves0,
    reserves1: newReserves1,
  };
};

export const insertV4MigrationPoolIfNotExists = async ({
  migratorAddress,
  assetAddress,
  numeraireAddress,
  migrationPoolAddress,
  parentPoolAddress,
  timestamp,
  context,
}: {
  migratorAddress: Address;
  assetAddress: Address;
  numeraireAddress: Address;
  migrationPoolAddress: Address;
  parentPoolAddress: Address;
  timestamp: bigint;
  context: Context;
}): Promise<typeof v4pools.$inferSelect> => {
  const { db, chain, client } = context;

  const migrationData = await getV4MigrationPoolData({
    migratorAddress,
    assetAddress,
    numeraireAddress,
    migrationPoolAddress,
    timestamp,
    context,
  });

  const existingPool = await db.find(v4pools, {
    poolId: migrationData.poolId,
    chainId: chain.id,
  });

  if (existingPool) {
    const isQuoteEth = migrationData.quoteInfo.quoteToken === QuoteToken.Eth;
    
    const dollarLiquidity = MarketDataService.calculateLiquidity({
      assetBalance: migrationData.isToken0
        ? migrationData.reserves0
        : migrationData.reserves1,
      quoteBalance: migrationData.isToken0
        ? migrationData.reserves1
        : migrationData.reserves0,
      price: migrationData.price,
      quotePriceUSD: migrationData.quoteInfo.quotePrice ?? 0n,
      decimals: migrationData.quoteInfo.quotePriceDecimals,
      assetDecimals: 18,
      quoteDecimals: migrationData.quoteInfo.quoteDecimals,
    });

    await db.update(v4pools, {
      poolId: migrationData.poolId,
      chainId: chain.id,
    }).set({
      baseToken: migrationData.baseToken.toLowerCase() as `0x${string}`,
      quoteToken: migrationData.quoteToken.toLowerCase() as `0x${string}`,
      asset: assetAddress.toLowerCase() as `0x${string}`,
      migratedFromPool: parentPoolAddress.toLowerCase() as `0x${string}`,
      migratedAt: timestamp,
      lockDuration: migrationData.lockDuration,
      beneficiaries: migrationData.beneficiaries,
      price: migrationData.price,
      dollarLiquidity,
      isToken0: migrationData.isToken0,
      isQuoteEth,      
      reserves0: migrationData.reserves0,
      reserves1: migrationData.reserves1,
      liquidity: migrationData.liquidity,
      sqrtPriceX96: migrationData.slot0Data.sqrtPrice,
      tick: migrationData.slot0Data.tick,
    });

    // Add to in-memory cache for fast lookups in PoolManager:Swap handler
    addToV4MigrationPoolCache(chain.id, migrationData.poolId);

    return {
      ...existingPool,
      baseToken: migrationData.baseToken.toLowerCase() as `0x${string}`,
      quoteToken: migrationData.quoteToken.toLowerCase() as `0x${string}`,
      asset: assetAddress.toLowerCase() as `0x${string}`,
      migratedFromPool: parentPoolAddress.toLowerCase() as `0x${string}`,
      migratedAt: timestamp,
      lockDuration: migrationData.lockDuration,
      beneficiaries: migrationData.beneficiaries,
      price: migrationData.price,
      dollarLiquidity,
      isToken0: migrationData.isToken0,
      isQuoteEth,
      reserves0: migrationData.reserves0,
      reserves1: migrationData.reserves1,
      liquidity: migrationData.liquidity,
      sqrtPriceX96: migrationData.slot0Data.sqrtPrice,
      tick: migrationData.slot0Data.tick,
    };
  }

  const isQuoteEth = migrationData.quoteInfo.quoteToken === QuoteToken.Eth;

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: migrationData.isToken0
      ? migrationData.reserves0
      : migrationData.reserves1,
    quoteBalance: migrationData.isToken0
      ? migrationData.reserves1
      : migrationData.reserves0,
    price: migrationData.price,
    quotePriceUSD: migrationData.quoteInfo.quotePrice ?? 0n,
    decimals: migrationData.quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: migrationData.quoteInfo.quoteDecimals,
  });

  const insertedPool = await db.insert(v4pools).values({
    poolId: migrationData.poolId,
    chainId: chain.id,
    currency0: migrationData.poolKey.currency0.toLowerCase() as `0x${string}`,
    currency1: migrationData.poolKey.currency1.toLowerCase() as `0x${string}`,
    fee: migrationData.poolKey.fee,
    tickSpacing: migrationData.poolKey.tickSpacing,
    hooks: migrationData.poolKey.hooks.toLowerCase() as `0x${string}`,
    sqrtPriceX96: migrationData.slot0Data.sqrtPrice,
    liquidity: migrationData.liquidity,
    tick: migrationData.slot0Data.tick,
    baseToken: migrationData.baseToken.toLowerCase() as `0x${string}`,
    quoteToken: migrationData.quoteToken.toLowerCase() as `0x${string}`,
    asset: assetAddress.toLowerCase() as `0x${string}`,
    migratedFromPool: parentPoolAddress.toLowerCase() as `0x${string}`,
    migratedAt: timestamp,
    migratorVersion: "v4",
    lockDuration: migrationData.lockDuration,
    beneficiaries: migrationData.beneficiaries,
    price: migrationData.price,
    volumeUsd: 0n,
    dollarLiquidity,
    totalFee0: 0n,
    totalFee1: 0n,
    reserves0: migrationData.reserves0,
    reserves1: migrationData.reserves1,
    createdAt: timestamp,
    lastRefreshed: timestamp,
    percentDayChange: 0,
    isToken0: migrationData.isToken0,
    isQuoteEth,
  });

  // Add to in-memory cache for fast lookups in PoolManager:Swap handler
  addToV4MigrationPoolCache(chain.id, migrationData.poolId);

  return insertedPool;
};