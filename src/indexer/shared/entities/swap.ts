import { Context } from "ponder:registry";
import { swap } from "ponder.schema";
import { Address } from "viem";

export const insertSwapIfNotExists = async ({
    txHash,
    timestamp,
    context,
    pool,
    asset,
    type,
    user,
    amountIn,
    amountOut,
    swapValueUsd,
}: {
    txHash: Address;
    timestamp: bigint;
    context: Context;
    pool: Address;
    asset: Address;
    chainId: number;
    type: string;
    user: Address;
    amountIn: bigint;
    amountOut: bigint;
    swapValueUsd: bigint;
}): Promise<void> => {
    const { db, chain } = context;

    const lowerTxHash = txHash.toLowerCase() as `0x${string}`;
    const lowerPool = pool.toLowerCase() as `0x${string}`;
    const lowerAsset = asset.toLowerCase() as `0x${string}`;
    const lowerUser = user.toLowerCase() as `0x${string}`;

    // Dedup on the (txHash, chainId) primary key in a single write. Replaces the
    // previous find-then-insert, so every swap costs one DB round-trip instead
    // of two. Callers discard the return, so we no longer return the row.
    await db.insert(swap).values({
        txHash: lowerTxHash,
        timestamp,
        pool: lowerPool,
        asset: lowerAsset,
        chainId: chain.id,
        type,
        user: lowerUser,
        amountIn,
        amountOut,
        swapValueUsd,
    }).onConflictDoNothing();
};
