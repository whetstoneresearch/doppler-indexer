import { MarketDataService } from "../core/market";

export const computeDollarLiquidity = ({
  assetBalance,
  quoteBalance,
  price,
  ethPrice,
}: {
  assetBalance: bigint;
  quoteBalance: bigint;
  price: bigint;
  ethPrice: bigint;
}) => {
  return MarketDataService.calculateLiquidity({
    assetBalance,
    quoteBalance,
    price,
    ethPriceUSD: ethPrice,
    isQuoteETH: true,
  });
};
