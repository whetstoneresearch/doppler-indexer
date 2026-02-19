import { Context } from "ponder:registry";
import { cumulatedFees } from "ponder:schema";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { MarketDataService } from "@app/core";
import { QuoteInfo } from "@app/utils/getQuoteInfo";
import { getOrFetchBeneficiaries } from "./beneficiariesCache";

interface UpdateCumulatedFeesParams {
  poolId: `0x${string}`;
  chainId: number;
  isToken0: boolean;
  price: bigint;
  quoteInfo: QuoteInfo;
  context: Context;
}

export async function updateCumulatedFees({
  poolId,
  chainId,
  isToken0,
  price,
  quoteInfo,
  context,
}: UpdateCumulatedFeesParams): Promise<void> {
  const cached = await getOrFetchBeneficiaries(chainId, poolId, context);
  if (!cached || cached.beneficiaries.length === 0) {
    return;
  }

  const { beneficiaries, initializer } = cached;
  const { client, db } = context;

  // Fetch cumulated fees from the initializer contract via multicall
  const [fees0Result, fees1Result] = await client.multicall({
    contracts: [
      {
        abi: UniswapV4MulticurveInitializerABI,
        address: initializer,
        functionName: "getCumulatedFees0",
        args: [poolId],
      },
      {
        abi: UniswapV4MulticurveInitializerABI,
        address: initializer,
        functionName: "getCumulatedFees1",
        args: [poolId],
      },
    ],
  });

  if (fees0Result.status !== "success" || fees1Result.status !== "success") {
    return;
  }

  const cumulatedFees0 = fees0Result.result;
  const cumulatedFees1 = fees1Result.result;

  if (cumulatedFees0 === 0n && cumulatedFees1 === 0n) {
    return;
  }

  const totalShares = beneficiaries.reduce((sum, b) => sum + b.shares, 0n);
  if (totalShares === 0n) {
    return;
  }

  const upsertPromises = beneficiaries.map((b) => {
    const token0Fees = (cumulatedFees0 * b.shares) / totalShares;
    const token1Fees = (cumulatedFees1 * b.shares) / totalShares;

    // Calculate USD value of fees
    // Determine which fees are quote (directly convertible) and which are base (multiply by price first)
    let quoteFees: bigint;
    let baseFees: bigint;
    if (isToken0) {
      // token0 = base, token1 = quote
      baseFees = token0Fees;
      quoteFees = token1Fees;
    } else {
      // token0 = quote, token1 = base
      quoteFees = token0Fees;
      baseFees = token1Fees;
    }

    // Convert base fees to quote equivalent: baseFees * price / WAD
    const WAD = 10n ** 18n;
    const baseFeeInQuote = (baseFees * price) / WAD;
    const totalQuoteEquivalent = quoteFees + baseFeeInQuote;

    const totalFeesUsd = MarketDataService.calculateVolume({
      amountIn: totalQuoteEquivalent,
      amountOut: 0n,
      quotePriceUSD: quoteInfo.quotePrice!,
      isQuoteUSD: false,
      quoteDecimals: quoteInfo.quoteDecimals,
      decimals: quoteInfo.quotePriceDecimals,
    });

    return db
      .insert(cumulatedFees)
      .values({
        poolId,
        chainId,
        beneficiary: b.beneficiary,
        token0Fees,
        token1Fees,
        totalFeesUsd,
      })
      .onConflictDoUpdate({
        token0Fees,
        token1Fees,
        totalFeesUsd,
      });
  });

  await Promise.all(upsertPromises);
}
