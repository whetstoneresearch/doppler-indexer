export const FEE_RECIPIENT_SHARES_WAD = 10n ** 18n;

export interface FeeRecipientShare {
  shares: bigint;
}

export function hasCompleteFeeRecipientShares(
  recipients: readonly FeeRecipientShare[],
): boolean {
  return recipients.reduce((sum, recipient) => sum + recipient.shares, 0n) === FEE_RECIPIENT_SHARES_WAD;
}

export function calculateClaimableFee({
  cumulatedFees,
  lastCumulatedFees,
  shares,
}: {
  cumulatedFees: bigint;
  lastCumulatedFees: bigint;
  shares: bigint;
}): bigint {
  if (cumulatedFees <= lastCumulatedFees) {
    return 0n;
  }

  return ((cumulatedFees - lastCumulatedFees) * shares) / FEE_RECIPIENT_SHARES_WAD;
}
