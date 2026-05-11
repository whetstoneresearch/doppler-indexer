import { Context } from "ponder:registry";
import { feeRecipient, pool } from "ponder:schema";
import { and, eq } from "ponder";
import { hasCompleteFeeRecipientShares } from "./feeRecipientMath";

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

export function clearBeneficiariesCache(chainId: number, poolAddress: string): void {
  cache.delete(getCacheKey(chainId, poolAddress));
}

export async function getOrFetchBeneficiaries(
  chainId: number,
  poolAddress: `0x${string}`,
  context: Context,
): Promise<CachedBeneficiaries | null> {
  const poolAddressLower = poolAddress.toLowerCase() as `0x${string}`;
  const cached = getBeneficiariesFromCache(chainId, poolAddressLower);
  if (cached !== undefined) {
    return cached;
  }

  const { db } = context;
  const normalizedRecipients = await db.sql
    .select()
    .from(feeRecipient)
    .where(
      and(
        eq(feeRecipient.poolId, poolAddressLower),
        eq(feeRecipient.chainId, chainId)
      )
    );

  if (hasCompleteFeeRecipientShares(normalizedRecipients)) {
    const initializer = normalizedRecipients[0]?.initializer;
    if (!initializer) {
      setBeneficiariesCache(chainId, poolAddressLower, null);
      return null;
    }

    const result: CachedBeneficiaries = {
      beneficiaries: normalizedRecipients.map((recipient) => ({
        beneficiary: recipient.beneficiary.toLowerCase() as `0x${string}`,
        shares: recipient.shares,
      })),
      initializer,
    };

    setBeneficiariesCache(chainId, poolAddressLower, result);
    return result;
  }

  // DB fallback for rows created before fee_recipient existed or incomplete normalized rows.
  const poolEntity = await db.find(pool, {
    address: poolAddressLower,
    chainId,
  });

  if (!poolEntity || !poolEntity.beneficiaries || !poolEntity.initializer) {
    setBeneficiariesCache(chainId, poolAddressLower, null);
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

  setBeneficiariesCache(chainId, poolAddressLower, result);
  return result;
}
