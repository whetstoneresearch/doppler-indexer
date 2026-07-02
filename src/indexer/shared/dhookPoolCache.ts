import { Context } from "ponder:registry";
import { pool } from "ponder:schema";
import { or, eq } from "ponder";
import { chainConfigs } from "@app/config/chains";

const knownDHookPoolIds = new Set<string>();
let cacheInitialized = false;
let cacheInitializing = false;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Per-chain set of addresses that seed DHook liquidity through the PoolManager.
// On robinhood the DopplerHookInitializer is itself the pool hook, so the
// seeding ModifyLiquidity events carry sender = initializer; on other chains the
// initializer still calls PoolManager.modifyLiquidity directly. Keying on sender
// lets us record the initial seeding even before the pool is registered in the
// DHook cache (the seeding logs precede the initializer's Create event).
const dhookSenderCache = new Map<string, Set<string>>();

function collectAddresses(value: unknown, out: Set<string>): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectAddresses(entry, out);
    return;
  }
  if (typeof value === "string" && value.toLowerCase() !== ZERO_ADDRESS) {
    out.add(value.toLowerCase());
  }
}

export function isDHookLiquiditySender(chainName: string, sender: string): boolean {
  let senders = dhookSenderCache.get(chainName);
  if (!senders) {
    senders = new Set<string>();
    const v4 =
      chainConfigs[chainName as keyof typeof chainConfigs]?.addresses?.v4;
    if (v4) {
      collectAddresses(v4.DopplerHookInitializer, senders);
      collectAddresses(v4.RehypeDopplerHookInitializer, senders);
    }
    dhookSenderCache.set(chainName, senders);
  }
  return senders.has(sender.toLowerCase());
}

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
