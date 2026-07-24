import { Address } from "viem";

export type RehypeFeeBeneficiaryTransferPlan =
  | { action: "noop" }
  | {
    action: "move";
    oldBeneficiary: `0x${string}`;
    newBeneficiary: `0x${string}`;
    shares: bigint;
  };

export function resolveRehypeFeeBeneficiaryTransfer({
  oldBeneficiary,
  newBeneficiary,
  oldShares,
}: {
  oldBeneficiary: Address;
  newBeneficiary: Address;
  oldShares: bigint | undefined;
}): RehypeFeeBeneficiaryTransferPlan {
  const oldBeneficiaryAddr = oldBeneficiary.toLowerCase() as `0x${string}`;
  const newBeneficiaryAddr = newBeneficiary.toLowerCase() as `0x${string}`;

  if (oldBeneficiaryAddr === newBeneficiaryAddr || !oldShares || oldShares <= 0n) {
    return { action: "noop" };
  }

  return {
    action: "move",
    oldBeneficiary: oldBeneficiaryAddr,
    newBeneficiary: newBeneficiaryAddr,
    shares: oldShares,
  };
}
