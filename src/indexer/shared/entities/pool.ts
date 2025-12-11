import { DERC20ABI } from "@app/abis";
import { V4PoolData } from "@app/types";
import { MarketDataService } from "@app/core";
import { getAssetData } from "@app/utils/getAssetData";
import { getV3PoolData } from "@app/utils/v3-utils";
import { computeGraduationPercentage } from "@app/utils/v4-utils";
import { getReservesV4 } from "@app/utils/v4-utils/getV4PoolData";
import { Context } from "ponder:registry";
import { pool, token } from "ponder:schema";
import { Address, zeroAddress } from "viem";
import { fetchMonadPrice, fetchZoraPrice } from "../oracle";
import { getQuoteInfo, QuoteToken, QuoteInfo } from "@app/utils/getQuoteInfo";
import { getLockableV3PoolData } from "@app/utils/v3-utils/getV3PoolData";
import { chainConfigs } from "@app/config";
import { AssetData } from "@app/types";
import { Network } from "@app/types/config-types";
import { eq, and } from "ponder";

export const fetchExistingPool = async ({
  poolAddress,
  context,
}: {
  poolAddress: Address;
  context: Context;
}): Promise<typeof pool.$inferSelect | null> => {
  const { db, chain } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;
  const existingPool = await db.find(pool, {
    address,
    chainId: chain.id,
  });

  if (!existingPool) {
    return null;
  }
  return existingPool;
};

export const insertPoolIfNotExists = async ({
  poolAddress,
  timestamp,
  context
}: {
  poolAddress: Address;
  timestamp: bigint;
  context: Context;  
}): Promise<[typeof pool.$inferSelect, QuoteInfo]> => {
  const { db, chain, client } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;

  const existingPool = await db.find(pool, {
    address,
    chainId: chain.id,
  });

  const poolData = await getV3PoolData({
    address,
    context,
  });

  const { slot0Data, liquidity, price, fee, token0, poolState } = poolData;

  const isToken0 = token0.toLowerCase() === poolState.asset.toLowerCase();

  const assetAddr = poolState.asset.toLowerCase() as `0x${string}`;
  const numeraireAddr = poolState.numeraire.toLowerCase() as `0x${string}`;

  const quoteInfo = await getQuoteInfo(numeraireAddr, timestamp, context);

  if (existingPool) {
    return [existingPool, quoteInfo];
  }
  
  const [assetTotalSupply, assetData] = await Promise.all([
    client.readContract({
      address: assetAddr,
      abi: DERC20ABI,
      functionName: "totalSupply",
    }),
    getAssetData(assetAddr, context),
  ]);

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: assetTotalSupply,
    decimals: quoteInfo.quoteDecimals
  });

  let migrationType = getMigrationType(assetData, chain.name);

  const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;
  return [await db.insert(pool).values({
    ...poolData,
    ...slot0Data,
    address,
    liquidity: liquidity,
    createdAt: timestamp,
    asset: assetAddr,
    baseToken: assetAddr,
    quoteToken: numeraireAddr,
    price,
    type: "v3",
    chainId: chain.id,
    fee,
    dollarLiquidity: 0n,
    dailyVolume: address,
    maxThreshold: 0n,
    graduationBalance: 0n,
    totalFee0: 0n,
    totalFee1: 0n,
    volumeUsd: 0n,
    reserves0: 0n,
    reserves1: 0n,
    percentDayChange: 0,
    isToken0,
    marketCapUsd,
    isQuoteEth,
    integrator: assetData.integrator,
    migrationType,
  }),
    quoteInfo
  ];
};

export const updatePool = async ({
  poolAddress,
  context,
  update,
}: {
  poolAddress: Address;
  context: Context;
  update: Partial<typeof pool.$inferInsert>;
}) => {
  const { db, chain } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;
  
  const existingPool = await db.find(pool, {
    address,
    chainId: chain.id,
  });
  
  if (!existingPool) {
    return;
  }
  
  await db
    .update(pool, {
      address,
      chainId: chain.id,
    })
    .set({
      ...update,
    });
};

