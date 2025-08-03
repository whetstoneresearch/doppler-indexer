import { DERC20ABI } from "@app/abis";
import { token } from "ponder.schema";
import { Context } from "ponder:registry";
import { Address, zeroAddress } from "viem";

export const insertTokenIfNotExists = async ({
  tokenAddress,
  creatorAddress,
  timestamp,
  context,
  isDerc20 = false,
  poolAddress,
}: {
  tokenAddress: Address;
  creatorAddress: Address;
  timestamp: bigint;
  context: Context;
  isDerc20?: boolean;
  poolAddress?: Address;
}): Promise<typeof token.$inferSelect> => {
  const { db, chain } = context;

  let multiCallAddress = {};
  if (chain.name == "ink") {
    multiCallAddress = {
      multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11",
    };
  }
  const address = tokenAddress.toLowerCase() as `0x${string}`;

  const existingToken = await db.find(token, {
    address,
  });

  if (existingToken?.isDerc20 && !existingToken?.pool && poolAddress) {
    await db.update(token, { address }).set({
      pool: poolAddress,
    });
  } else if (existingToken) {
    return existingToken;
  }

  const chainId = BigInt(chain.id);

  // ignore pool field for native tokens
  if (address == zeroAddress) {
    return await db.insert(token).values({
      address: address.toLowerCase() as `0x${string}`,
      chainId,
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
      creatorAddress: zeroAddress,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      totalSupply: 0n,
      isDerc20: false,
    });
  } else {
    const [
      nameResult,
      symbolResult,
      decimalsResult,
      totalSupplyResult,
      tokenURIResult,
    ] = await context.client.multicall({
      contracts: [
        {
          abi: DERC20ABI,
          address,
          functionName: "name",
        },
        {
          abi: DERC20ABI,
          address,
          functionName: "symbol",
        },
        {
          abi: DERC20ABI,
          address,
          functionName: "decimals",
        },
        {
          abi: DERC20ABI,
          address,
          functionName: "totalSupply",
        },
        {
          abi: DERC20ABI,
          address,
          functionName: "tokenURI",
        },
      ],
      ...multiCallAddress,
    });

    return await context.db
      .insert(token)
      .values({
        address: address.toLowerCase() as `0x${string}`,
        chainId,
        name: nameResult?.result ?? `Unknown Token (${address})`,
        symbol: symbolResult?.result ?? "???",
        decimals: decimalsResult.result ?? 18,
        totalSupply: totalSupplyResult.result ?? 0n,
        creatorAddress,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        isDerc20,
        tokenUri: tokenURIResult.result ?? undefined,
        pool: isDerc20 ? poolAddress : undefined,
        derc20Data: isDerc20 ? address : undefined,
      })
      .onConflictDoUpdate((row) => ({
        pool: row.pool,
      }));
  }
};

export const updateToken = async ({
  tokenAddress,
  context,
  update,
}: {
  tokenAddress: Address;
  context: Context;
  update: Partial<typeof token.$inferInsert>;
}): Promise<typeof token.$inferSelect> => {
  const { db } = context;

  const address = tokenAddress.toLowerCase() as `0x${string}`;

  return await db
    .update(token, {
      address,
    })
    .set(update);
};
