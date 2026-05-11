import { AirlockABI, DopplerHookInitializerABI, DopplerHookMigratorABI, RehypeDopplerHookInitializerABI, RehypeDopplerHookMigratorABI } from "@app/abis";
import { getQuoteInfo } from "@app/utils/getQuoteInfo";
import { cumulatedFees, pool, v4pools } from "ponder:schema";
import { Context } from "ponder:registry";
import { calculateTotalFeesUsd, upsertAirlockOwnerFees } from "./cumulatedFees";
import { and, eq } from "ponder";
import { getOrFetchBeneficiaries } from "./beneficiariesCache";

type RehypeHookFees = readonly [bigint, bigint, bigint, bigint, bigint, bigint, number];
type StoredBeneficiary = { beneficiary?: string };

function getStoredBeneficiarySet(recipients: unknown): Set<`0x${string}`> | null {
  if (!Array.isArray(recipients)) {
    return null;
  }

  return new Set(
    recipients
      .map((recipient: StoredBeneficiary) => recipient.beneficiary?.toLowerCase())
      .filter((beneficiary): beneficiary is `0x${string}` => !!beneficiary)
  );
}

async function deleteStaleAirlockOwnerFees({
  poolId,
  chainId,
  currentOwner,
  beneficiarySet,
  context,
}: {
  poolId: `0x${string}`;
  chainId: number;
  currentOwner: `0x${string}`;
  beneficiarySet: Set<`0x${string}`> | null;
  context: Context;
}): Promise<void> {
  if (!beneficiarySet) {
    return;
  }

  const existingFeeRows = await context.db.sql
    .select()
    .from(cumulatedFees)
    .where(and(eq(cumulatedFees.poolId, poolId), eq(cumulatedFees.chainId, chainId)));

  await Promise.all(
    existingFeeRows
      .filter((row) => !beneficiarySet.has(row.beneficiary) && row.beneficiary !== currentOwner)
      .map((row) =>
        context.db.delete(cumulatedFees, {
          poolId,
          chainId,
          beneficiary: row.beneficiary,
        })
      )
  );
}

async function readRehypeInitializerOwner({
  hookAddress,
  context,
}: {
  hookAddress: `0x${string}`;
  context: Context;
}): Promise<`0x${string}` | null> {
  const initializer = await context.client.readContract({
    abi: RehypeDopplerHookInitializerABI,
    address: hookAddress,
    functionName: "INITIALIZER",
  }).catch(() => null);

  if (!initializer) {
    return null;
  }

  const airlock = await context.client.readContract({
    abi: DopplerHookInitializerABI,
    address: initializer,
    functionName: "airlock",
  }).catch(() => null);

  if (!airlock) {
    return null;
  }

  const owner = await context.client.readContract({
    abi: AirlockABI,
    address: airlock,
    functionName: "owner",
  }).catch(() => null);

  return owner ? (owner.toLowerCase() as `0x${string}`) : null;
}

async function readRehypeMigratorOwner({
  hookAddress,
  context,
}: {
  hookAddress: `0x${string}`;
  context: Context;
}): Promise<`0x${string}` | null> {
  const airlock = await context.client.readContract({
    abi: DopplerHookMigratorABI,
    address: hookAddress,
    functionName: "airlock",
  }).catch(() => null);

  if (!airlock) {
    return null;
  }

  const owner = await context.client.readContract({
    abi: AirlockABI,
    address: airlock,
    functionName: "owner",
  }).catch(() => null);

  return owner ? (owner.toLowerCase() as `0x${string}`) : null;
}

