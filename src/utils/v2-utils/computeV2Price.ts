import { PriceService } from   "../../core/pricing";

export const computeV2Price = ({
  assetBalance,
  quoteBalance,
}: {
  assetBalance: bigint;
  quoteBalance: bigint;
}) => {
  return PriceService.computePriceFromReserves({
    assetBalance,
    quoteBalance,
  });
};
