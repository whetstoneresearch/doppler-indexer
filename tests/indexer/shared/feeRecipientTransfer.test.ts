import { describe, expect, it } from "vitest";
import {
  hasAuthoritativeNormalizedRecipients,
  serializeFeeRecipientsForJson,
  transferLegacyBeneficiaryEntries,
} from "../../../src/indexer/shared/feeRecipientTransfer";

describe("fee recipient transfer helpers", () => {
  it("moves an old beneficiary entry to the new beneficiary", () => {
    const result = transferLegacyBeneficiaryEntries({
      recipients: [
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: "400000000000000000",
        },
        {
          beneficiary: "0x2222222222222222222222222222222222222222",
          shares: "600000000000000000",
        },
      ],
      oldBeneficiary: "0x1111111111111111111111111111111111111111",
      newBeneficiary: "0x3333333333333333333333333333333333333333",
    });

    expect(result).toEqual([
      {
        beneficiary: "0x3333333333333333333333333333333333333333",
        shares: 400000000000000000n,
      },
      {
        beneficiary: "0x2222222222222222222222222222222222222222",
        shares: 600000000000000000n,
      },
    ]);
  });

  it("merges duplicate new beneficiary entries by adding shares", () => {
    const result = transferLegacyBeneficiaryEntries({
      recipients: [
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 250000000000000000n,
        },
        {
          beneficiary: "0x2222222222222222222222222222222222222222",
          shares: 750000000000000000n,
        },
      ],
      oldBeneficiary: "0x1111111111111111111111111111111111111111",
      newBeneficiary: "0x2222222222222222222222222222222222222222",
    });

    expect(result).toEqual([
      {
        beneficiary: "0x2222222222222222222222222222222222222222",
        shares: 1000000000000000000n,
      },
    ]);
  });

  it("serializes transferred shares to JSON-compatible strings", () => {
    const transferredRecipients = transferLegacyBeneficiaryEntries({
      recipients: [
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 250000000000000000n,
        },
        {
          beneficiary: "0x2222222222222222222222222222222222222222",
          shares: "750000000000000000",
        },
      ],
      oldBeneficiary: "0x1111111111111111111111111111111111111111",
      newBeneficiary: "0x2222222222222222222222222222222222222222",
    });

    expect(serializeFeeRecipientsForJson(transferredRecipients)).toEqual([
      {
        beneficiary: "0x2222222222222222222222222222222222222222",
        shares: "1000000000000000000",
      },
    ]);
  });

  it("treats only complete normalized recipient sets as authoritative", () => {
    expect(
      hasAuthoritativeNormalizedRecipients(
        [
          {
            beneficiary: "0x1111111111111111111111111111111111111111",
            shares: 500000000000000000n,
          },
        ],
      ),
    ).toBe(false);

    expect(
      hasAuthoritativeNormalizedRecipients(
        [
          {
            beneficiary: "0x2222222222222222222222222222222222222222",
            shares: 1000000000000000000n,
          },
        ],
      ),
    ).toBe(true);

    expect(
      hasAuthoritativeNormalizedRecipients(
        [
          {
            beneficiary: "0x1111111111111111111111111111111111111111",
            shares: 1000000000000000000n,
          },
        ],
      ),
    ).toBe(true);
  });
});