export async function refreshRehypeInitializerAirlockOwnerFees({
  poolId,
  airlockOwner,
  hookAddress,
  timestamp,
  context,
}: {
  poolId: `0x${string}`;
  airlockOwner?: `0x${string}`;
  hookAddress: `0x${string}`;
  timestamp: bigint;
  context: Context;
}): Promise<`0x${string}` | null> {
  const poolAddress = poolId.toLowerCase() as `0x${string}`;
  const poolEntity = await context.db.find(pool, {
    address: poolAddress,
    chainId: context.chain.id,
  });

  if (!poolEntity) {
    return null;
  }

  const [resolvedOwner, hookFees] = await Promise.all([
    airlockOwner ?? readRehypeInitializerOwner({ hookAddress, context }),
    context.client.readContract({
      abi: RehypeDopplerHookInitializerABI,
      address: hookAddress,
      functionName: "getHookFees",
      args: [poolAddress],
    }).catch(() => null),
  ]);

  if (!resolvedOwner || !hookFees) {
    return null;
  }

  const rehypeFees = hookFees as RehypeHookFees;
  const quoteInfo = await getQuoteInfo(poolEntity.quoteToken, timestamp, context);
  const totalFeesUsd = calculateTotalFeesUsd({
    token0Fees: rehypeFees[4],
    token1Fees: rehypeFees[5],
    isToken0: poolEntity.isToken0,
    price: poolEntity.price,
    quoteInfo,
  });

  await upsertAirlockOwnerFees({
    poolId: poolAddress,
    chainId: context.chain.id,
    airlockOwner: resolvedOwner,
    token0Fees: rehypeFees[4],
    token1Fees: rehypeFees[5],
    totalFeesUsd,
    context,
  });

  const cachedBeneficiaries = await getOrFetchBeneficiaries(context.chain.id, poolAddress, context);

  await deleteStaleAirlockOwnerFees({
    poolId: poolAddress,
    chainId: context.chain.id,
    currentOwner: resolvedOwner,
    beneficiarySet: cachedBeneficiaries
      ? new Set(cachedBeneficiaries.beneficiaries.map((beneficiary) => beneficiary.beneficiary))
      : null,
    context,
  });

  return resolvedOwner;
}

export async function refreshRehypeMigratorAirlockOwnerFees({
  poolId,
  airlockOwner,
  hookAddress,
  timestamp,
  context,
}: {
  poolId: `0x${string}`;
  airlockOwner?: `0x${string}`;
  hookAddress: `0x${string}`;
  timestamp: bigint;
  context: Context;
}): Promise<`0x${string}` | null> {
  const poolAddress = poolId.toLowerCase() as `0x${string}`;
  const v4Pool = await context.db.find(v4pools, {
    poolId: poolAddress,
    chainId: context.chain.id,
  });

  if (!v4Pool) {
    return null;
  }

  const [resolvedOwner, hookFees] = await Promise.all([
    airlockOwner ?? readRehypeMigratorOwner({ hookAddress, context }),
    context.client.readContract({
      abi: RehypeDopplerHookMigratorABI,
      address: hookAddress,
      functionName: "getHookFees",
      args: [poolAddress],
    }).catch(() => null),
  ]);

  if (!resolvedOwner || !hookFees) {
    return null;
  }

  const rehypeFees = hookFees as RehypeHookFees;
  const quoteInfo = await getQuoteInfo(v4Pool.quoteToken, timestamp, context);
  const totalFeesUsd = calculateTotalFeesUsd({
    token0Fees: rehypeFees[4],
    token1Fees: rehypeFees[5],
    isToken0: v4Pool.isToken0,
    price: v4Pool.price,
    quoteInfo,
  });

  await upsertAirlockOwnerFees({
    poolId: poolAddress,
    chainId: context.chain.id,
    airlockOwner: resolvedOwner,
    token0Fees: rehypeFees[4],
    token1Fees: rehypeFees[5],
    totalFeesUsd,
    context,
  });

  await deleteStaleAirlockOwnerFees({
    poolId: poolAddress,
    chainId: context.chain.id,
    currentOwner: resolvedOwner,
    beneficiarySet: getStoredBeneficiarySet(v4Pool.beneficiaries),
    context,
  });

  return resolvedOwner;
}
