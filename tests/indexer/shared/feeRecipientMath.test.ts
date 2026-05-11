import { describe, expect, it } from "vitest";
import {
  FEE_RECIPIENT_SHARES_WAD,
  calculateClaimableFee,
  hasCompleteFeeRecipientShares,
} from "../../../src/indexer/shared/feeRecipientMath";
import { calculateTotalFeesUsd } from "../../../src/indexer/shared/feeValue";

describe("feeRecipientMath", () => {
  it("calculates claimable fees using WAD shares instead of dynamic recipient totals", () => {
    const halfShares = FEE_RECIPIENT_SHARES_WAD / 2n;

    expect(
      calculateClaimableFee({
        cumulatedFees: 100n,
        lastCumulatedFees: 20n,
        shares: halfShares,
      }),
    ).toBe(40n);
  });

  it("returns zero when last cumulated fees are already current", () => {
    expect(
      calculateClaimableFee({
        cumulatedFees: 20n,
        lastCumulatedFees: 20n,
        shares: FEE_RECIPIENT_SHARES_WAD,
      }),
    ).toBe(0n);
  });

  it("recognizes only a full WAD share set as complete", () => {
    expect(
      hasCompleteFeeRecipientShares([
        { shares: FEE_RECIPIENT_SHARES_WAD / 2n },
        { shares: FEE_RECIPIENT_SHARES_WAD / 2n },
      ]),
    ).toBe(true);

    expect(
      hasCompleteFeeRecipientShares([{ shares: FEE_RECIPIENT_SHARES_WAD / 2n }]),
    ).toBe(false);
  });

  it("calculates total fee USD from quote and base fees", () => {
    expect(
      calculateTotalFeesUsd({
        token0Fees: 2n * FEE_RECIPIENT_SHARES_WAD,
        token1Fees: 3n * FEE_RECIPIENT_SHARES_WAD,
        isToken0: true,
        price: 2n * FEE_RECIPIENT_SHARES_WAD,
        quoteInfo: {
          quoteToken: "eth",
          quotePrice: FEE_RECIPIENT_SHARES_WAD,
          quoteDecimals: 18,
          quotePriceDecimals: 18,
        },
      }),
    ).toBe(7n * FEE_RECIPIENT_SHARES_WAD);
  });
});
