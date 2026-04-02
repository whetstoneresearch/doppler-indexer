import { Context } from "ponder:registry";
import { positionLedger } from "ponder:schema";
import { and, eq } from "ponder";

export async function upsertPositionLedger({
  poolId,
  tickLower,
  tickUpper,
  liquidityDelta,
  context,
}: {
  poolId: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
  context: Context;
}): Promise<void> {
  const { db, chain } = context;
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;

  const existing = await db.find(positionLedger, {
    poolId: poolIdLower,
    tickLower,
    tickUpper,
    chainId: chain.id,
  });

  if (existing) {
    const newLiquidity = existing.liquidity + liquidityDelta;
    if (newLiquidity < 0n) {
      console.error(
        `positionLedger: negative aggregate liquidity for pool=${poolIdLower} range=[${tickLower},${tickUpper}] chain=${chain.id}: ${newLiquidity}. Possible missed event.`
      );
    }
    await db
      .update(positionLedger, {
        poolId: poolIdLower,
        tickLower,
        tickUpper,
        chainId: chain.id,
      })
      .set({ liquidity: newLiquidity });
  } else {
    if (liquidityDelta < 0n) {
      console.error(
        `positionLedger: inserting negative liquidity for pool=${poolIdLower} range=[${tickLower},${tickUpper}] chain=${chain.id}: ${liquidityDelta}. Possible missed event.`
      );
    }
    await db.insert(positionLedger).values({
      poolId: poolIdLower,
      tickLower,
      tickUpper,
      liquidity: liquidityDelta,
      chainId: chain.id,
    });
  }
}

export async function getPositionsForPool({
  poolId,
  context,
}: {
  poolId: `0x${string}`;
  context: Context;
}): Promise<Array<{ tickLower: number; tickUpper: number; liquidity: bigint }>> {
  const { db, chain } = context;
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;

  const rows = await db.sql
    .select({
      tickLower: positionLedger.tickLower,
      tickUpper: positionLedger.tickUpper,
      liquidity: positionLedger.liquidity,
    })
    .from(positionLedger)
    .where(
      and(
        eq(positionLedger.poolId, poolIdLower),
        eq(positionLedger.chainId, chain.id)
      )
    );

  // Filter out zero-liquidity entries. Log negative entries as data integrity issues.
  return rows.filter((row) => {
    if (row.liquidity < 0n) {
      console.error(
        `positionLedger: negative liquidity in pool=${poolIdLower} range=[${row.tickLower},${row.tickUpper}] chain=${chain.id}: ${row.liquidity}`
      );
    }
    return row.liquidity !== 0n;
  });
}
