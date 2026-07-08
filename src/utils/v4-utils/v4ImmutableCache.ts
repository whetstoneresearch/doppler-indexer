import { Address } from "viem";
import { PoolKey, V4PoolConfig } from "@app/types/v4-types";

/**
 * Immutable, per-pool on-chain values for a v4 (Doppler hook) pool. These are
 * all set when the pool is created and never change afterwards, so they can be
 * read from chain once and cached for the lifetime of the process.
 *
 * Caching these avoids re-fetching ~4 `eth_call`s on every swap (poolKey,
 * pool config, airlock asset data, base-token decimals), leaving only the live
 * slot0/liquidity read on the hot path. See getV4PoolData.
 */
export interface V4PoolImmutables {
  key: PoolKey;
  poolConfig: V4PoolConfig;
  baseToken: Address;
  isToken0: boolean;
  baseTokenDecimals: number;
}

// `null` is a valid, cached value: it marks a hook whose pool currencies are
// precompile addresses and is permanently skipped (so we don't re-read poolKey
// for it on every event).
const cache = new Map<string, V4PoolImmutables | null>();

function getCacheKey(chainId: number, hook: string): string {
  return `${chainId}:${hook.toLowerCase()}`;
}

export function hasCachedV4Immutables(chainId: number, hook: string): boolean {
  return cache.has(getCacheKey(chainId, hook));
}

export function getCachedV4Immutables(
  chainId: number,
  hook: string
): V4PoolImmutables | null | undefined {
  return cache.get(getCacheKey(chainId, hook));
}

export function setCachedV4Immutables(
  chainId: number,
  hook: string,
  value: V4PoolImmutables | null
): void {
  cache.set(getCacheKey(chainId, hook), value);
}

export function getV4ImmutableCacheSize(): number {
  return cache.size;
}
