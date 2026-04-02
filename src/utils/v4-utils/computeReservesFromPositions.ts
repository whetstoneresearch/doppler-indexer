import {
  getAmount0Delta,
  getAmount1Delta,
} from "../v3-utils/computeGraduationThreshold";

interface PositionEntry {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

/**
 * Pure computation of reserves from an array of positions and a current tick.
 * No RPC or DB access. Same math as getReservesV4/getReservesMulticurve but
 * decoupled from the data source so positions can come from a DB ledger,
 * contract reads, or anywhere else.
 */
export function computeReservesFromPositions(
  positions: PositionEntry[],
  tick: number
): { token0Reserve: bigint; token1Reserve: bigint } {
  return positions
    .map((position) => {
      const { tickLower, tickUpper, liquidity } = position;

      let amount0: bigint;
      let amount1: bigint;

      if (tick < tickLower) {
        amount0 = getAmount0Delta({
          tickLower,
          tickUpper,
          liquidity,
          roundUp: false,
        });
        amount1 = 0n;
      } else if (tick < tickUpper) {
        amount0 = getAmount0Delta({
          tickLower: tick,
          tickUpper,
          liquidity,
          roundUp: false,
        });
        amount1 = getAmount1Delta({
          tickLower,
          tickUpper: tick,
          liquidity,
          roundUp: false,
        });
      } else {
        amount0 = 0n;
        amount1 = getAmount1Delta({
          tickLower,
          tickUpper,
          liquidity,
          roundUp: false,
        });
      }

      return { token0Reserve: amount0, token1Reserve: amount1 };
    })
    .reduce(
      (acc, curr) => ({
        token0Reserve: acc.token0Reserve + curr.token0Reserve,
        token1Reserve: acc.token1Reserve + curr.token1Reserve,
      }),
      { token0Reserve: 0n, token1Reserve: 0n }
    );
}
