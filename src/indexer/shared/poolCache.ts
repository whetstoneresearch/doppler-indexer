import { pool } from "ponder:schema";

type PoolEntity = typeof pool.$inferSelect;

// In-memory cache for pool entities
// Key: `${chainId}:${address}`, Value: PoolEntity
const poolCache = new Map<string, PoolEntity>();

function getCacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/**
 * Get a cached pool entity if it exists
 */
export function getCachedPool(chainId: number, address: string): PoolEntity | null {
  return poolCache.get(getCacheKey(chainId, address)) ?? null;
}

/**
 * Cache a pool entity
 */
export function setCachedPool(chainId: number, address: string, poolEntity: PoolEntity): void {
  poolCache.set(getCacheKey(chainId, address), poolEntity);
}

/**
 * Update a cached pool entity with partial updates
 * This keeps the cache in sync with DB updates
 */
export function updateCachedPool(
  chainId: number,
  address: string,
  updates: Partial<PoolEntity>
): void {
  const key = getCacheKey(chainId, address);
  const existing = poolCache.get(key);
  if (existing) {
    poolCache.set(key, { ...existing, ...updates });
  }
}

/**
 * Check if a pool is in the cache
 */
export function isPoolCached(chainId: number, address: string): boolean {
  return poolCache.has(getCacheKey(chainId, address));
}

/**
 * Get current cache size (for monitoring)
 */
export function getPoolCacheSize(): number {
  return poolCache.size;
}
