import { and, eq } from "ponder";
import { Context } from "ponder:registry";
import { rehypeFeeBeneficiary } from "ponder:schema";
import { Address } from "viem";
import {
  MulticurveBeneficiary,
  normalizePoolBeneficiaries,
} from "../multicurve/poolBeneficiaryUtils";
import { resolveRehypeFeeBeneficiaryTransfer } from "./rehypeFeeBeneficiaryUtils";

export async function setRehypeFeeBeneficiaries({
  poolId,
  assetId,
  initializer,
  beneficiaries,
  timestamp,
  context,
}: {
  poolId: Address;
  assetId: Address;
  initializer: Address;
  beneficiaries: readonly MulticurveBeneficiary[];
  timestamp: bigint;
  context: Context;
}): Promise<void> {
  const chainId = context.chain.id;
  const poolIdAddr = poolId.toLowerCase() as `0x${string}`;
  const assetIdAddr = assetId.toLowerCase() as `0x${string}`;
  const initializerAddr = initializer.toLowerCase() as `0x${string}`;
  const normalizedBeneficiaries = normalizePoolBeneficiaries(beneficiaries);

  await context.db.sql
    .delete(rehypeFeeBeneficiary)
    .where(and(
      eq(rehypeFeeBeneficiary.poolId, poolIdAddr),
      eq(rehypeFeeBeneficiary.chainId, chainId),
    ));

  await Promise.all(
    normalizedBeneficiaries.map((beneficiary) =>
      context.db.insert(rehypeFeeBeneficiary).values({
        poolId: poolIdAddr,
        chainId,
        beneficiary: beneficiary.beneficiary,
        assetId: assetIdAddr,
        shares: BigInt(beneficiary.shares),
        initializer: initializerAddr,
        discoveredAt: timestamp,
        updatedAt: timestamp,
      }),
    ),
  );
}

export async function transferRehypeFeeBeneficiary({
  poolId,
  oldBeneficiary,
  newBeneficiary,
  timestamp,
  context,
}: {
  poolId: Address;
  oldBeneficiary: Address;
  newBeneficiary: Address;
  timestamp: bigint;
  context: Context;
}): Promise<void> {
  const chainId = context.chain.id;
  const poolIdAddr = poolId.toLowerCase() as `0x${string}`;
  const oldBeneficiaryAddr = oldBeneficiary.toLowerCase() as `0x${string}`;

  const existingBeneficiary = await context.db.find(rehypeFeeBeneficiary, {
    poolId: poolIdAddr,
    chainId,
    beneficiary: oldBeneficiaryAddr,
  });

  // Fee beneficiaries are not enumerable on-chain, so unlike the LP set there
  // is no refetch fallback when the old row is missing.
  const plan = resolveRehypeFeeBeneficiaryTransfer({
    oldBeneficiary,
    newBeneficiary,
    oldShares: existingBeneficiary?.shares,
  });

  if (plan.action === "noop" || !existingBeneficiary) {
    return;
  }

  await context.db.sql
    .delete(rehypeFeeBeneficiary)
    .where(and(
      eq(rehypeFeeBeneficiary.poolId, poolIdAddr),
      eq(rehypeFeeBeneficiary.chainId, chainId),
      eq(rehypeFeeBeneficiary.beneficiary, plan.oldBeneficiary),
    ));

  await context.db
    .insert(rehypeFeeBeneficiary)
    .values({
      poolId: poolIdAddr,
      chainId,
      beneficiary: plan.newBeneficiary,
      assetId: existingBeneficiary.assetId,
      shares: plan.shares,
      initializer: existingBeneficiary.initializer,
      discoveredAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate((existing) => ({
      shares: existing.shares + plan.shares,
      updatedAt: timestamp,
    }));
}