export const insertPoolIfNotExistsV4 = async ({
  poolAddress,
  timestamp,
  poolData,
  ethPrice,
  context,
}: {
  poolAddress: Address;
  timestamp: bigint;
  ethPrice: bigint;
  context: Context;
  poolData: V4PoolData;
}): Promise<typeof pool.$inferSelect> => {
  const { db, chain, client } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;
  const existingPool = await db.find(pool, {
    address,
    chainId: chain.id,
  });

  if (existingPool) {
    return existingPool;
  }

  const { poolKey, slot0Data, liquidity, price, poolConfig } = poolData;
  const { fee } = poolKey;

  const assetAddr = poolConfig.isToken0 ? poolKey.currency0 : poolKey.currency1;
  const numeraireAddr = poolConfig.isToken0
    ? poolKey.currency1
    : poolKey.currency0;

  const [reserves, totalSupply, assetData, quoteInfo] = await Promise.all([
    getReservesV4({
      hook: address,
      context,
    }),
    client.readContract({
      address: assetAddr,
      abi: DERC20ABI,
      functionName: "totalSupply",
    }),
    getAssetData(assetAddr, context),
    getQuoteInfo(numeraireAddr, timestamp, context)
  ]);

  const { token0Reserve, token1Reserve } = reserves;

  const assetBalance = poolConfig.isToken0 ? token0Reserve : token1Reserve;
  const quoteBalance = poolConfig.isToken0 ? token1Reserve : token0Reserve;

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance,
    quoteBalance,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quoteDecimals
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quoteDecimals
  });

  const graduationPercentage = computeGraduationPercentage({
    maxThreshold: poolConfig.maxProceeds,
    graduationBalance: 0n,
  });

  let migrationType = getMigrationType(assetData, chain.name);

  const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;
  return await db.insert(pool).values({
    address,
    chainId: chain.id,
    tick: slot0Data.tick,
    sqrtPrice: slot0Data.sqrtPrice,
    liquidity: liquidity,
    createdAt: timestamp,
    asset: assetAddr,
    baseToken: assetAddr,
    quoteToken: numeraireAddr,
    price,
    fee,
    type: "v4",
    dollarLiquidity: dollarLiquidity ?? 0n,
    dailyVolume: address,
    volumeUsd: 0n,
    percentDayChange: 0,
    totalFee0: 0n,
    totalFee1: 0n,
    maxThreshold: poolConfig.maxProceeds,
    minThreshold: poolConfig.minProceeds,
    graduationBalance: 0n,
    graduationPercentage,
    isToken0: poolConfig.isToken0,
    marketCapUsd,
    reserves0: token0Reserve,
    reserves1: token1Reserve,
    poolKey: JSON.stringify(poolKey),
    isQuoteEth,
    integrator: assetData.integrator,
    migrationType,
  });
};

export const insertLockableV3PoolIfNotExists = async ({
  poolAddress,
  timestamp,
  context,  
}: {
  poolAddress: Address;
  timestamp: bigint;
  context: Context;  
}): Promise<[typeof pool.$inferSelect, QuoteInfo] | null> => {
  const { db, chain, client } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;

  const existingPool = await db.find(pool, {
    address,
    chainId: chain.id,
  });

  const poolData = await getLockableV3PoolData({
    address,
    context,
  });

  const { slot0Data, liquidity, price, fee, token0, poolState } = poolData;

  const isToken0 = token0.toLowerCase() === poolState.asset.toLowerCase();

  const assetAddr = poolState.asset.toLowerCase() as `0x${string}`;
  const numeraireAddr = poolState.numeraire.toLowerCase() as `0x${string}`;
  
  const quoteInfo = await getQuoteInfo(numeraireAddr, timestamp, context);

  const [assetTotalSupply, assetData] = await Promise.all([
    client.readContract({
      address: assetAddr,
      abi: DERC20ABI,
      functionName: "totalSupply",
    }),
    getAssetData(assetAddr, context),
  ]);

  const marketCapUsd = MarketDataService.calculateMarketCap(
    {
      price,
      quotePriceUSD: quoteInfo.quotePrice!,
      totalSupply: assetTotalSupply,
      decimals: quoteInfo.quoteDecimals
    }
  )
  
  if (existingPool) {
    return [
      existingPool,
      quoteInfo,
    ];
  }

  const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;
  return [await db.insert(pool).values({
    ...poolData,
    ...slot0Data,
    address,
    liquidity: liquidity,
    createdAt: timestamp,
    asset: assetAddr,
    baseToken: assetAddr,
    quoteToken: numeraireAddr,
    price,
    type: "v3",
    chainId: chain.id,
    fee,
    dollarLiquidity: 0n,
    dailyVolume: address,
    maxThreshold: 0n,
    graduationBalance: 0n,
    totalFee0: 0n,
    totalFee1: 0n,
    volumeUsd: 0n,
    reserves0: 0n,
    reserves1: 0n,
    percentDayChange: 0,
    isToken0,
    marketCapUsd,
    isStreaming: true,
    isQuoteEth,
    integrator: assetData.integrator,
  }), 
    quoteInfo
  ];
};

function getMigrationType(assetData: AssetData, chainName: Network): string {
  if (
    assetData.liquidityMigrator.toLowerCase() === chainConfigs[chainName].addresses.v2.v2Migrator.toLowerCase()
    || assetData.liquidityMigrator.toLowerCase() === chainConfigs[chainName].addresses.v2.nimCustomV2Migrator.toLowerCase()
  ) {
    return "v2";
  } else if (
    assetData.liquidityMigrator.toLowerCase() === chainConfigs[chainName].addresses.v3.v3Migrator.toLowerCase()
    || assetData.liquidityMigrator.toLowerCase() === chainConfigs[chainName].addresses.v3.nimCustomV3Migrator.toLowerCase()
  ) {
    return "v3";
  } else if (assetData.liquidityMigrator.toLowerCase() === chainConfigs[chainName].addresses.v4.v4Migrator.toLowerCase()) {
    return "v4";
  } else {
    return "unknown";
  }
}
