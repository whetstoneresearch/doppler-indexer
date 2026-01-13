import { Context } from "ponder:registry";
import { Address, zeroAddress } from "viem";
import { isEOA } from "@app/utils/isEOA";
import {
  initializeInvalidPoolCache,
  isInvalidPoolCacheInitialized,
  isInvalidPool,
  markPoolAsInvalid,
} from "./invalidPoolCache";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  invalidCurrency?: Address;
}

// LRU cache for currency validation results
// Key: `${chainId}:${address}`, Value: true if valid contract, false if EOA
const CURRENCY_CACHE_MAX_SIZE = 2000;
const currencyValidationCache = new Map<string, boolean>();

function getCurrencyCacheKey(chainId: number, address: Address): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function getCachedCurrencyValidation(chainId: number, address: Address): boolean | undefined {
  const key = getCurrencyCacheKey(chainId, address);
  const value = currencyValidationCache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used) by deleting and re-adding
    currencyValidationCache.delete(key);
    currencyValidationCache.set(key, value);
  }
  return value;
}

function setCachedCurrencyValidation(chainId: number, address: Address, isValidContract: boolean): void {
  const key = getCurrencyCacheKey(chainId, address);
  // If already exists, delete first to update position
  if (currencyValidationCache.has(key)) {
    currencyValidationCache.delete(key);
  }
  // Evict oldest entries if at capacity
  while (currencyValidationCache.size >= CURRENCY_CACHE_MAX_SIZE) {
    const oldestKey = currencyValidationCache.keys().next().value;
    if (oldestKey) {
      currencyValidationCache.delete(oldestKey);
    }
  }
  currencyValidationCache.set(key, isValidContract);
}

export async function validatePoolCurrencies(
  context: Context,
  poolAddress: Address,
  currency0: Address,
  currency1: Address,
  timestamp: bigint
): Promise<ValidationResult> {
  const { client, chain } = context;

  console.log(`[validatePoolCurrencies] Validating pool ${poolAddress} with currency0=${currency0}, currency1=${currency1}`);

  if (!isInvalidPoolCacheInitialized()) {
    await initializeInvalidPoolCache(context);
  }

  if (isInvalidPool(chain.id, poolAddress)) {
    return { valid: false, reason: "Pool already marked invalid" };
  }

  if (currency0 !== zeroAddress) {
    const cachedResult0 = getCachedCurrencyValidation(chain.id, currency0);
    let isEOA0: boolean;

    if (cachedResult0 !== undefined) {
      // Cache stores true for valid contracts, so EOA = !cachedResult
      isEOA0 = !cachedResult0;
      console.log(`[validatePoolCurrencies] currency0 ${currency0} isEOA=${isEOA0} (cached)`);
    } else {
      isEOA0 = await isEOA(client, currency0);
      console.log(`[validatePoolCurrencies] currency0 ${currency0} isEOA=${isEOA0}`);
      setCachedCurrencyValidation(chain.id, currency0, !isEOA0);
    }

    if (isEOA0) {
      await markPoolAsInvalid(
        context,
        poolAddress as `0x${string}`,
        chain.id,
        "currency0 is EOA",
        currency0 as `0x${string}`,
        timestamp
      );
      return { valid: false, reason: "currency0 is EOA", invalidCurrency: currency0 };
    }
  }

  if (currency1 !== zeroAddress) {
    const cachedResult1 = getCachedCurrencyValidation(chain.id, currency1);
    let isEOA1: boolean;

    if (cachedResult1 !== undefined) {
      // Cache stores true for valid contracts, so EOA = !cachedResult
      isEOA1 = !cachedResult1;
      console.log(`[validatePoolCurrencies] currency1 ${currency1} isEOA=${isEOA1} (cached)`);
    } else {
      isEOA1 = await isEOA(client, currency1);
      console.log(`[validatePoolCurrencies] currency1 ${currency1} isEOA=${isEOA1}`);
      setCachedCurrencyValidation(chain.id, currency1, !isEOA1);
    }

    if (isEOA1) {
      await markPoolAsInvalid(
        context,
        poolAddress as `0x${string}`,
        chain.id,
        "currency1 is EOA",
        currency1 as `0x${string}`,
        timestamp
      );
      return { valid: false, reason: "currency1 is EOA", invalidCurrency: currency1 };
    }
  }

  return { valid: true };
}

export async function shouldSkipPool(
  context: Context,
  poolAddress: Address
): Promise<boolean> {
  if (!isInvalidPoolCacheInitialized()) {
    await initializeInvalidPoolCache(context);
  }
  return isInvalidPool(context.chain.id, poolAddress);
}
