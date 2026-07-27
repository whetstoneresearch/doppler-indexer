import { describe, expect, it } from "vitest";
import { pool, token } from "ponder:schema";
import { batchUpdateHolderCounts } from "./user-optimized";

const CHAIN_ID = 8453;
const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";

interface UpdateCall {
  table: unknown;
  key: Record<string, unknown>;
  values: Record<string, unknown>;
}

const makeContext = ({ poolRow }: { poolRow: { holderCount: number } | null }) => {
  const updates: UpdateCall[] = [];
  const finds: { table: unknown; key: Record<string, unknown> }[] = [];

  const context = {
    chain: { id: CHAIN_ID },
    db: {
      find: async (table: unknown, key: Record<string, unknown>) => {
        finds.push({ table, key });
        return table === pool ? poolRow : null;
      },
      update: (table: unknown, key: Record<string, unknown>) => ({
        set: async (values: Record<string, unknown>) => {
          updates.push({ table, key, values });
        },
      }),
    },
  };

  return { context, updates, finds };
};

const updateFor = (updates: UpdateCall[], table: unknown) =>
  updates.filter((u) => u.table === table);

describe("batchUpdateHolderCounts", () => {
  it("writes the same token-derived count to token and pool", async () => {
    const { context, updates } = makeContext({ poolRow: { holderCount: 0 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: POOL,
      holderCountDelta: 1,
      currentTokenHolderCount: 12,
      context: context as any,
    });

    expect(updateFor(updates, token)).toHaveLength(1);
    expect(updateFor(updates, token)[0]!.values).toEqual({ holderCount: 13 });
    expect(updateFor(updates, pool)).toHaveLength(1);
    expect(updateFor(updates, pool)[0]!.values).toEqual({ holderCount: 13 });
  });

  it("heals a pool row that was created after the token already had holders", async () => {
    // The regression: pool rows for Zora creator coins are inserted at 0 while
    // the token already counts the mint holders. Deriving from the pool's own
    // value would write 1 here and stay permanently behind.
    const { context, updates } = makeContext({ poolRow: { holderCount: 0 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: POOL,
      holderCountDelta: 1,
      currentTokenHolderCount: 40,
      context: context as any,
    });

    expect(updateFor(updates, pool)[0]!.values).toEqual({ holderCount: 41 });
  });

  it("applies a negative delta to both rows", async () => {
    const { context, updates } = makeContext({ poolRow: { holderCount: 9 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: POOL,
      holderCountDelta: -1,
      currentTokenHolderCount: 9,
      context: context as any,
    });

    expect(updateFor(updates, token)[0]!.values).toEqual({ holderCount: 8 });
    expect(updateFor(updates, pool)[0]!.values).toEqual({ holderCount: 8 });
  });

  it("never writes a negative count", async () => {
    const { context, updates } = makeContext({ poolRow: { holderCount: 0 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: POOL,
      holderCountDelta: -1,
      currentTokenHolderCount: 0,
      context: context as any,
    });

    expect(updateFor(updates, token)[0]!.values).toEqual({ holderCount: 0 });
    expect(updateFor(updates, pool)[0]!.values).toEqual({ holderCount: 0 });
  });

  it("writes nothing when the delta is zero", async () => {
    const { context, updates, finds } = makeContext({ poolRow: { holderCount: 3 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: POOL,
      holderCountDelta: 0,
      currentTokenHolderCount: 3,
      context: context as any,
    });

    expect(updates).toHaveLength(0);
    expect(finds).toHaveLength(0);
  });

  it("still updates the token when the coin has no pool row yet", async () => {
    const { context, updates } = makeContext({ poolRow: null });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: POOL,
      holderCountDelta: 1,
      currentTokenHolderCount: 4,
      context: context as any,
    });

    expect(updateFor(updates, token)[0]!.values).toEqual({ holderCount: 5 });
    expect(updateFor(updates, pool)).toHaveLength(0);
  });

  it("skips the pool lookup when the token has no pool linked", async () => {
    const { context, updates, finds } = makeContext({ poolRow: { holderCount: 0 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: null,
      holderCountDelta: 1,
      currentTokenHolderCount: 4,
      context: context as any,
    });

    expect(updateFor(updates, token)[0]!.values).toEqual({ holderCount: 5 });
    expect(finds).toHaveLength(0);
  });

  it("skips the pool lookup for a zero-address pool", async () => {
    const { context, finds } = makeContext({ poolRow: { holderCount: 0 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN,
      poolAddress: ZERO,
      holderCountDelta: 1,
      currentTokenHolderCount: 4,
      context: context as any,
    });

    expect(finds).toHaveLength(0);
  });

  it("lowercases addresses on every write", async () => {
    const { context, updates, finds } = makeContext({ poolRow: { holderCount: 0 } });

    await batchUpdateHolderCounts({
      tokenAddress: TOKEN.toUpperCase() as `0x${string}`,
      poolAddress: POOL.toUpperCase() as `0x${string}`,
      holderCountDelta: 1,
      currentTokenHolderCount: 1,
      context: context as any,
    });

    expect(updateFor(updates, token)[0]!.key).toEqual({
      address: TOKEN,
      chainId: CHAIN_ID,
    });
    expect(finds[0]!.key).toEqual({ address: POOL, chainId: CHAIN_ID });
    expect(updateFor(updates, pool)[0]!.key).toEqual({
      address: POOL,
      chainId: CHAIN_ID,
    });
  });
});
