import { Context } from "ponder:registry";
import { pool } from "ponder:schema";

interface BeneficiaryData {
  beneficiary: `0x${string}`;
  shares: bigint;
}

export interface CachedBeneficiaries {
  beneficiaries: BeneficiaryData[];
  initializer: `0x${string}`;
}

const MAX_CACHE_SIZE = 500;
const cache = new Map<string, CachedBeneficiaries | null>();

function getCacheKey(chainId: number, poolAddress: string): string {
  return `${chainId}:${poolAddress.toLowerCase()}`;
}

export function getBeneficiariesFromCache(chainId: number, poolAddress: string): CachedBeneficiaries | null | undefined {
  const key = getCacheKey(chainId, poolAddress);
  const entry = cache.get(key);
  if (entry !== undefined) {
    // Move to end for LRU
    cache.delete(key);
    cache.set(key, entry);
  }
  return entry;
}

export function setBeneficiariesCache(chainId: number, poolAddress: string, data: CachedBeneficiaries | null): void {
  const key = getCacheKey(chainId, poolAddress);
  cache.delete(key);
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest (first entry)
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, data);
}

export async function getOrFetchBeneficiaries(
  chainId: number,
  poolAddress: `0x${string}`,
  context: Context,
): Promise<CachedBeneficiaries | null> {
  const cached = getBeneficiariesFromCache(chainId, poolAddress);
  if (cached !== undefined) {
    return cached;
  }

  // DB fallback
  const { db } = context;
  const poolEntity = await db.find(pool, {
    address: poolAddress,
    chainId,
  });

  if (!poolEntity || !poolEntity.beneficiaries || !poolEntity.initializer) {
    setBeneficiariesCache(chainId, poolAddress, null);
    return null;
  }

  const beneficiaries = (poolEntity.beneficiaries as BeneficiaryData[]).map(b => ({
    beneficiary: b.beneficiary.toLowerCase() as `0x${string}`,
    shares: BigInt(b.shares),
  }));

  const result: CachedBeneficiaries = {
    beneficiaries,
    initializer: poolEntity.initializer,
  };

  setBeneficiariesCache(chainId, poolAddress, result);
  return result;
}
