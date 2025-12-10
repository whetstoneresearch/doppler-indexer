import { PriceService } from "@app/core/pricing";
import { TickMath } from "@uniswap/v3-sdk";

export const computeV4Price = ({
  isToken0,
  currentTick,
  baseTokenDecimals,
  quoteTokenDecimals
}: {
  isToken0: boolean;
  currentTick: number;
  baseTokenDecimals: number;
  quoteTokenDecimals: number;
}) => {
  const sqrtPriceX96 = BigInt(
    TickMath.getSqrtRatioAtTick(currentTick).toString()
  );

  return PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals: baseTokenDecimals,
    quoteDecimals: quoteTokenDecimals
  });
};
