import { ponder } from "ponder:registry";
import { pool } from "ponder:schema";
import { insertV3MigrationPoolIfNotExists } from "./shared/entities/migrationPool";
import { insertAssetIfNotExists, updateAsset } from "./shared/entities/asset";
import { insertTokenIfNotExists, updateToken } from "./shared/entities/token";
import { insertV2MigrationPoolIfNotExists } from "./shared/entities/v2Pool";
import { insertV4MigrationPoolIfNotExists } from "./shared/entities/v4pools";
import { updateUserAsset } from "./shared/entities/userAsset";
import { insertUserAssetIfNotExists } from "./shared/entities/userAsset";
import { insertUserIfNotExists, updateUser } from "./shared/entities/user";
import { fetchExistingPool, updatePool } from "./shared/entities/pool";
import { zeroAddress } from "viem";
import { getV4MigratorForAsset } from "@app/utils/v4-utils";
import { validatePoolCurrencies } from "./shared/validatePool";

ponder.on("Airlock:Migrate", async ({ event, context }) => {
  const { timestamp } = event.block;
  const assetId = event.args.asset.toLowerCase() as `0x${string}`;
  const migrationPoolAddress = event.args.pool.toLowerCase() as `0x${string}`;

  const assetEntity = await insertAssetIfNotExists({
    assetAddress: assetId,
    timestamp,
    context,
  });

  const parentPool = await fetchExistingPool({
    poolAddress: assetEntity.poolAddress,
    context,
  });

  if (!parentPool) {
    return;
  }

  const validation = await validatePoolCurrencies(
    context, migrationPoolAddress, parentPool.baseToken, parentPool.quoteToken, timestamp
  );
  if (!validation.valid) {
    console.log(`[Airlock:Migrate] Skipping invalid migration pool ${migrationPoolAddress}: ${validation.reason}`);
    return;
  }

  if (parentPool.migrationType === "v2") {
    await Promise.all([
      insertV2MigrationPoolIfNotExists({
      migrationPoolAddress: assetEntity.migrationPool.toLowerCase() as `0x${string}`,
      parentPoolAddress: parentPool.address,
      isToken0ParentPool: parentPool.isToken0,
      numeraire: parentPool.quoteToken,
      assetAddress: assetId,
      timestamp,
      context,
    }),
    updatePool({
      poolAddress: parentPool.address,
      context,
      update: {
        migratedAt: timestamp,
        migrated: true,
        migratedToPool: assetEntity.migrationPool.toLowerCase() as `0x${string}`,
      },
    }),
    updateAsset({
      assetAddress: assetId,
      context,
      update: {
        migratedAt: timestamp,
        migrated: true,
      },
    }),
  ]);
  } else if (parentPool.migrationType === "v3") {
    await Promise.all([
      insertV3MigrationPoolIfNotExists({
      assetAddress: assetId,
      migrationPoolAddress: migrationPoolAddress,
      parentPoolAddress: parentPool.address,
      timestamp,
      context,
    }),
    updatePool({
      poolAddress: parentPool.address,
      context,
      update: {
        migratedAt: timestamp,
        migrated: true,
        migratedToPool: migrationPoolAddress,
      },
    }),
    updateAsset({
      assetAddress: assetId,
      context,
      update: {
        migratedAt: timestamp,
        migrated: true,
      },
    }),
  ]);
  } else if (parentPool.migrationType === "v4") {    
    const migratorAddress = getV4MigratorForAsset(
      assetEntity.liquidityMigrator,
      context.chain.name
    );

    if (!migratorAddress) {
      console.warn(`Unsupported V4 migrator for asset ${assetId} on chain ${context.chain.name}`);
      return;
    }

    const v4PoolEntity = await insertV4MigrationPoolIfNotExists({
      migratorAddress,
      assetAddress: assetId,
      numeraireAddress: assetEntity.numeraire,
      parentPoolAddress: parentPool.address,
      timestamp,
      context,
    });

    await Promise.all([
      updatePool({
        poolAddress: parentPool.address,
        context,
        update: {
          migratedAt: timestamp,
          migrated: true,
          migratedToV4PoolId: v4PoolEntity.poolId,
        },
      }),
      updateAsset({
        assetAddress: assetId,
        context,
        update: {
          migratedAt: timestamp,
          migrated: true,
        },
      }),
    ]);
  }
});

ponder.on("DERC20:Transfer", async ({ event, context }) => {
  const { address } = event.log;
  const { timestamp } = event.block;
  const { from, to, value } = event.args;

  const { db, chain } = context;

  const creatorAddress = event.transaction.from;

  const fromId = from.toLowerCase() as `0x${string}`;
  const toId = to.toLowerCase() as `0x${string}`;
  const assetId = address.toLowerCase() as `0x${string}`;

  const [tokenData, fromUser, toUserAsset, fromUserAsset] =
    await Promise.all([
      insertTokenIfNotExists({
        tokenAddress: assetId,
        creatorAddress,
        timestamp,
        context,
        isDerc20: true,
      }),
      insertUserIfNotExists({
        userId: fromId,
        timestamp,
        context,
      }),
      insertUserAssetIfNotExists({
        userId: toId,
        assetId: assetId,
        timestamp,
        context,
      }),
      insertUserAssetIfNotExists({
        userId: fromId,
        assetId: assetId,
        timestamp,
        context,
      }),
      insertUserIfNotExists({
        userId: toId,
        timestamp,
        context,
      }),
    ]);

  if (fromUser.lastSeenAt != timestamp) {
    await updateUser({
      userId: fromId,
      context,
      update: {
        lastSeenAt: timestamp,
      },
    });
  }

  let holderCountDelta = 0;
  if (toUserAsset.balance == 0n && toUserAsset.balance + value > 0n) {
    holderCountDelta += 1;
  }
  if (fromUserAsset.balance > 0n && fromUserAsset.balance - value == 0n) {
    holderCountDelta -= 1;
  }

  const [poolEntity] = await Promise.all([
    db.find(pool, {
      address: tokenData.pool ?? zeroAddress,
      chainId: chain.id,
    }),
    updateToken({
      tokenAddress: assetId,
      context,
      update: {
        holderCount: tokenData.holderCount + holderCountDelta,
      },
    }),
    updateUserAsset({
      userId: toId,
      assetId: assetId,
      context,
      update: {
        balance: toUserAsset.balance + value,
        lastInteraction: timestamp,
      },
    }),
    updateUserAsset({
      userId: fromId,
      assetId: assetId,
      context,
      update: {
        lastInteraction: timestamp,
        balance: fromUserAsset.balance - value,
      },
    }),
  ]);

  if (poolEntity && tokenData.pool) {
    await updatePool({
      poolAddress: tokenData.pool,
      context,
      update: {
        holderCount: tokenData.holderCount + holderCountDelta,
      },
    });
  }
});
