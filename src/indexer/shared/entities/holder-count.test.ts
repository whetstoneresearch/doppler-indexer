import { describe, expect, it } from "vitest";
import { computeHolderCountDelta, nextHolderCount } from "./holder-count";

const ZERO = "0x0000000000000000000000000000000000000000";
const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

const delta = (params: Partial<Parameters<typeof computeHolderCountDelta>[0]>) =>
  computeHolderCountDelta({
    senderAddress: ALICE,
    recipientAddress: BOB,
    senderPreviousBalance: 0n,
    senderBalance: 0n,
    recipientPreviousBalance: 0n,
    recipientBalance: 0n,
    ...params,
  });

describe("computeHolderCountDelta", () => {
  it("counts a mint to a new address as a gained holder", () => {
    expect(
      delta({
        senderAddress: ZERO,
        recipientPreviousBalance: 0n,
        recipientBalance: 1000n,
      }),
    ).toBe(1);
  });

  it("does not count a mint to an existing holder", () => {
    expect(
      delta({
        senderAddress: ZERO,
        recipientPreviousBalance: 500n,
        recipientBalance: 1500n,
      }),
    ).toBe(0);
  });

  it("never counts the zero address as a holder on a mint", () => {
    // The zero address' balance is meaningless; it must not be treated as an exit.
    expect(
      delta({
        senderAddress: ZERO,
        senderPreviousBalance: 1000n,
        senderBalance: 0n,
        recipientPreviousBalance: 0n,
        recipientBalance: 1000n,
      }),
    ).toBe(1);
  });

  it("counts a full burn as a lost holder", () => {
    expect(
      delta({
        recipientAddress: ZERO,
        senderPreviousBalance: 1000n,
        senderBalance: 0n,
      }),
    ).toBe(-1);
  });

  it("does not count a partial burn", () => {
    expect(
      delta({
        recipientAddress: ZERO,
        senderPreviousBalance: 1000n,
        senderBalance: 400n,
      }),
    ).toBe(0);
  });

  it("never counts the zero address as a gained holder on a burn", () => {
    expect(
      delta({
        recipientAddress: ZERO,
        senderPreviousBalance: 1000n,
        senderBalance: 400n,
        recipientPreviousBalance: 0n,
        recipientBalance: 1000n,
      }),
    ).toBe(0);
  });

  it("counts a transfer to a new address as a gained holder", () => {
    expect(
      delta({
        senderPreviousBalance: 1000n,
        senderBalance: 400n,
        recipientPreviousBalance: 0n,
        recipientBalance: 600n,
      }),
    ).toBe(1);
  });

  it("nets to zero when the sender exits and the recipient is new", () => {
    expect(
      delta({
        senderPreviousBalance: 1000n,
        senderBalance: 0n,
        recipientPreviousBalance: 0n,
        recipientBalance: 1000n,
      }),
    ).toBe(-1 + 1);
  });

  it("counts a full transfer between existing holders as no change", () => {
    expect(
      delta({
        senderPreviousBalance: 1000n,
        senderBalance: 400n,
        recipientPreviousBalance: 200n,
        recipientBalance: 800n,
      }),
    ).toBe(0);
  });

  it("counts the sender emptying out as a lost holder", () => {
    expect(
      delta({
        senderPreviousBalance: 1000n,
        senderBalance: 0n,
        recipientPreviousBalance: 200n,
        recipientBalance: 1200n,
      }),
    ).toBe(-1);
  });

  it("ignores a zero-value transfer between existing holders", () => {
    expect(
      delta({
        senderPreviousBalance: 1000n,
        senderBalance: 1000n,
        recipientPreviousBalance: 200n,
        recipientBalance: 200n,
      }),
    ).toBe(0);
  });

  it("ignores a zero-value transfer to an address that stays empty", () => {
    expect(
      delta({
        senderPreviousBalance: 1000n,
        senderBalance: 1000n,
        recipientPreviousBalance: 0n,
        recipientBalance: 0n,
      }),
    ).toBe(0);
  });

  it("matches on the zero address regardless of casing", () => {
    expect(
      delta({
        senderAddress: "0x0000000000000000000000000000000000000000".toUpperCase(),
        senderPreviousBalance: 1000n,
        senderBalance: 0n,
        recipientBalance: 1000n,
      }),
    ).toBe(1);
  });
});

describe("nextHolderCount", () => {
  it("applies the delta to the current count", () => {
    expect(nextHolderCount(5, 1)).toBe(6);
    expect(nextHolderCount(5, -1)).toBe(4);
    expect(nextHolderCount(5, 0)).toBe(5);
  });

  it("clamps at zero so an under-counted row never goes negative", () => {
    expect(nextHolderCount(0, -1)).toBe(0);
    expect(nextHolderCount(1, -3)).toBe(0);
  });
});
