import { DERC20ABI } from "@app/abis";
import { V4PoolData, DHookPoolData } from "@app/types";
import { MarketDataService, PriceService } from "@app/core";
import { getAssetData } from "@app/utils/getAssetData";
import { getV3PoolData, getSlot0Data, getV3PoolReserves } from "@app/utils/v3-utils";
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
import { isPrecompileAddress } from "@app/utils/validation";

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

export interface V2PoolData {
  baseToken: Address;
  quoteToken: Address;
  isToken0: boolean;
  reserve0: bigint;
  reserve1: bigint;
}

export const insertPoolIfNotExists = async ({
  poolAddress,
  timestamp,
  context,
  isV2 = false,
  v2PoolData,
  asset,
  numeraire,
}: {
  poolAddress: Address;
  timestamp: bigint;
  context: Context;
  isV2?: boolean;
  v2PoolData?: V2PoolData;
  asset?: Address;
  numeraire?: Address;
}): Promise<[typeof pool.$inferSelect, QuoteInfo] | null> => {
  const { db, chain, client } = context;
  const address = poolAddress.toLowerCase() as `0x${string}`;

  const existingPool = await db.find(pool, {
    address,
    chainId: chain.id,
  });

  if (existingPool) {
    const quoteInfo = await getQuoteInfo(existingPool.quoteToken, timestamp, context);
    return [existingPool, quoteInfo];
  }

  if (isV2) {
    if (!v2PoolData) {
      return null;
    }

    const { baseToken, quoteToken, isToken0, reserve0, reserve1 } = v2PoolData;
    const assetAddr = baseToken.toLowerCase() as `0x${string}`;
    const numeraireAddr = quoteToken.toLowerCase() as `0x${string}`;

    const quoteInfo = await getQuoteInfo(numeraireAddr, timestamp, context);

    const assetBalance = isToken0 ? reserve0 : reserve1;
    const quoteBalance = isToken0 ? reserve1 : reserve0;

    if (assetBalance === 0n) {
      return null;
    }

    const price = PriceService.computePriceFromReserves({
      assetBalance,
      quoteBalance,
      assetDecimals: 18,
      quoteDecimals: quoteInfo.quoteDecimals,
    });

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
      decimals: quoteInfo.quotePriceDecimals,
    });

    const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;
    return [
      await db.insert(pool).values({
        address,
        liquidity: 0n,
        createdAt: timestamp,
        asset: assetAddr,
        baseToken: assetAddr,
        quoteToken: numeraireAddr,
        price,
        type: "v2",
        chainId: chain.id,
        fee: 3000, // V2 default fee
        dollarLiquidity: 0n,
        dailyVolume: address,
        maxThreshold: 0n,
        graduationBalance: 0n,
        totalFee0: 0n,
        totalFee1: 0n,
        volumeUsd: 0n,
        reserves0: reserve0,
        reserves1: reserve1,
        percentDayChange: 0,
        isToken0,
        marketCapUsd,
        sqrtPrice: 0n,
        tick: 0,
        isQuoteEth,
        integrator: assetData.integrator,
        migrationType: "v2",
      }),
      quoteInfo,
    ];
  }

  // When asset and numeraire are provided directly (e.g., for migration pools),
  // bypass getPoolState which may not have the pool registered
  if (asset && numeraire) {
    const { slot0Data, liquidity, token0, token1, fee } = await getSlot0Data({
      address,
      context,
    });

    // Skip events where asset or numeraire is a precompile address
    if (isPrecompileAddress(token0) || isPrecompileAddress(token1)) {
      return null;
    }

    const { reserve0, reserve1 } = await getV3PoolReserves({
      token0,
      token1,
      address,
      context,
    });

    const assetAddr = asset.toLowerCase() as `0x${string}`;
    const numeraireAddr = numeraire.toLowerCase() as `0x${string}`;
    const isToken0 = token0.toLowerCase() === assetAddr;

    const quoteInfo = await getQuoteInfo(numeraireAddr, timestamp, context);

    const price = PriceService.computePriceFromSqrtPriceX96({
      sqrtPriceX96: slot0Data.sqrtPrice,
      isToken0,
      decimals: 18,
      quoteDecimals: quoteInfo.quoteDecimals
    });

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
      decimals: quoteInfo.quotePriceDecimals
    });

    let migrationType = getMigrationType(assetData, chain.name);

    const isQuoteEth = quoteInfo.quoteToken === QuoteToken.Eth;
    return [await db.insert(pool).values({
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
      reserves0: reserve0,
      reserves1: reserve1,
      percentDayChange: 0,
      isToken0,
      marketCapUsd,
      isQuoteEth,
      integrator: assetData.integrator,
      migrationType,
    }),
      quoteInfo
    ];
  }

  const poolData = await getV3PoolData({
    address,
    context,
  });

  if (!poolData) {
    return null;
  }

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

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply: assetTotalSupply,
    decimals: quoteInfo.quotePriceDecimals
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
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals
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

export const insertPoolIfNotExistsDHook = async ({
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
  poolData: DHookPoolData;
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

  const [totalSupply, assetData, quoteInfo] = await Promise.all([
    client.readContract({
      address: assetAddr,
      abi: DERC20ABI,
      functionName: "totalSupply",
    }),
    getAssetData(assetAddr, context),
    getQuoteInfo(numeraireAddr, timestamp, context)
  ]);

  const dollarLiquidity = MarketDataService.calculateLiquidity({
    assetBalance: 0n,
    quoteBalance: 0n,
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    decimals: quoteInfo.quotePriceDecimals,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const marketCapUsd = MarketDataService.calculateMarketCap({
    price,
    quotePriceUSD: quoteInfo.quotePrice!,
    totalSupply,
    decimals: quoteInfo.quotePriceDecimals
  });

  const poolType =
    poolData.poolConfig.dopplerHook === chainConfigs[context.chain.name].addresses.v4.DopplerHookInitializer
      ? 'rehype'
      : 'dhook';
  
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
    type: poolType,
    dollarLiquidity: dollarLiquidity ?? 0n,
    dailyVolume: address,
    volumeUsd: 0n,
    percentDayChange: 0,
    totalFee0: 0n,
    totalFee1: 0n,
    maxThreshold: 0n,
    minThreshold: 0n,
    graduationBalance: 0n,
    graduationPercentage: 0,
    graduationTick: poolConfig.farTick,
    isToken0: poolConfig.isToken0,
    marketCapUsd,
    reserves0: 0n,
    reserves1: 0n,
    poolKey: JSON.stringify(poolKey),
    isQuoteEth,
    integrator: assetData.integrator,
    migrationType: migrationType,
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

  if (!poolData) {
    return null;
  }

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
      decimals: quoteInfo.quotePriceDecimals
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
  } else {
    const v4Migrator = chainConfigs[chainName].addresses.v4.v4Migrator;
    const v4Migrators = Array.isArray(v4Migrator) ? v4Migrator : [v4Migrator];
    if (v4Migrators.some(m => m.toLowerCase() === assetData.liquidityMigrator.toLowerCase())) {
      return "v4";
    }
    return "unknown";
  }
}
