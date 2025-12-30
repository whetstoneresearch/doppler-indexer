import { Context } from "ponder:registry";
import { v4pools } from "ponder:schema";
import { Address } from "viem";
import { MarketDataService } from "@app/core";
import { getV4MigrationPoolData } from "@app/utils/v4-utils/getV4MigrationPoolData";
import { QuoteToken } from "@app/utils/getQuoteInfo";

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

export const insertV4MigrationPoolIfNotExists = async ({
  migratorAddress,
  assetAddress,
  numeraireAddress,
  parentPoolAddress,
  timestamp,
  context,
}: {
  migratorAddress: Address;
  assetAddress: Address;
  numeraireAddress: Address;
  parentPoolAddress: Address;
  timestamp: bigint;
  context: Context;
}): Promise<typeof v4pools.$inferSelect> => {
  const { db, chain, client } = context;

  const migrationData = await getV4MigrationPoolData({
    migratorAddress,
    assetAddress,
    numeraireAddress,
    timestamp,
    context,
  });

  const existingPool = await db.find(v4pools, {
    poolId: migrationData.poolId,
    chainId: chain.id,
  });

  if (existingPool) {
    return existingPool;
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

  return await db.insert(v4pools).values({
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
};