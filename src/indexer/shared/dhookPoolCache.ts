import { Context } from "ponder:registry";
import { pool } from "ponder:schema";
import { or, eq } from "ponder";

const knownDHookPoolIds = new Set<string>();
let cacheInitialized = false;
let cacheInitializing = false;

function getCacheKey(chainId: number, poolId: string): string {
  return `${chainId}:${poolId.toLowerCase()}`;
}

export async function initializeDHookPoolCache(context: Context): Promise<void> {
  if (cacheInitialized || cacheInitializing) {
    return;
  }

  cacheInitializing = true;

  try {
    const { db } = context;

    const dhookPools = await db.sql
      .select({
        address: pool.address,
        chainId: pool.chainId,
      })
      .from(pool)
      .where(or(eq(pool.type, "dhook"), eq(pool.type, "rehype")));

    for (const p of dhookPools) {
      knownDHookPoolIds.add(getCacheKey(p.chainId, p.address));
    }

    cacheInitialized = true;
    console.log(
      `[DHookPoolCache] Initialized with ${dhookPools.length} existing dhook/rehype pools`
    );
  } catch (error) {
    console.error(`[DHookPoolCache] Failed to initialize cache:`, error);
    cacheInitializing = false;
    throw error;
  }
}

export function isDHookPoolCacheInitialized(): boolean {
  return cacheInitialized;
}

export function addToDHookPoolCache(chainId: number, poolId: string): void {
  knownDHookPoolIds.add(getCacheKey(chainId, poolId));
}

export function isKnownDHookPool(chainId: number, poolId: string): boolean {
  return knownDHookPoolIds.has(getCacheKey(chainId, poolId));
}

export function getDHookPoolCacheSize(): number {
  return knownDHookPoolIds.size;
}
