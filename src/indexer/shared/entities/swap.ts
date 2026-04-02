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
}): Promise<typeof swap.$inferSelect> => {
    const { db, chain } = context;

    const lowerTxHash = txHash.toLowerCase() as `0x${string}`;
    const lowerPool = pool.toLowerCase() as `0x${string}`;
    const lowerAsset = asset.toLowerCase() as `0x${string}`;
    const lowerUser = user.toLowerCase() as `0x${string}`;

    const existingSwap = await db.find(swap, {
        txHash: lowerTxHash,
        chainId: chain.id,
    });

    if (existingSwap) {
        return existingSwap;
    }

    return await db.insert(swap).values({
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
    });
};
