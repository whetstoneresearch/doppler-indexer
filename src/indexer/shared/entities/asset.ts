import { Context } from "ponder:registry";
import { asset } from "ponder:schema";
import { Address } from "viem";
import { getAssetData } from "@app/utils/getAssetData";

export const insertAssetIfNotExists = async ({
  assetAddress,
  timestamp,
  context,
  marketCapUsd,
  poolAddress,
}: {
  assetAddress: Address;
  timestamp: bigint;
  context: Context;
  marketCapUsd?: bigint;
  poolAddress?: Address;
}) => {
  const { db, chain } = context;
  const address = assetAddress.toLowerCase() as `0x${string}`;

  const existingAsset = await db.find(asset, {
    address,
    chainId: chain.id,
  });

  if (existingAsset) {
    return existingAsset;
  }

  const assetData = await getAssetData(assetAddress, context);

  const isToken0 =
    assetAddress.toLowerCase() < assetData.numeraire.toLowerCase();

  return await db.insert(asset).values({
    ...assetData,
    poolAddress: poolAddress ?? assetData.pool.toLowerCase() as `0x${string}`,
    address,
    chainId: chain.id,
    isToken0,
    createdAt: timestamp,
    migratedAt: null,
    migrated: false,
    holderCount: 0,
    percentDayChange: 0,
    marketCapUsd: marketCapUsd ?? 0n,
    dayVolumeUsd: 0n,
    liquidityUsd: 0n,
  });
};

export const updateAsset = async ({
  assetAddress,
  context,
  update,
}: {
  assetAddress: Address;
  context: Context;
  update?: Partial<typeof asset.$inferInsert>;
}) => {
  const { db, chain } = context;
  const address = assetAddress.toLowerCase() as `0x${string}`;

  await db
    .update(asset, {
      address,
      chainId: chain.id,
    })
    .set({
      ...update,
    });
};
