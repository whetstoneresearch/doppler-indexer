import { Context } from "ponder:registry";
import { invalidPools } from "ponder:schema";

const knownInvalidPoolAddresses = new Set<string>();
let cacheInitialized = false;
let cacheInitializing = false;

function getCacheKey(chainId: number, poolAddress: string): string {
  return `${chainId}:${poolAddress.toLowerCase()}`;
}

export async function initializeInvalidPoolCache(context: Context): Promise<void> {
  if (cacheInitialized || cacheInitializing) return;
  cacheInitializing = true;

  try {
    const { db } = context;
    const allInvalidPools = await db.sql
      .select({ poolAddress: invalidPools.poolAddress, chainId: invalidPools.chainId })
      .from(invalidPools);

    for (const pool of allInvalidPools) {
      knownInvalidPoolAddresses.add(getCacheKey(pool.chainId, pool.poolAddress));
    }

    cacheInitialized = true;
    console.log(`[InvalidPoolCache] Initialized with ${allInvalidPools.length} invalid pools`);
  } catch (error) {
    console.error(`[InvalidPoolCache] Failed to initialize:`, error);
    cacheInitializing = false;
    throw error;
  }
}

export function isInvalidPoolCacheInitialized(): boolean {
  return cacheInitialized;
}

export function isInvalidPool(chainId: number, poolAddress: string): boolean {
  return knownInvalidPoolAddresses.has(getCacheKey(chainId, poolAddress));
}

export function addToInvalidPoolCache(chainId: number, poolAddress: string): void {
  knownInvalidPoolAddresses.add(getCacheKey(chainId, poolAddress));
}

export async function markPoolAsInvalid(
  context: Context,
  poolAddress: `0x${string}`,
  chainId: number,
  reason: string,
  invalidCurrency?: `0x${string}`,
  timestamp?: bigint
): Promise<void> {
  addToInvalidPoolCache(chainId, poolAddress);

  await context.db.insert(invalidPools).values({
    poolAddress,
    chainId,
    reason,
    invalidCurrency,
    createdAt: timestamp ?? BigInt(Date.now()),
  });

  console.log(`[InvalidPoolCache] Marked pool ${poolAddress} as invalid: ${reason}`);
}
