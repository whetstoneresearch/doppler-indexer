import { describe, expect, it } from "vitest";
import { normalizePoolBeneficiaries } from "../multicurve/poolBeneficiaryUtils";
import { resolveRehypeFeeBeneficiaryTransfer } from "./rehypeFeeBeneficiaryUtils";

describe("resolveRehypeFeeBeneficiaryTransfer", () => {
  it("moves the full share balance to the new beneficiary", () => {
    expect(
      resolveRehypeFeeBeneficiaryTransfer({
        oldBeneficiary: "0x1111111111111111111111111111111111111111",
        newBeneficiary: "0x2222222222222222222222222222222222222222",
        oldShares: 300n,
      }),
    ).toEqual({
      action: "move",
      oldBeneficiary: "0x1111111111111111111111111111111111111111",
      newBeneficiary: "0x2222222222222222222222222222222222222222",
      shares: 300n,
    });
  });

  it("lowercases both addresses", () => {
    expect(
      resolveRehypeFeeBeneficiaryTransfer({
        oldBeneficiary: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
        newBeneficiary: "0x2222222222222222222222222222222222222222",
        oldShares: 100n,
      }),
    ).toEqual({
      action: "move",
      oldBeneficiary: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      newBeneficiary: "0x2222222222222222222222222222222222222222",
      shares: 100n,
    });
  });

  it("no-ops when old and new beneficiary match case-insensitively", () => {
    expect(
      resolveRehypeFeeBeneficiaryTransfer({
        oldBeneficiary: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
        newBeneficiary: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        oldShares: 100n,
      }),
    ).toEqual({ action: "noop" });
  });

  it("no-ops when the old beneficiary has no indexed row", () => {
    expect(
      resolveRehypeFeeBeneficiaryTransfer({
        oldBeneficiary: "0x1111111111111111111111111111111111111111",
        newBeneficiary: "0x2222222222222222222222222222222222222222",
        oldShares: undefined,
      }),
    ).toEqual({ action: "noop" });
  });

  it("no-ops when the old beneficiary has zero shares", () => {
    expect(
      resolveRehypeFeeBeneficiaryTransfer({
        oldBeneficiary: "0x1111111111111111111111111111111111111111",
        newBeneficiary: "0x2222222222222222222222222222222222222222",
        oldShares: 0n,
      }),
    ).toEqual({ action: "noop" });
  });
});

describe("FeeBeneficiariesSet payload normalization", () => {
  it("normalizes event beneficiaries into lowercased rows with string shares", () => {
    expect(
      normalizePoolBeneficiaries([
        {
          beneficiary: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
          shares: 250000000000000000n,
        },
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 750000000000000000n,
        },
      ]),
    ).toEqual([
      {
        beneficiary: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        shares: "250000000000000000",
      },
      {
        beneficiary: "0x1111111111111111111111111111111111111111",
        shares: "750000000000000000",
      },
    ]);
  });
});
