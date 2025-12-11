import { v2Pool } from "ponder:schema";
import { Address, zeroAddress } from "viem";
import { Context } from "ponder:registry";
import { getPairData } from "@app/utils/v2-utils/getPairData";
import { insertAssetIfNotExists } from "./asset";
import { PriceService } from "@app/core";
import { fetchEthPrice } from "../oracle";
import { CHAINLINK_ETH_DECIMALS } from "@app/utils/constants";
import { insertPoolIfNotExists } from "./pool";
import { chainConfigs } from "@app/config";
import { getQuoteInfo } from "@app/utils/getQuoteInfo";

export const insertV2PoolIfNotExists = async ({
  assetAddress,
  timestamp,
  context,
}: {
  assetAddress: Address;
  timestamp: bigint;
  context: Context;
}): Promise<typeof v2Pool.$inferSelect> => {
  const { db, chain } = context;  

  const { poolAddress, migrationPool, numeraire } =
    await insertAssetIfNotExists({
      assetAddress,
      timestamp,
      context,
    });

  const migrationPoolAddr = migrationPool.toLowerCase() as `0x${string}`;

  const existingV2Pool = await db.find(v2Pool, {
    address: migrationPoolAddr,
    chainId: chain.id,
  });

  if (existingV2Pool) {
    return existingV2Pool;
  }

  const [{ baseToken }, quoteInfo] = await insertPoolIfNotExists({
    poolAddress,
    timestamp,
    context    
  });

  const isToken0 = baseToken === assetAddress;

  const assetId = assetAddress.toLowerCase() as `0x${string}`;
  const numeraireId = numeraire.toLowerCase() as `0x${string}`;

  const poolAddr = poolAddress.toLowerCase() as `0x${string}`;

  const { reserve0, reserve1 } = await getPairData({
    address: migrationPoolAddr,
    context,
  });

  const price = PriceService.computePriceFromReserves({
    assetBalance: reserve0,
    quoteBalance: reserve1,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const dollarPrice = (price * quoteInfo.quotePrice!) / (BigInt(10) ** BigInt(quoteInfo.quoteDecimals));

  return await db.insert(v2Pool).values({
    address: migrationPoolAddr,
    chainId: chain.id,
    baseToken: assetId,
    quoteToken: numeraireId,
    reserveBaseToken: isToken0 ? reserve0 : reserve1,
    reserveQuoteToken: isToken0 ? reserve1 : reserve0,
    price: dollarPrice,
    v3Pool: poolAddr,
    parentPool: poolAddr,
    totalFeeBaseToken: 0n,
    totalFeeQuoteToken: 0n,
    migratedAt: timestamp,
    migrated: true,
    isToken0,
  });
};

export const updateV2Pool = async ({
  poolAddress,
  context,
  update,
}: {
  poolAddress: Address;
  context: Context;
  update: Partial<typeof v2Pool.$inferInsert>;
}): Promise<typeof v2Pool.$inferSelect> => {
  const { db, chain } = context;

  const address = poolAddress.toLowerCase() as `0x${string}`;

  return await db
    .update(v2Pool, {
      address,
      chainId: chain.id,
    })
    .set(update);
};

export const insertV2MigrationPoolIfNotExists = async ({
  migrationPoolAddress,
  parentPoolAddress,
  isToken0ParentPool,
  numeraire,
  assetAddress,
  timestamp,
  context,
}: {
  migrationPoolAddress: Address;
  parentPoolAddress: Address;
  isToken0ParentPool: boolean;
  numeraire: Address;
  assetAddress: Address;
  timestamp: bigint;
  context: Context;
}): Promise<typeof v2Pool.$inferSelect> => {
  const { db, chain } = context;  

  const existingV2Pool = await db.find(v2Pool, {
    address: migrationPoolAddress,
    chainId: chain.id,
  });

  if (existingV2Pool) {
    return existingV2Pool;
  }

  const assetId = assetAddress.toLowerCase() as `0x${string}`;
  const numeraireId = numeraire.toLowerCase() as `0x${string}`;

  const quoteInfo = await getQuoteInfo(numeraireId, timestamp, context);

  const migrationPoolIsToken0 = numeraireId === zeroAddress ? assetId < numeraireId : isToken0ParentPool;

  const { reserve0, reserve1 } = await getPairData({
    address: migrationPoolAddress,
    context,
  });

  const price = PriceService.computePriceFromReserves({
    assetBalance: migrationPoolIsToken0 ? reserve0 : reserve1,
    quoteBalance: migrationPoolIsToken0 ? reserve1 : reserve0,
    assetDecimals: 18,
    quoteDecimals: quoteInfo.quoteDecimals
  });

  const dollarPrice = (price * quoteInfo.quotePrice!) / (BigInt(10) ** BigInt(quoteInfo.quoteDecimals));

  return await db.insert(v2Pool).values({
    address: migrationPoolAddress,
    chainId: chain.id,
    baseToken: assetId,
    quoteToken: numeraireId,
    reserveBaseToken: migrationPoolIsToken0 ? reserve0 : reserve1,
    reserveQuoteToken: migrationPoolIsToken0 ? reserve1 : reserve0,
    price: dollarPrice,
    v3Pool: parentPoolAddress,
    parentPool: parentPoolAddress,
    totalFeeBaseToken: 0n,
    totalFeeQuoteToken: 0n,
    migratedAt: timestamp,
    migrated: true,
    isToken0: migrationPoolIsToken0,
  });
};
