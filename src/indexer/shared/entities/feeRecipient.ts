import { Context } from "ponder:registry";
import { cumulatedFees, feeRecipient, pool } from "ponder:schema";
import { and, eq } from "ponder";
import { Address } from "viem";
import { clearBeneficiariesCache, setBeneficiariesCache } from "../beneficiariesCache";
import { hasCompleteFeeRecipientShares } from "../feeRecipientMath";
import {
  FeeRecipientInput,
  hasAuthoritativeNormalizedRecipients,
  normalizeFeeRecipients,
  NormalizedFeeRecipient,
  serializeFeeRecipientsForJson,
  transferLegacyBeneficiaryEntries,
} from "../feeRecipientTransfer";
export { normalizeFeeRecipients } from "../feeRecipientTransfer";

async function transferCumulatedFees({
  poolId,
  chainId,
  oldBeneficiary,
  newBeneficiary,
  context,
}: {
  poolId: `0x${string}`;
  chainId: number;
  oldBeneficiary: `0x${string}`;
  newBeneficiary: `0x${string}`;
  context: Context;
}): Promise<void> {
  if (oldBeneficiary === newBeneficiary) {
    return;
  }

  const existingFees = await context.db.find(cumulatedFees, {
    poolId,
    chainId,
    beneficiary: oldBeneficiary,
  });

  if (!existingFees) {
    return;
  }

  await context.db
    .insert(cumulatedFees)
    .values({
      poolId,
      chainId,
      beneficiary: newBeneficiary,
      token0Fees: existingFees.token0Fees,
      token1Fees: existingFees.token1Fees,
      totalFeesUsd: existingFees.totalFeesUsd,
    })
    .onConflictDoUpdate((existing) => ({
      token0Fees: existing.token0Fees + existingFees.token0Fees,
      token1Fees: existing.token1Fees + existingFees.token1Fees,
      totalFeesUsd: existing.totalFeesUsd + existingFees.totalFeesUsd,
    }));

  await context.db.delete(cumulatedFees, {
    poolId,
    chainId,
    beneficiary: oldBeneficiary,
  });
}

export async function upsertFeeRecipients({
  poolId,
  chainId,
  initializer,
  recipients,
  context,
}: {
  poolId: Address;
  chainId: number;
  initializer: Address;
  recipients: readonly FeeRecipientInput[] | null | undefined;
  context: Context;
}): Promise<NormalizedFeeRecipient[]> {
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;
  const initializerLower = initializer.toLowerCase() as `0x${string}`;
  const normalizedRecipients = normalizeFeeRecipients(recipients);

  await Promise.all(
    normalizedRecipients.map((recipient) =>
      context.db
        .insert(feeRecipient)
        .values({
          poolId: poolIdLower,
          chainId,
          beneficiary: recipient.beneficiary,
          shares: recipient.shares,
          initializer: initializerLower,
        })
        .onConflictDoUpdate(() => ({
          shares: recipient.shares,
          initializer: initializerLower,
        }))
    )
  );

  if (hasCompleteFeeRecipientShares(normalizedRecipients)) {
    setBeneficiariesCache(chainId, poolIdLower, {
      beneficiaries: normalizedRecipients,
      initializer: initializerLower,
    });
  } else {
    clearBeneficiariesCache(chainId, poolIdLower);
  }

  return normalizedRecipients;
}

export async function getFeeRecipientsForPool({
  poolId,
  chainId,
  context,
}: {
  poolId: Address;
  chainId: number;
  context: Context;
}): Promise<Array<typeof feeRecipient.$inferSelect>> {
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;

  return context.db.sql
    .select()
    .from(feeRecipient)
    .where(
      and(
        eq(feeRecipient.poolId, poolIdLower),
        eq(feeRecipient.chainId, chainId)
      )
    );
}

export async function updateFeeRecipientBeneficiary({
  poolId,
  chainId,
  oldBeneficiary,
  newBeneficiary,
  context,
}: {
  poolId: Address;
  chainId: number;
  oldBeneficiary: Address;
  newBeneficiary: Address;
  context: Context;
}): Promise<void> {
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;
  const oldBeneficiaryLower = oldBeneficiary.toLowerCase() as `0x${string}`;
  const newBeneficiaryLower = newBeneficiary.toLowerCase() as `0x${string}`;

  const recipients = await getFeeRecipientsForPool({ poolId, chainId, context });
  const normalizedRecipients = recipients.map((recipient) => ({
    beneficiary: recipient.beneficiary,
    shares: recipient.shares,
  }));
  const useNormalizedRecipients = hasAuthoritativeNormalizedRecipients(normalizedRecipients);

  if (!useNormalizedRecipients) {
    const poolEntity = await context.db.find(pool, {
      address: poolIdLower,
      chainId,
    });

    if (!poolEntity || !poolEntity.beneficiaries || !poolEntity.initializer) {
      clearBeneficiariesCache(chainId, poolIdLower);
      return;
    }

    const updatedRecipients = transferLegacyBeneficiaryEntries({
      recipients: poolEntity.beneficiaries as Parameters<typeof transferLegacyBeneficiaryEntries>[0]["recipients"],
      oldBeneficiary: oldBeneficiaryLower,
      newBeneficiary: newBeneficiaryLower,
    });

    await context.db.update(pool, {
      address: poolIdLower,
      chainId,
    }).set({
      beneficiaries: serializeFeeRecipientsForJson(updatedRecipients),
    });

    await transferCumulatedFees({
      poolId: poolIdLower,
      chainId,
      oldBeneficiary: oldBeneficiaryLower,
      newBeneficiary: newBeneficiaryLower,
      context,
    });

    setBeneficiariesCache(chainId, poolIdLower, {
      beneficiaries: updatedRecipients,
      initializer: poolEntity.initializer,
    });

    return;
  }

  const existingRecipient = recipients.find((recipient) => recipient.beneficiary === oldBeneficiaryLower);

  if (!existingRecipient) {
    clearBeneficiariesCache(chainId, poolIdLower);
    return;
  }

  await context.db.delete(feeRecipient, {
    poolId: poolIdLower,
    chainId,
    beneficiary: oldBeneficiaryLower,
  });

  await context.db
    .insert(feeRecipient)
    .values({
      poolId: poolIdLower,
      chainId,
      beneficiary: newBeneficiaryLower,
      shares: existingRecipient.shares,
      initializer: existingRecipient.initializer,
    })
    .onConflictDoUpdate((existing) => ({
      shares: existing.shares + existingRecipient.shares,
      initializer: existingRecipient.initializer,
    }));

  await transferCumulatedFees({
    poolId: poolIdLower,
    chainId,
    oldBeneficiary: oldBeneficiaryLower,
    newBeneficiary: newBeneficiaryLower,
    context,
  });

  const updatedRecipients = await getFeeRecipientsForPool({ poolId, chainId, context });
  setBeneficiariesCache(chainId, poolIdLower, {
    beneficiaries: updatedRecipients.map((recipient) => ({
      beneficiary: recipient.beneficiary,
      shares: recipient.shares,
    })),
    initializer: existingRecipient.initializer,
  });
}
