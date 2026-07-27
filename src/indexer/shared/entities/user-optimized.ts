import { Context } from "ponder:registry";
import { user, userAsset } from "ponder:schema";
import { Address, zeroAddress } from "viem";
import { computeHolderCountDelta, nextHolderCount } from "./holder-count";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

/**
 * Batch upsert users and user assets efficiently
 */
export const batchUpsertUsersAndAssets = async ({
  senderAddress,
  recipientAddress,
  tokenAddress,
  senderBalance,
  recipientBalance,
  timestamp,
  context,
}: {
  senderAddress: Address;
  recipientAddress: Address;
  tokenAddress: Address;
  senderBalance: bigint;
  recipientBalance: bigint;
  timestamp: bigint;
  context: Context;
}): Promise<{
  senderAsset: typeof userAsset.$inferSelect | null;
  recipientAsset: typeof userAsset.$inferSelect | null;
  holderCountDelta: number;
}> => {
  const { db, chain } = context;
  const senderLower = senderAddress.toLowerCase() as `0x${string}`;
  const recipientLower = recipientAddress.toLowerCase() as `0x${string}`;
  const tokenLower = tokenAddress.toLowerCase() as `0x${string}`;
  const isMint = senderLower === ZERO_ADDRESS;
  const isBurn = recipientLower === ZERO_ADDRESS;

  const userInserts: Promise<any>[] = [];
  if (!isMint) {
    userInserts.push(
      db.insert(user)
        .values({
          address: senderLower,
          chainId: chain.id,
          createdAt: timestamp,
          lastSeenAt: timestamp,
        })
        .onConflictDoUpdate(() => ({
          lastSeenAt: timestamp,
        }))
    );
  }
  if (!isBurn) {
    userInserts.push(
      db.insert(user)
        .values({
          address: recipientLower,
          chainId: chain.id,
          createdAt: timestamp,
          lastSeenAt: timestamp,
        })
        .onConflictDoUpdate(() => ({
          lastSeenAt: timestamp,
        }))
    );
  }
  
  if (userInserts.length > 0) {
    await Promise.all(userInserts);
  }

  let existingSenderAsset: typeof userAsset.$inferSelect | null;
  let existingRecipientAsset: typeof userAsset.$inferSelect | null;

  existingSenderAsset = !isMint ? await db.find(userAsset, {
    userId: senderLower,
    assetId: tokenLower,
    chainId: chain.id,
  }) : null;

  existingRecipientAsset = !isBurn ? await db.find(userAsset, {
    userId: recipientLower,
    assetId: tokenLower,
    chainId: chain.id,
  }) : null;
  
  const holderCountDelta = computeHolderCountDelta({
    senderAddress: senderLower,
    recipientAddress: recipientLower,
    senderPreviousBalance: existingSenderAsset?.balance ?? 0n,
    senderBalance,
    recipientPreviousBalance: existingRecipientAsset?.balance ?? 0n,
    recipientBalance,
  });

  // Batch upsert user assets (skip zero address)
  let senderAsset: typeof userAsset.$inferSelect | null = null;
  let recipientAsset: typeof userAsset.$inferSelect | null = null;
  
  const assetUpserts: Promise<any>[] = [];
  
  if (!isMint) {
    assetUpserts.push(
      db.insert(userAsset)
        .values({
          userId: senderLower,
          assetId: tokenLower,
          chainId: chain.id,
          createdAt: timestamp,
          balance: senderBalance,
          lastInteraction: timestamp,
        })
        .onConflictDoUpdate(() => ({
          balance: senderBalance,
          lastInteraction: timestamp,
        }))
        .then(result => { senderAsset = result; })
    );
  }
  
  if (!isBurn) {
    assetUpserts.push(
      db.insert(userAsset)
        .values({
          userId: recipientLower,
          assetId: tokenLower,
          chainId: chain.id,
          balance: recipientBalance,
          createdAt: timestamp,
          lastInteraction: timestamp,
        })
        .onConflictDoUpdate(() => ({
          balance: recipientBalance,
          lastInteraction: timestamp,
        }))
        .then(result => { recipientAsset = result; })
    );
  }
  
  if (assetUpserts.length > 0) {
    await Promise.all(assetUpserts);
  }

  return {
    senderAsset,
    recipientAsset,
    holderCountDelta,
  };
};

/**
 * Batch update holder counts for multiple entities.
 *
 * `token` is authoritative and `pool` mirrors it — see `holder-count.ts` for why
 * the pool count is never derived from its own previous value.
 */
export const batchUpdateHolderCounts = async ({
  tokenAddress,
  poolAddress,
  holderCountDelta,
  currentTokenHolderCount,
  context,
}: {
  tokenAddress: Address;
  poolAddress: Address | null;
  holderCountDelta: number;
  currentTokenHolderCount: number;
  context: Context;
}): Promise<void> => {
  const { db, chain } = context;

  if (holderCountDelta === 0) {
    return;
  }

  const holderCount = nextHolderCount(currentTokenHolderCount, holderCountDelta);

  // Update token holder count first (must succeed independently)
  await db.update(token, {
    address: tokenAddress.toLowerCase() as `0x${string}`,
    chainId: chain.id,
  }).set({
    holderCount,
  });

  // Mirror the authoritative token count onto the pool. Writing the token-derived
  // value (rather than poolEntity.holderCount + delta) also self-heals pool rows
  // created after the token already had holders.
  if (poolAddress && poolAddress.toLowerCase() !== zeroAddress) {
    const address = poolAddress.toLowerCase() as `0x${string}`;
    const poolEntity = await db.find(pool, {
      address,
      chainId: chain.id,
    });
    if (poolEntity) {
      await db.update(pool, {
        address,
        chainId: chain.id,
      }).set({
        holderCount,
      });
    }
  }
};

// Import necessary schema types
import { token, pool } from "ponder:schema";