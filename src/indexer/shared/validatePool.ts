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
    const isEOA0 = await isEOA(client, currency0);
    console.log(`[validatePoolCurrencies] currency0 ${currency0} isEOA=${isEOA0}`);
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
    const isEOA1 = await isEOA(client, currency1);
    console.log(`[validatePoolCurrencies] currency1 ${currency1} isEOA=${isEOA1}`);
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
