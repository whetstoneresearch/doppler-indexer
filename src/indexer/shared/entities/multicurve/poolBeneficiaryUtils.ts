import { Address, zeroAddress } from "viem";

export type MulticurveBeneficiary = {
  beneficiary: Address;
  shares: bigint;
};

export type IndexedPoolBeneficiary = {
  beneficiary: `0x${string}`;
  shares: string;
};

export function normalizePoolBeneficiaries(
  beneficiaries: readonly MulticurveBeneficiary[],
): IndexedPoolBeneficiary[] {
  const sharesByBeneficiary = new Map<`0x${string}`, bigint>();

  for (const { beneficiary, shares } of beneficiaries) {
    const beneficiaryAddress = beneficiary.toLowerCase() as `0x${string}`;
    if (beneficiaryAddress === zeroAddress || shares <= 0n) {
      continue;
    }

    sharesByBeneficiary.set(
      beneficiaryAddress,
      (sharesByBeneficiary.get(beneficiaryAddress) ?? 0n) + shares,
    );
  }

  return [...sharesByBeneficiary.entries()].map(([beneficiary, shares]) => ({
    beneficiary,
    shares: shares.toString(),
  }));
}

export function mergePoolBeneficiaryTransfer({
  beneficiaries,
  oldBeneficiary,
  newBeneficiary,
  shares,
}: {
  beneficiaries: readonly IndexedPoolBeneficiary[];
  oldBeneficiary: `0x${string}`;
  newBeneficiary: `0x${string}`;
  shares: bigint;
}): IndexedPoolBeneficiary[] {
  const nextBeneficiaries = beneficiaries.filter(
    (beneficiary) => beneficiary.beneficiary !== oldBeneficiary,
  );
  const existingNewBeneficiary = nextBeneficiaries.find(
    (beneficiary) => beneficiary.beneficiary === newBeneficiary,
  );

  if (existingNewBeneficiary) {
    existingNewBeneficiary.shares = (BigInt(existingNewBeneficiary.shares) + shares).toString();
    return nextBeneficiaries;
  }

  return [...nextBeneficiaries, { beneficiary: newBeneficiary, shares: shares.toString() }];
}

export function normalizeIndexedPoolBeneficiaries(beneficiaries: unknown): IndexedPoolBeneficiary[] {
  if (!Array.isArray(beneficiaries)) {
    return [];
  }

  const sharesByBeneficiary = new Map<`0x${string}`, bigint>();

  for (const beneficiary of beneficiaries) {
    if (!isIndexedPoolBeneficiary(beneficiary)) {
      continue;
    }

    let shares: bigint;
    try {
      shares = BigInt(beneficiary.shares);
    } catch {
      continue;
    }
    const beneficiaryAddress = beneficiary.beneficiary.toLowerCase() as `0x${string}`;
    if (beneficiaryAddress === zeroAddress || shares <= 0n) {
      continue;
    }

    sharesByBeneficiary.set(
      beneficiaryAddress,
      (sharesByBeneficiary.get(beneficiaryAddress) ?? 0n) + shares,
    );
  }

  return [...sharesByBeneficiary.entries()].map(([beneficiary, shares]) => ({
    beneficiary,
    shares: shares.toString(),
  }));
}

function isIndexedPoolBeneficiary(value: unknown): value is IndexedPoolBeneficiary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<IndexedPoolBeneficiary>;
  return typeof candidate.beneficiary === "string" && typeof candidate.shares === "string";
}
