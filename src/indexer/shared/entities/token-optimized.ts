import { DERC20ABI } from "@app/abis";
import { chainConfigs } from "@app/config";
import { getMulticallOptions } from "@app/core/utils";
import { Context } from "ponder:registry";
import { token } from "ponder:schema";
import { Address, zeroAddress } from "viem";

/**
 * Optimized version that combines insert and update in a single operation
 */
export const upsertTokenWithPool = async ({
  tokenAddress,
  isDerc20,
  isCreatorCoin,
  isContentCoin,
  poolAddress,
  context,
  creatorCoinPid,
  creatorAddress,
  timestamp,
}: {
  tokenAddress: Address;
  isDerc20: boolean;
  isCreatorCoin: boolean;
  isContentCoin: boolean;
  context: Context;
  creatorCoinPid: Address | null;
  creatorAddress: Address;
  timestamp: bigint;
  poolAddress: `0x${string}` | null;
}): Promise<typeof token.$inferSelect> => {
  const { db, chain, client } = context;
  const address = tokenAddress.toLowerCase() as `0x${string}`;

  const wethAddress = chainConfigs[chain.name]?.addresses?.shared?.weth;
  const zoraAddress = chainConfigs[chain.name]?.addresses?.zora?.zoraToken;

  let tokenData: Partial<typeof token.$inferInsert> = {
    address,
    chainId: chain.id,
    isDerc20,
    isCreatorCoin,
    isContentCoin,
    pool: poolAddress?.toLowerCase() as `0x${string}` ?? null,
    creatorCoinPid: creatorCoinPid ? creatorCoinPid.toLowerCase() as `0x${string}` : null,
    creatorAddress: creatorAddress.toLowerCase() as `0x${string}`,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };

  if (
    address === zeroAddress ||
    (wethAddress && address === wethAddress.toLowerCase())
  ) {
    tokenData = {
      ...tokenData,
      name: address === zeroAddress ? "Ethereum" : "Wrapped Ether",
      symbol: address === zeroAddress ? "ETH" : "WETH",
      decimals: 18,
      totalSupply: 0n,
    };
  } else if (zoraAddress && address === zoraAddress.toLowerCase()) {
    tokenData = {
      ...tokenData,
      name: "Zora",
      symbol: "ZORA",
      decimals: 18,
      totalSupply: 1_000_000_000n,
    };
  } else {
    // Fetch token metadata for regular tokens
    const multicallOptions = getMulticallOptions(chain);
    const [
      nameResult,
      symbolResult,
      decimalsResult,
      totalSupplyResult,
      tokenURIResult,
    ] = await client.multicall({
      contracts: [
        { abi: DERC20ABI, address, functionName: "name" },
        { abi: DERC20ABI, address, functionName: "symbol" },
        { abi: DERC20ABI, address, functionName: "decimals" },
        { abi: DERC20ABI, address, functionName: "totalSupply" },
        { abi: DERC20ABI, address, functionName: "tokenURI" },
      ],
      ...multicallOptions,
    });

    tokenData = {
      ...tokenData,
      name: nameResult?.result ?? `Unknown Token (${address})`,
      symbol: symbolResult?.result ?? "???",
      decimals: decimalsResult?.result ?? 18,
      totalSupply: totalSupplyResult?.result ?? 0n,
      derc20Data: isDerc20 ? address : undefined,
      tokenUri: tokenURIResult?.result ?? "",
    };

    if (isDerc20) {
      const [
        vestingStartResult,
        vestingDurationResult,
        vestedTotalAmountResult,
        isBalanceLimitActiveResult,
        balanceLimitEndResult,
        maxBalanceLimitResult,
        balanceLimitControllerResult,
      ] = await client.multicall({
        contracts: [
          { abi: DERC20ABI, address, functionName: "vestingStart" },
          { abi: DERC20ABI, address, functionName: "vestingDuration" },
          { abi: DERC20ABI, address, functionName: "vestedTotalAmount" },
          { abi: DERC20ABI, address, functionName: "isBalanceLimitActive" },
          { abi: DERC20ABI, address, functionName: "balanceLimitEnd" },
          { abi: DERC20ABI, address, functionName: "maxBalanceLimit" },
          { abi: DERC20ABI, address, functionName: "controller" },
        ],
        ...multicallOptions,
      });

      tokenData = {
        ...tokenData,
        vestingStart: vestingStartResult.status === "success" ? vestingStartResult.result : undefined,
        vestingDuration: vestingDurationResult.status === "success" ? vestingDurationResult.result : undefined,
        vestedTotalAmount: vestedTotalAmountResult.status === "success" ? vestedTotalAmountResult.result : undefined,
        isBalanceLimitActive: isBalanceLimitActiveResult.status === "success" ? isBalanceLimitActiveResult.result : undefined,
        balanceLimitEnd: balanceLimitEndResult.status === "success" ? BigInt(balanceLimitEndResult.result) : undefined,
        maxBalanceLimit: maxBalanceLimitResult.status === "success" ? maxBalanceLimitResult.result : undefined,
        balanceLimitController: balanceLimitControllerResult.status === "success"
          ? balanceLimitControllerResult.result.toLowerCase() as `0x${string}`
          : undefined,
      };
    }
  }

  if (poolAddress) {
    return await db
      .insert(token)
      .values(tokenData as typeof token.$inferInsert)
      .onConflictDoUpdate((existing) => ({
        pool: existing.pool === null ? poolAddress?.toLowerCase() as `0x${string}` ?? null : existing.pool,
        isDerc20,
        isCreatorCoin,
        isContentCoin,
        creatorCoinPid: creatorCoinPid ? creatorCoinPid.toLowerCase() as `0x${string}` : null,
        lastSeenAt: timestamp,
        // Keep existing totalSupply if it's already set
        totalSupply: existing.totalSupply || tokenData.totalSupply,
        isBalanceLimitActive: tokenData.isBalanceLimitActive,
        balanceLimitEnd: tokenData.balanceLimitEnd,
        maxBalanceLimit: tokenData.maxBalanceLimit,
        balanceLimitController: tokenData.balanceLimitController,
      }));
  } else {
    return await db
      .insert(token)
      .values(tokenData as typeof token.$inferInsert)
      .onConflictDoUpdate(() => ({
        lastSeenAt: timestamp,
      }));
  }
};
