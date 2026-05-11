import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertAirlockOwnerFees = vi.hoisted(() => vi.fn());
const getOrFetchBeneficiaries = vi.hoisted(() => vi.fn());

vi.mock("ponder:schema", () => ({
  cumulatedFees: {},
  pool: {},
  v4pools: {},
}));

vi.mock("ponder", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@app/utils/getQuoteInfo", () => ({
  getQuoteInfo: vi.fn().mockResolvedValue({
    quoteToken: "eth",
    quotePrice: 1n,
    quoteDecimals: 18,
    quotePriceDecimals: 18,
  }),
}));

vi.mock("../../src/indexer/shared/cumulatedFees", async () => {
  const actual = await vi.importActual<typeof import("../../src/indexer/shared/cumulatedFees")>(
    "../../src/indexer/shared/cumulatedFees"
  );
  return {
    ...actual,
    upsertAirlockOwnerFees,
  };
});

vi.mock("../../src/indexer/shared/beneficiariesCache", () => ({
  getOrFetchBeneficiaries,
}));

const { refreshRehypeInitializerAirlockOwnerFees, refreshRehypeMigratorAirlockOwnerFees } = await import("../../src/indexer/shared/rehypeAirlockOwnerFees");

describe("refreshRehypeInitializerAirlockOwnerFees", () => {
  beforeEach(() => {
    upsertAirlockOwnerFees.mockReset();
    getOrFetchBeneficiaries.mockReset();
    getOrFetchBeneficiaries.mockResolvedValue(null);
  });

  it("discovers the current Rehype airlock owner before a claim event", async () => {
    const poolId = `0x${"1".repeat(64)}` as `0x${string}`;
    const hookAddress = `0x${"2".repeat(40)}` as `0x${string}`;
    const initializerAddress = `0x${"6".repeat(40)}` as `0x${string}`;
    const airlockAddress = `0x${"7".repeat(40)}` as `0x${string}`;
    const owner = `0x${"3".repeat(40)}` as `0x${string}`;
    const context = {
      chain: { id: 8453 },
      db: {
        find: vi.fn().mockResolvedValue({
          quoteToken: `0x${"4".repeat(40)}`,
          isToken0: true,
          price: 2n * 10n ** 18n,
        }),
      },
      client: {
        readContract: vi.fn().mockImplementation(({ functionName }) => {
          if (functionName === "INITIALIZER") {
            return Promise.resolve(initializerAddress);
          }

          if (functionName === "airlock") {
            return Promise.resolve(airlockAddress);
          }

          if (functionName === "owner") {
            return Promise.resolve(owner);
          }

          if (functionName === "getHookFees") {
            return Promise.resolve([0n, 0n, 0n, 0n, 7n, 11n, 0]);
          }

          return Promise.reject(new Error(`unexpected read: ${functionName}`));
        }),
      },
    };

    await refreshRehypeInitializerAirlockOwnerFees({
      poolId,
      hookAddress,
      timestamp: 1n,
      context: context as Parameters<typeof refreshRehypeInitializerAirlockOwnerFees>[0]["context"],
    });

    expect(context.client.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "owner",
    }));
    expect(upsertAirlockOwnerFees).toHaveBeenCalledWith(expect.objectContaining({
      poolId,
      chainId: 8453,
      airlockOwner: owner,
      token0Fees: 7n,
      token1Fees: 11n,
    }));
  });

  it("reads migrator airlock owner fees from the Rehype migrator contract", async () => {
    const poolId = `0x${"8".repeat(64)}` as `0x${string}`;
    const migratorAddress = `0x${"9".repeat(40)}` as `0x${string}`;
    const airlockAddress = `0x${"d".repeat(40)}` as `0x${string}`;
    const owner = `0x${"a".repeat(40)}` as `0x${string}`;
    const context = {
      chain: { id: 8453 },
      db: {
        find: vi.fn().mockResolvedValue({
          quoteToken: `0x${"b".repeat(40)}`,
          isToken0: false,
          price: 3n * 10n ** 18n,
        }),
      },
      client: {
        readContract: vi.fn().mockImplementation(({ address, functionName }) => {
          if (functionName !== "owner") {
            expect(address).toBe(migratorAddress);
          }

          if (functionName === "airlock") {
            return Promise.resolve(airlockAddress);
          }

          if (functionName === "owner") {
            expect(address).toBe(airlockAddress);
            return Promise.resolve(owner);
          }

          if (functionName === "getHookFees") {
            return Promise.resolve([0n, 0n, 0n, 0n, 13n, 17n, 0]);
          }

          return Promise.reject(new Error(`unexpected read: ${functionName}`));
        }),
      },
    };

    await refreshRehypeMigratorAirlockOwnerFees({
      poolId,
      hookAddress: migratorAddress,
      timestamp: 1n,
      context: context as Parameters<typeof refreshRehypeMigratorAirlockOwnerFees>[0]["context"],
    });

    expect(context.client.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: migratorAddress,
      functionName: "getHookFees",
      args: [poolId],
    }));
    expect(upsertAirlockOwnerFees).toHaveBeenCalledWith(expect.objectContaining({
      poolId,
      chainId: 8453,
      airlockOwner: owner,
      token0Fees: 13n,
      token1Fees: 17n,
    }));
  });

  it("deletes stale non-recipient owner rows after resolving the current owner", async () => {
    const poolId = `0x${"e".repeat(64)}` as `0x${string}`;
    const hookAddress = `0x${"1".repeat(40)}` as `0x${string}`;
    const initializerAddress = `0x${"2".repeat(40)}` as `0x${string}`;
    const airlockAddress = `0x${"3".repeat(40)}` as `0x${string}`;
    const currentOwner = `0x${"4".repeat(40)}` as `0x${string}`;
    const staleOwner = `0x${"5".repeat(40)}` as `0x${string}`;
    const recipient = `0x${"6".repeat(40)}` as `0x${string}`;
    const oldRecipient = `0x${"7".repeat(40)}` as `0x${string}`;
    const deleteRow = vi.fn();
    const where = vi.fn().mockResolvedValue([
      { beneficiary: staleOwner },
      { beneficiary: currentOwner },
      { beneficiary: recipient },
    ]);
    getOrFetchBeneficiaries.mockResolvedValue({
      beneficiaries: [{ beneficiary: recipient, shares: 1000000000000000000n }],
      initializer: initializerAddress,
    });
    const context = {
      chain: { id: 8453 },
      db: {
        find: vi.fn().mockResolvedValue({
          quoteToken: `0x${"7".repeat(40)}`,
          isToken0: true,
          price: 2n * 10n ** 18n,
          beneficiaries: [{ beneficiary: oldRecipient, shares: "1000000000000000000" }],
        }),
        sql: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({ where })),
          })),
        },
        delete: deleteRow,
      },
      client: {
        readContract: vi.fn().mockImplementation(({ functionName }) => {
          if (functionName === "INITIALIZER") {
            return Promise.resolve(initializerAddress);
          }

          if (functionName === "airlock") {
            return Promise.resolve(airlockAddress);
          }

          if (functionName === "owner") {
            return Promise.resolve(currentOwner);
          }

          if (functionName === "getHookFees") {
            return Promise.resolve([0n, 0n, 0n, 0n, 19n, 23n, 0]);
          }

          return Promise.reject(new Error(`unexpected read: ${functionName}`));
        }),
      },
    };

    await refreshRehypeInitializerAirlockOwnerFees({
      poolId,
      hookAddress,
      timestamp: 1n,
      context: context as Parameters<typeof refreshRehypeInitializerAirlockOwnerFees>[0]["context"],
    });

    expect(deleteRow).toHaveBeenCalledTimes(1);
    expect(deleteRow).toHaveBeenCalledWith(expect.anything(), {
      poolId,
      chainId: 8453,
      beneficiary: staleOwner,
    });
  });
});
