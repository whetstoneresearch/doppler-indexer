import type { QuoteInfo } from "@app/utils/getQuoteInfo";

export function calculateTotalFeesUsd({
  token0Fees,
  token1Fees,
  isToken0,
  price,
  quoteInfo,
}: {
  token0Fees: bigint;
  token1Fees: bigint;
  isToken0: boolean;
  price: bigint;
  quoteInfo: QuoteInfo;
}): bigint {
  const quoteFees = isToken0 ? token1Fees : token0Fees;
  const baseFees = isToken0 ? token0Fees : token1Fees;
  const WAD = 10n ** 18n;
  const baseFeeInQuote = (baseFees * price) / WAD;
  const totalQuoteEquivalent = quoteFees + baseFeeInQuote;

  if (totalQuoteEquivalent === 0n) {
    return 0n;
  }

  const scaleFactor = BigInt(10 ** (18 - quoteInfo.quotePriceDecimals));
  return (totalQuoteEquivalent * quoteInfo.quotePrice! * scaleFactor) / BigInt(10 ** quoteInfo.quoteDecimals);
}
