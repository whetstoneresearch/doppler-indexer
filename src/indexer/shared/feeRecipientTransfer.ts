import { Address } from "viem";
import { FEE_RECIPIENT_SHARES_WAD } from "./feeRecipientMath";

export interface FeeRecipientInput {
  beneficiary: Address;
  shares: bigint;
}

interface LegacyFeeRecipientInput {
  beneficiary: Address;
  shares: bigint | number | string;
}

export interface NormalizedFeeRecipient {
  beneficiary: `0x${string}`;
  shares: bigint;
}

export interface SerializedFeeRecipient {
  beneficiary: `0x${string}`;
  shares: string;
}

export function normalizeFeeRecipients(
  recipients: readonly LegacyFeeRecipientInput[] | null | undefined,
): NormalizedFeeRecipient[] {
  return (recipients ?? []).map((recipient) => ({
    beneficiary: recipient.beneficiary.toLowerCase() as `0x${string}`,
    shares: BigInt(recipient.shares),
  }));
}

export function transferLegacyBeneficiaryEntries({
  recipients,
  oldBeneficiary,
  newBeneficiary,
}: {
  recipients: readonly LegacyFeeRecipientInput[] | null | undefined;
  oldBeneficiary: Address;
  newBeneficiary: Address;
}): NormalizedFeeRecipient[] {
  const oldBeneficiaryLower = oldBeneficiary.toLowerCase() as `0x${string}`;
  const newBeneficiaryLower = newBeneficiary.toLowerCase() as `0x${string}`;
  const sharesByBeneficiary = new Map<`0x${string}`, bigint>();

  for (const recipient of normalizeFeeRecipients(recipients)) {
    const beneficiary = recipient.beneficiary === oldBeneficiaryLower ? newBeneficiaryLower : recipient.beneficiary;
    sharesByBeneficiary.set(beneficiary, (sharesByBeneficiary.get(beneficiary) ?? 0n) + recipient.shares);
  }

  return Array.from(sharesByBeneficiary, ([beneficiary, shares]) => ({ beneficiary, shares }));
}

export function serializeFeeRecipientsForJson(
  recipients: readonly NormalizedFeeRecipient[],
): SerializedFeeRecipient[] {
  return recipients.map((recipient) => ({
    beneficiary: recipient.beneficiary,
    shares: recipient.shares.toString(),
  }));
}

export function hasAuthoritativeNormalizedRecipients(
  recipients: readonly NormalizedFeeRecipient[],
): boolean {
  const totalShares = recipients.reduce((sum, recipient) => sum + recipient.shares, 0n);

  return totalShares === FEE_RECIPIENT_SHARES_WAD;
}
