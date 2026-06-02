import { and, eq } from "ponder";
import { Context } from "ponder:registry";
import { pool, poolBeneficiary } from "ponder:schema";
import { Address } from "viem";
import { setBeneficiariesCache } from "../../beneficiariesCache";
import {
  IndexedPoolBeneficiary,
  MulticurveBeneficiary,
  mergePoolBeneficiaryTransfer,
  normalizeIndexedPoolBeneficiaries,
  normalizePoolBeneficiaries,
} from "./poolBeneficiaryUtils";

export type { IndexedPoolBeneficiary, MulticurveBeneficiary } from "./poolBeneficiaryUtils";

const GET_BENEFICIARIES_ABI = [
  {
    type: "function",
    name: "getBeneficiaries",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "beneficiary", type: "address" },
          { name: "shares", type: "uint96" },
        ],
      },
    ],
  },
] as const;

async function refetchPoolBeneficiaries({
  poolId,
  poolEntity,
  timestamp,
  context,
}: {
  poolId: Address;
  poolEntity: typeof pool.$inferSelect;
  timestamp: bigint;
  context: Context;
}): Promise<IndexedPoolBeneficiary[]> {
  const beneficiaries = await context.client.readContract({
    abi: GET_BENEFICIARIES_ABI,
    address: poolEntity.initializer!,
    functionName: "getBeneficiaries",
    args: [poolEntity.baseToken],
  });

  return replacePoolBeneficiaries({
    poolId,
    assetId: poolEntity.baseToken,
    initializer: poolEntity.initializer!,
    beneficiaries,
    timestamp,
    context,
  });
}

export async function replacePoolBeneficiaries({
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
}): Promise<IndexedPoolBeneficiary[]> {
  const chainId = context.chain.id;
  const poolIdAddr = poolId.toLowerCase() as `0x${string}`;
  const assetIdAddr = assetId.toLowerCase() as `0x${string}`;
  const initializerAddr = initializer.toLowerCase() as `0x${string}`;
  const normalizedBeneficiaries = normalizePoolBeneficiaries(beneficiaries);

  await context.db.sql
    .delete(poolBeneficiary)
    .where(and(
      eq(poolBeneficiary.poolId, poolIdAddr),
      eq(poolBeneficiary.chainId, chainId),
    ));

  await Promise.all(
    normalizedBeneficiaries.map((beneficiary) =>
      context.db.insert(poolBeneficiary).values({
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

  await context.db
    .update(pool, { address: poolIdAddr, chainId })
    .set({ beneficiaries: normalizedBeneficiaries });

  setBeneficiariesCache(chainId, poolIdAddr, {
    beneficiaries: normalizedBeneficiaries.map((beneficiary) => ({
      beneficiary: beneficiary.beneficiary,
      shares: BigInt(beneficiary.shares),
    })),
    initializer: initializerAddr,
  });

  return normalizedBeneficiaries;
}

export async function transferPoolBeneficiary({
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
}): Promise<IndexedPoolBeneficiary[] | null> {
  const chainId = context.chain.id;
  const poolIdAddr = poolId.toLowerCase() as `0x${string}`;
  const oldBeneficiaryAddr = oldBeneficiary.toLowerCase() as `0x${string}`;
  const newBeneficiaryAddr = newBeneficiary.toLowerCase() as `0x${string}`;

  if (oldBeneficiaryAddr === newBeneficiaryAddr) {
    return normalizeIndexedPoolBeneficiaries((await context.db.find(pool, {
      address: poolIdAddr,
      chainId,
    }))?.beneficiaries);
  }

  const poolEntity = await context.db.find(pool, {
    address: poolIdAddr,
    chainId,
  });

  if (!poolEntity || !poolEntity.initializer) {
    return null;
  }

  const existingBeneficiary = await context.db.find(poolBeneficiary, {
    poolId: poolIdAddr,
    chainId,
    beneficiary: oldBeneficiaryAddr,
  });
  const snapshotBeneficiaries = normalizeIndexedPoolBeneficiaries(poolEntity.beneficiaries);
  const snapshotMatch = snapshotBeneficiaries.find(
    (beneficiary) => beneficiary.beneficiary === oldBeneficiaryAddr,
  );

  if (!existingBeneficiary && !snapshotMatch) {
    return refetchPoolBeneficiaries({
      poolId: poolIdAddr,
      poolEntity,
      timestamp,
      context,
    });
  }

  const shares = existingBeneficiary?.shares ?? (snapshotMatch ? BigInt(snapshotMatch.shares) : 0n);

  await context.db.sql
    .delete(poolBeneficiary)
    .where(and(
      eq(poolBeneficiary.poolId, poolIdAddr),
      eq(poolBeneficiary.chainId, chainId),
      eq(poolBeneficiary.beneficiary, oldBeneficiaryAddr),
    ));

  const nextBeneficiaries = shares > 0n
    ? mergePoolBeneficiaryTransfer({
      beneficiaries: snapshotBeneficiaries,
      oldBeneficiary: oldBeneficiaryAddr,
      newBeneficiary: newBeneficiaryAddr,
      shares,
    })
    : snapshotBeneficiaries.filter((beneficiary) => beneficiary.beneficiary !== oldBeneficiaryAddr);

  if (shares > 0n && newBeneficiaryAddr !== oldBeneficiaryAddr) {
    await context.db
      .insert(poolBeneficiary)
      .values({
        poolId: poolIdAddr,
        chainId,
        beneficiary: newBeneficiaryAddr,
        assetId: poolEntity.baseToken,
        shares,
        initializer: poolEntity.initializer,
        discoveredAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate((existing) => ({
        shares: existing.shares + shares,
        updatedAt: timestamp,
      }));
  }

  await context.db
    .update(pool, { address: poolIdAddr, chainId })
    .set({ beneficiaries: nextBeneficiaries });

  setBeneficiariesCache(chainId, poolIdAddr, {
    beneficiaries: nextBeneficiaries.map((beneficiary) => ({
      beneficiary: beneficiary.beneficiary,
      shares: BigInt(beneficiary.shares),
    })),
    initializer: poolEntity.initializer,
  });

  return nextBeneficiaries;
}
