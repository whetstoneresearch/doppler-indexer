import { describe, expect, it } from "vitest";
import { mergePoolBeneficiaryTransfer, normalizeIndexedPoolBeneficiaries, normalizePoolBeneficiaries } from "./poolBeneficiaryUtils";

describe("normalizePoolBeneficiaries", () => {
  it("normalizes beneficiary addresses and stringifies shares", () => {
    expect(
      normalizePoolBeneficiaries([
        {
          beneficiary: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
          shares: 100n,
        },
      ]),
    ).toEqual([
      {
        beneficiary: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        shares: "100",
      },
    ]);
  });

  it("filters the zero address", () => {
    expect(
      normalizePoolBeneficiaries([
        {
          beneficiary: "0x0000000000000000000000000000000000000000",
          shares: 100n,
        },
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 200n,
        },
      ]),
    ).toEqual([
      {
        beneficiary: "0x1111111111111111111111111111111111111111",
        shares: "200",
      },
    ]);
  });

  it("filters zero-share beneficiaries", () => {
    expect(
      normalizePoolBeneficiaries([
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 0n,
        },
      ]),
    ).toEqual([]);
  });

  it("merges duplicate beneficiaries", () => {
    expect(
      normalizePoolBeneficiaries([
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 100n,
        },
        {
          beneficiary: "0x1111111111111111111111111111111111111111",
          shares: 200n,
        },
      ]),
    ).toEqual([
      {
        beneficiary: "0x1111111111111111111111111111111111111111",
        shares: "300",
      },
    ]);
  });

  it("normalizes persisted beneficiary snapshots", () => {
    expect(
      normalizeIndexedPoolBeneficiaries([
        { beneficiary: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD", shares: "100" },
        { beneficiary: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", shares: "50" },
        { beneficiary: "0x2222222222222222222222222222222222222222", shares: "0" },
        { beneficiary: "0x3333333333333333333333333333333333333333", shares: "bad" },
        { beneficiary: 123, shares: "10" },
      ]),
    ).toEqual([
      {
        beneficiary: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        shares: "150",
      },
    ]);
  });

  it("merges transferred shares into an existing beneficiary", () => {
    expect(
      mergePoolBeneficiaryTransfer({
        beneficiaries: [
          { beneficiary: "0x1111111111111111111111111111111111111111", shares: "100" },
          { beneficiary: "0x2222222222222222222222222222222222222222", shares: "50" },
        ],
        oldBeneficiary: "0x1111111111111111111111111111111111111111",
        newBeneficiary: "0x2222222222222222222222222222222222222222",
        shares: 100n,
      }),
    ).toEqual([
      { beneficiary: "0x2222222222222222222222222222222222222222", shares: "150" },
    ]);
  });
});
