import { Context } from "ponder:registry";
import { v4pools } from "ponder:schema";

const knownV4MigrationPoolIds = new Set<string>();
let cacheInitialized = false;
let cacheInitializing = false;

function getCacheKey(chainId: number, poolId: string): string {
  return `${chainId}:${poolId.toLowerCase()}`;
}

export async function initializeV4MigrationPoolCache(context: Context): Promise<void> {
  if (cacheInitialized || cacheInitializing) {
    return;
  }

  cacheInitializing = true;

  try {
    const { db } = context;

    const allPools = await db.sql
      .select({
        poolId: v4pools.poolId,
        chainId: v4pools.chainId,
        migratedFromPool: v4pools.migratedFromPool,
      })
      .from(v4pools);

    const migratedPools = allPools.filter(pool => pool.migratedFromPool !== null);

    for (const pool of migratedPools) {
      const key = getCacheKey(pool.chainId, pool.poolId);
      knownV4MigrationPoolIds.add(key);
    }

    cacheInitialized = true;
    console.log(
      `[V4MigrationPoolCache] Initialized with ${migratedPools.length} existing migration pools`
    );
  } catch (error) {
    console.error(`[V4MigrationPoolCache] Failed to initialize cache:`, error);
    cacheInitializing = false;
    throw error;
  }
}

export function isV4MigrationPoolCacheInitialized(): boolean {
  return cacheInitialized;
}

export function addToV4MigrationPoolCache(chainId: number, poolId: string): void {
  const key = getCacheKey(chainId, poolId);
  knownV4MigrationPoolIds.add(key);
}

export function isKnownV4MigrationPool(chainId: number, poolId: string): boolean {
  const key = getCacheKey(chainId, poolId);
  return knownV4MigrationPoolIds.has(key);
}

export function getV4MigrationPoolCacheSize(): number {
  return knownV4MigrationPoolIds.size;
}
