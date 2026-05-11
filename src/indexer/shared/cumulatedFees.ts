import { Context } from "ponder:registry";
import { cumulatedFees } from "ponder:schema";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { QuoteInfo } from "@app/utils/getQuoteInfo";
import { getOrFetchBeneficiaries } from "./beneficiariesCache";
import { getMulticallOptions } from "@app/core/utils/multicall";
import { calculateClaimableFee } from "./feeRecipientMath";
import { Address } from "viem";
import { calculateTotalFeesUsd } from "./feeValue";
export { calculateTotalFeesUsd } from "./feeValue";

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
  const poolIdLower = poolId.toLowerCase() as `0x${string}`;
  const cached = await getOrFetchBeneficiaries(chainId, poolIdLower, context);
  if (!cached || cached.beneficiaries.length === 0) {
    return;
  }

  const { beneficiaries, initializer } = cached;
  const { client, chain, db } = context;

  // Fetch cumulated fees from the initializer contract via multicall
  const multicallOptions = getMulticallOptions(chain);
  const [fees0Result, fees1Result] = await client.multicall({
    contracts: [
      {
        abi: UniswapV4MulticurveInitializerABI,
        address: initializer,
        functionName: "getCumulatedFees0",
        args: [poolIdLower],
      },
      {
        abi: UniswapV4MulticurveInitializerABI,
        address: initializer,
        functionName: "getCumulatedFees1",
        args: [poolIdLower],
      },
    ],
    ...multicallOptions,
  });

  if (fees0Result.status !== "success" || fees1Result.status !== "success") {
    return;
  }

  const cumulatedFees0 = fees0Result.result;
  const cumulatedFees1 = fees1Result.result;

  const upsertPromises = beneficiaries.map(async (b) => {
    const beneficiary = b.beneficiary.toLowerCase() as `0x${string}`;
    const [lastFees0Result, lastFees1Result] = await client.multicall({
      contracts: [
        {
          abi: UniswapV4MulticurveInitializerABI,
          address: initializer,
          functionName: "getLastCumulatedFees0",
          args: [poolIdLower, beneficiary],
        },
        {
          abi: UniswapV4MulticurveInitializerABI,
          address: initializer,
          functionName: "getLastCumulatedFees1",
          args: [poolIdLower, beneficiary],
        },
      ],
      ...multicallOptions,
    });

    if (lastFees0Result.status !== "success" || lastFees1Result.status !== "success") {
      return;
    }

    const lastFees0 = lastFees0Result.result;
    const lastFees1 = lastFees1Result.result;
    const token0Fees = calculateClaimableFee({
      cumulatedFees: cumulatedFees0,
      lastCumulatedFees: lastFees0,
      shares: b.shares,
    });
    const token1Fees = calculateClaimableFee({
      cumulatedFees: cumulatedFees1,
      lastCumulatedFees: lastFees1,
      shares: b.shares,
    });

    const totalFeesUsd = calculateTotalFeesUsd({
      token0Fees,
      token1Fees,
      isToken0,
      price,
      quoteInfo,
    });

    return db
      .insert(cumulatedFees)
      .values({
        poolId: poolIdLower,
        chainId,
        beneficiary,
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

interface UpsertAirlockOwnerFeesParams {
  poolId: `0x${string}`;
  chainId: number;
  airlockOwner: Address;
  token0Fees: bigint;
  token1Fees: bigint;
  totalFeesUsd: bigint;
  context: Context;
}

export async function upsertAirlockOwnerFees({
  poolId,
  chainId,
  airlockOwner,
  token0Fees,
  token1Fees,
  totalFeesUsd,
  context,
}: UpsertAirlockOwnerFeesParams): Promise<void> {
  await context.db
    .insert(cumulatedFees)
    .values({
      poolId: poolId.toLowerCase() as `0x${string}`,
      chainId,
      beneficiary: airlockOwner.toLowerCase() as `0x${string}`,
      token0Fees,
      token1Fees,
      totalFeesUsd,
    })
    .onConflictDoUpdate({
      token0Fees,
      token1Fees,
      totalFeesUsd,
    });
}

interface HandleCollectParams {
  poolId: `0x${string}`;
  chainId: number;
  beneficiary: `0x${string}`;
  fees0: bigint;
  fees1: bigint;
  isToken0: boolean;
  price: bigint;
  quoteInfo: QuoteInfo;
  context: Context;
}

export async function handleCollect({
  poolId,
  chainId,
  isToken0,
  price,
  quoteInfo,
  context,
}: HandleCollectParams): Promise<void> {
  await updateCumulatedFees({
    poolId,
    chainId,
    isToken0,
    price,
    quoteInfo,
    context,
  });
}
