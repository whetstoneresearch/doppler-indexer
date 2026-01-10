import { DERC20ABI } from "@app/abis";
import { chainConfigs } from "@app/config";
import { getMulticallOptions } from "@app/core/utils/multicall";
import { token } from "ponder.schema";
import { Context } from "ponder:registry";
import { Address, zeroAddress } from "viem";

type TokenEntity = typeof token.$inferSelect;
const tokenCache = new Map<string, TokenEntity>();

function getTokenCacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function getCachedToken(chainId: number, address: string): TokenEntity | null {
  return tokenCache.get(getTokenCacheKey(chainId, address)) ?? null;
}

function setCachedToken(chainId: number, address: string, tokenEntity: TokenEntity): void {
  tokenCache.set(getTokenCacheKey(chainId, address), tokenEntity);
}

function updateCachedToken(chainId: number, address: string, updates: Partial<TokenEntity>): void {
  const key = getTokenCacheKey(chainId, address);
  const existing = tokenCache.get(key);
  if (existing) {
    tokenCache.set(key, { ...existing, ...updates });
  }
}

export const appendTokenPool = async ({
  tokenAddress,
  isDerc20,
  isCreatorCoin,
  isContentCoin,
  poolAddress,
  context,
  creatorCoinPid = null,
  creatorAddress = zeroAddress,
}: {
  tokenAddress: Address;
  isDerc20: boolean;
  isCreatorCoin: boolean;
  isContentCoin: boolean;
  poolAddress: Address;
  context: Context;
  creatorCoinPid?: Address | null;
  creatorAddress?: Address;
}) => {
  const { db, chain } = context;

  let existingToken = getCachedToken(chain.id, tokenAddress);
  if (!existingToken) {
    existingToken = await db.find(token, {
      address: tokenAddress,
      chainId: chain.id,
    });
  }

  if (!existingToken) {
    await insertTokenIfNotExists({
      tokenAddress,
      creatorAddress,
      timestamp: BigInt(context.chain.id),
      context,
      poolAddress,
    });
  }

  const updatedToken = await db
    .update(token, {
      address: tokenAddress,
      chainId: chain.id,
    })
    .set({
      isDerc20,
      isCreatorCoin,
      isContentCoin,
      pool: poolAddress,
      creatorCoinPid,
    });

  updateCachedToken(chain.id, tokenAddress, {
    isDerc20,
    isCreatorCoin,
    isContentCoin,
    pool: poolAddress,
    creatorCoinPid,
  });

  return updatedToken;
};

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
  creatorCoin?: boolean;
  contentCoin?: boolean;
  poolAddress?: Address;
}): Promise<typeof token.$inferSelect> => {
  const { db, chain } = context;

  const multicallOptions = getMulticallOptions(chain);
  const address = tokenAddress.toLowerCase() as `0x${string}`;

  let existingToken = getCachedToken(chain.id, address);
  if (!existingToken) {
    existingToken = await db.find(token, {
      address,
      chainId: chain.id,
    });
  }

  if (existingToken?.isDerc20 && !existingToken?.pool && poolAddress) {
    await db.update(token, { address, chainId: chain.id }).set({
      pool: poolAddress,
    });
    updateCachedToken(chain.id, address, { pool: poolAddress });
  } else if (existingToken) {
    setCachedToken(chain.id, address, existingToken);
    return existingToken;
  }

  const zoraAddress = chainConfigs[chain.name].addresses.zora.zoraToken;

  // ignore pool field for native tokens
  if (address == zeroAddress) {
    const newToken = await db.insert(token).values({
      address: address.toLowerCase() as `0x${string}`,
      chainId: chain.id,
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
      creatorAddress: zeroAddress,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      totalSupply: 0n,
      isDerc20: false,
    });
    setCachedToken(chain.id, address, newToken);
    return newToken;
  } else if (address == zoraAddress.toLowerCase()) {
    const newToken = await db.insert(token).values({
      address: address.toLowerCase() as `0x${string}`,
      chainId: chain.id,
      name: "Zora",
      symbol: "ZORA",
      decimals: 18,
      creatorAddress: zeroAddress,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      totalSupply: 10000000000000000000000000000n,
      isDerc20: false,
    });
    setCachedToken(chain.id, address, newToken);
    return newToken;
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
      ...multicallOptions,
    });

    if (process.env.NODE_ENV !== "local") {
      void fetch(
        `${process.env.METADATA_UPDATER_ENDPOINT}?tokenAddress=${address}&chainId=${chain.id}`
      );
    }

    const tokenURI = tokenURIResult?.result;
    let tokenUriData;
    let image: string | undefined;
    const shouldFetchImage = process.env.ENABLE_IMAGE_FETCHING === "true";
    if (tokenURI?.startsWith("ipfs://") && shouldFetchImage) {
      try {
        if (!tokenURI.startsWith("ipfs://")) {
          console.error(`Invalid tokenURI for token ${address}: ${tokenURI}`);
        }
        const cid = tokenURI.replace("ipfs://", "");
        const url = `https://${process.env.PINATA_GATEWAY_URL}/ipfs/${cid}?pinataGatewayToken=${process.env.PINATA_GATEWAY_KEY}`;
        const response = await fetch(url);
        tokenUriData = await response.json();

        if (
          tokenUriData &&
          typeof tokenUriData === "object" &&
          "image" in tokenUriData &&
          typeof tokenUriData.image === "string"
        ) {
          if (tokenUriData.image.startsWith("ipfs://")) {
            image = tokenUriData.image;
          }
        } else if (
          tokenUriData &&
          typeof tokenUriData === "object" &&
          "image_hash" in tokenUriData &&
          typeof tokenUriData.image_hash === "string"
        ) {
          if (tokenUriData.image_hash.startsWith("ipfs://")) {
            image = tokenUriData.image_hash;
          }
        }
      } catch (error) {
        console.error(
          `Failed to fetch IPFS metadata for token ${address}:`,
          error
        );
      }
    }
    const newToken = await context.db
      .insert(token)
      .values({
        address: address.toLowerCase() as `0x${string}`,
        chainId: chain.id,
        name: nameResult?.result ?? `Unknown Token (${address})`,
        symbol: symbolResult?.result ?? "???",
        decimals: decimalsResult?.result ?? 18,
        totalSupply: totalSupplyResult?.result ?? 0n,
        creatorAddress,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        isDerc20,
        pool: poolAddress,
        derc20Data: isDerc20 ? address : undefined,
        tokenUri: tokenURIResult?.result ?? "",
        image: image ?? "",
      })
      .onConflictDoUpdate((row) => ({
        pool: row.pool,
      }));

    setCachedToken(chain.id, address, newToken);
    return newToken;
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
  const { db, chain } = context;

  const address = tokenAddress.toLowerCase() as `0x${string}`;

  const updatedToken = await db
    .update(token, {
      address,
      chainId: chain.id,
    })
    .set(update);

  // Update cache with new values
  updateCachedToken(chain.id, address, update as Partial<TokenEntity>);

  return updatedToken;
};
