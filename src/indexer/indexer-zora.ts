import { onIndexerEvent } from "./entrypoint";
import { updateToken } from "./shared/entities/token";
import { upsertTokenWithPool } from "./shared/entities/token-optimized";
import {
  updatePool,
} from "./shared/entities/pool";
import { fetchEthPrice, fetchZoraPrice } from "./shared/oracle";
import { batchUpsertUsersAndAssets, batchUpdateHolderCounts } from "./shared/entities/user-optimized";
import { handleOptimizedSwap } from "./shared/swap-optimizer";
import { ZoraV4HookABI } from "@app/abis";
import { zeroAddress } from "viem";
import { PriceService } from "@app/core";
import { chainConfigs } from "@app/config";
import { token, pool } from "ponder:schema";
import { insertZoraPoolV4Optimized } from "./shared/entities/zora/pool";
import { getQuoteInfo, QuoteToken } from "@app/utils/getQuoteInfo";
import { isPrecompileAddress } from "@app/utils/validation";
import { computeReservesFromPositions } from "@app/utils/v4-utils";
import { TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";

// Persistent cache for ZoraV4 hook getPoolCoin reads. Positions only change when
// PoolManager:ModifyLiquidity fires (the hook has afterAdd/RemoveLiquidity perms) or
// when ZoraCreatorCoinV4:LiquidityMigrated moves liquidity away. Those handlers call
// invalidatePoolCoinCache; everything else can safely reuse the cached read across blocks.
const POOL_COIN_CACHE_MAX_SIZE = 10_000;
const poolCoinByPool = new Map<string, Promise<unknown>>();

function poolCoinCacheKey(chainId: number, poolAddress: string): string {
  return `${chainId}:${poolAddress.toLowerCase()}`;
}

function cachedGetPoolCoin<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = poolCoinByPool.get(key) as Promise<T> | undefined;
  if (existing) {
    // LRU touch: move to most-recently-used position.
    poolCoinByPool.delete(key);
    poolCoinByPool.set(key, existing);
    return existing;
  }
  if (poolCoinByPool.size >= POOL_COIN_CACHE_MAX_SIZE) {
    const oldest = poolCoinByPool.keys().next().value;
    if (oldest !== undefined) poolCoinByPool.delete(oldest);
  }
  const promise = loader();
  poolCoinByPool.set(key, promise);
  promise.catch(() => poolCoinByPool.delete(key));
  return promise;
}

export function invalidatePoolCoinCache(chainId: number, poolAddress: string): void {
  poolCoinByPool.delete(poolCoinCacheKey(chainId, poolAddress));
}

// ponder.on("ZoraFactory:CoinCreatedV4", async ({ event, context }) => {
//   const { db, chain } = context;
//   const { coin, currency, poolKey, poolKeyHash, caller } = event.args;
//   const timestamp = event.block.timestamp;

//   const poolAddress = poolKeyHash.toLowerCase() as `0x${string}`;
//   const coinAddress = coin.toLowerCase() as `0x${string}`;
//   const currencyAddress = currency.toLowerCase() as `0x${string}`;
//   const callerId = caller.toLowerCase() as `0x${string}`;

//   const [zoraPrice, ethPrice] = await Promise.all([
//     fetchZoraPrice(timestamp, context),
//     fetchEthPrice(timestamp, context),
//   ]);


//   const isQuoteZora = currency != zeroAddress && currency.toLowerCase() === chainConfigs[context.chain.name].addresses.zora.zoraToken.toLowerCase();
//   const isQuoteEth = currency === zeroAddress || currency.toLowerCase() === chainConfigs[context.chain.name].addresses.shared.weth.toLowerCase();

//   let isQuoteCreatorCoin = false;
//   let creatorCoinPid = null;
//   if (!isQuoteZora && !isQuoteEth) {
//       const creatorCoinEntity = await db.find(token, {
//         address: currencyAddress,
//         chainId: chain.id,
//       });

//       isQuoteCreatorCoin = creatorCoinEntity?.isCreatorCoin ?? false;
//       creatorCoinPid = isQuoteCreatorCoin ? creatorCoinEntity?.pool : null;
//   }

//   if (!isQuoteZora && !isQuoteEth && !isQuoteCreatorCoin && !creatorCoinPid) {
//     return;
//   }

//   let usdPrice;
//   if (isQuoteZora) {
//     usdPrice = zoraPrice;
//   } else if (isQuoteEth) {
//     usdPrice = ethPrice;
//   } else if (isQuoteCreatorCoin && creatorCoinPid) {
//     const creatorCoinPool = await db.find(pool, {
//       address: creatorCoinPid as `0x${string}`,
//       chainId: chain.id,
//     });

//     if (!creatorCoinPool) {
//       return;
//     }

//     const { sqrtPrice, isToken0: creatorCoinIsToken0 } = creatorCoinPool;

//     const creatorCoinPrice = PriceService.computePriceFromSqrtPriceX96({
//       sqrtPriceX96: sqrtPrice,
//       isToken0: creatorCoinIsToken0,
//       decimals: 18,
//     });

//     const contentCoinUsdPrice = creatorCoinPrice * zoraPrice / 10n ** 18n;

//     usdPrice = contentCoinUsdPrice;
//   }

//   if (!usdPrice) {
//     return;
//   }

//   // Optimized parallel operations with single upsert for tokens
//   const [assetTokenEntity] = await Promise.all([
//     upsertTokenWithPool({
//       tokenAddress: coinAddress,
//       isDerc20: false,
//       isCreatorCoin: false,
//       isContentCoin: true,
//       poolAddress,
//       context,
//       creatorCoinPid: creatorCoinPid ?? null,
//       creatorAddress: callerId,
//       timestamp,
//     }),
//     upsertTokenWithPool({
//       tokenAddress: currencyAddress,
//       isDerc20: false,
//       isCreatorCoin: false,
//       isContentCoin: false,
//       poolAddress: null,
//       context,
//       creatorCoinPid: creatorCoinPid ?? null,
//       creatorAddress: callerId,
//       timestamp,
//     }),
//   ]);

//   const { totalSupply } = assetTokenEntity;

//   await insertZoraPoolV4Optimized({
//     poolAddress,
//     context,
//     timestamp,
//     ethPrice: usdPrice,
//     poolKey,
//     baseToken: coinAddress,
//     quoteToken: currencyAddress,
//     isQuoteZora,
//     isCreatorCoin: false,
//     isContentCoin: true,
//     totalSupply
//   });
// });

onIndexerEvent("ZoraFactory:CreatorCoinCreated", async ({ event, context }) => {
  const { coin, currency, poolKey, poolKeyHash, caller } = event.args;

  if (isPrecompileAddress(coin) || isPrecompileAddress(currency)) {
    return;
  }

  const timestamp = event.block.timestamp;

  const poolAddress = poolKeyHash.toLowerCase() as `0x${string}`;
  const coinAddress = coin.toLowerCase() as `0x${string}`;
  const currencyAddress = currency.toLowerCase() as `0x${string}`;
  const callerId = caller.toLowerCase() as `0x${string}`;

  const quoteInfo = await getQuoteInfo(currencyAddress, timestamp, context);
  const isQuoteZora = quoteInfo.quoteToken === QuoteToken.Zora;
  
  // Optimized parallel operations with single upsert for tokens
  const [assetTokenEntity] = await Promise.all([
    upsertTokenWithPool({
      tokenAddress: coinAddress,
      isDerc20: false,
      isCreatorCoin: true,
      isContentCoin: false,
      poolAddress,
      context,
      creatorCoinPid: null,
      creatorAddress: callerId,
      timestamp,
    }),
    upsertTokenWithPool({
      tokenAddress: currencyAddress,
      isDerc20: false,
      isCreatorCoin: false,
      isContentCoin: false,
      poolAddress: null,
      context,
      creatorAddress: callerId,
      creatorCoinPid: null,
      timestamp,
    }),
  ]);

  const { totalSupply } = assetTokenEntity;
  await insertZoraPoolV4Optimized({
    poolAddress,
    context,
    timestamp,    
    poolKey,
    baseToken: coinAddress,
    quoteToken: currencyAddress,
    isQuoteZora,
    isCreatorCoin: true,
    isContentCoin: false,
    totalSupply,
  });
});

// ponder.on("ZoraV4Hook:Swapped", async ({ event, context }) => {
//   const { poolKeyHash, swapSender, amount0, amount1, sqrtPriceX96, isCoinBuy } = event.args;
//   const timestamp = event.block.timestamp;

//   await handleOptimizedSwap(
//     {
//       poolAddress: poolKeyHash,
//       swapSender,
//       amount0,
//       amount1,
//       sqrtPriceX96,
//       isCoinBuy,
//       timestamp,
//       transactionHash: event.transaction.hash,
//       transactionFrom: event.transaction.from,
//       blockNumber: event.block.number,
//       context,
//     },
//     true,
//   );
// });

onIndexerEvent("ZoraV4CreatorCoinHook:Swapped", async ({ event, context }) => {
  const { db, chain } = context;
  const { poolKeyHash, swapSender, amount0, amount1, sqrtPriceX96, isCoinBuy, key } = event.args;
  const timestamp = event.block.timestamp;
  const poolAddress = poolKeyHash.toLowerCase() as `0x${string}`;
  const poolCoinKey = poolCoinCacheKey(context.chain.id, poolAddress);

  const zoraAddress = chainConfigs[context.chain.name].addresses.zora.zoraToken;

  // Derive tick from the event's sqrtPriceX96 — avoids a per-swap StateView.getSlot0 RPC read.
  const tick = TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString()));

  // Parallelize the remaining RPC call (persistently cached per pool, invalidated by
  // PoolManager:ModifyLiquidity / ZoraCreatorCoinV4:LiquidityMigrated), quote info lookup,
  // and pool fetch.
  const [poolCoin, quoteInfo, poolEntity] = await Promise.all([
    cachedGetPoolCoin(poolCoinKey, () =>
      context.client.readContract({
        abi: ZoraV4HookABI,
        address: key.hooks,
        functionName: "getPoolCoin",
        args: [key],
      }),
    ),
    getQuoteInfo(zoraAddress, timestamp, context),
    db.find(pool, { address: poolAddress, chainId: chain.id }),
  ]);

  if (!poolEntity) {
    return;
  }

  const reserves = computeReservesFromPositions(poolCoin.positions, tick);

  await handleOptimizedSwap(
    {
      poolAddress,
      swapSender,
      amount0,
      amount1,
      sqrtPriceX96,
      isCoinBuy,
      timestamp,
      transactionHash: event.transaction.hash,
      transactionFrom: event.transaction.from,
      blockNumber: event.block.number,
      context,
      tick,
      computedReserves: {
        reserves0: reserves.token0Reserve,
        reserves1: reserves.token1Reserve,
      },
    },
    quoteInfo,
    poolEntity
  );
});

onIndexerEvent("ZoraCreatorCoinV4:LiquidityMigrated", async ({ event, context }) => {
  const { chain, db } = context;
  const { fromPoolKeyHash, toPoolKey, toPoolKeyHash } = event.args;
  const timestamp = event.block.timestamp;

  const fromPoolAddress = fromPoolKeyHash.toLowerCase() as `0x${string}`;
  const toPoolAddress = toPoolKeyHash.toLowerCase() as `0x${string}`;

  // Liquidity has moved off the source pool; drop any cached positions.
  invalidatePoolCoinCache(chain.id, fromPoolAddress);

  const fromPoolEntity = await db.find(pool, {
    address: fromPoolAddress,
    chainId: chain.id,
  });

  if (!fromPoolEntity || isPrecompileAddress(fromPoolEntity.baseToken) || isPrecompileAddress(fromPoolEntity.quoteToken)) {
    return;
  }

  const baseTokenEntity = await db.find(token, {
    address: fromPoolEntity.baseToken,
    chainId: chain.id,
  });

  if (!baseTokenEntity) {
    return;
  }

  const totalSupply = baseTokenEntity.totalSupply;

  const quoteInfo = await getQuoteInfo(fromPoolEntity.quoteToken, timestamp, context);
  const isQuoteZora = quoteInfo.quoteToken === QuoteToken.Zora;

  await Promise.all([
    insertZoraPoolV4Optimized({
      poolAddress: toPoolAddress,
      context,
      timestamp,      
      poolKey: toPoolKey,
      baseToken: fromPoolEntity.baseToken,
      quoteToken: fromPoolEntity.quoteToken,
      isQuoteZora,
      isCreatorCoin: true,
      isContentCoin: false,
      totalSupply,
    }),
    updateToken({
      tokenAddress: fromPoolEntity.baseToken,
      context,
      update: {
        pool: toPoolAddress.toLowerCase() as `0x${string}`,
      },
    }),
  ]);

  const updateData = {
    ...fromPoolEntity,
    address: toPoolAddress.toLowerCase() as `0x${string}`,
    poolKey: {
      ...toPoolKey,
      currency0: toPoolKey.currency0.toLowerCase(),
      currency1: toPoolKey.currency1.toLowerCase(),
      hooks: toPoolKey.hooks.toLowerCase(),
    },
  }

  await updatePool({
    poolAddress: toPoolAddress,
    context,
    update: updateData,
  });

  await db.delete(pool, {
    address: fromPoolAddress,
    chainId: chain.id,
  }).catch(() => {
    console.log(`Failed to delete pool ${fromPoolAddress} from ZoraCreatorCoinV4:LiquidityMigrated`);
  });
});

onIndexerEvent("ZoraCreatorCoinV4:CoinTransfer", async ({ event, context }) => {
  const { address } = event.log;
  const { timestamp } = event.block;
  const { sender, recipient, senderBalance, recipientBalance } = event.args;

  const { db, chain } = context;

  const creatorAddress = event.transaction.from.toLowerCase() as `0x${string}`;
  const recipientAddress = recipient.toLowerCase() as `0x${string}`;
  const senderAddress = sender.toLowerCase() as `0x${string}`;
  const tokenAddress = address.toLowerCase() as `0x${string}`;

  if (isPrecompileAddress(tokenAddress)) {
    return;
  }

  // Batch fetch token and asset data
  const tokenData = await db.find(token, { address: tokenAddress, chainId: chain.id });

  // Ensure token exists (upsert if needed)
  const finalTokenData = tokenData || await upsertTokenWithPool({
    tokenAddress,
    isDerc20: false,
    isCreatorCoin: true,
    isContentCoin: false,
    poolAddress: null,
    context,
    creatorCoinPid: null,
    creatorAddress,
    timestamp,
  });

  // Batch upsert users and assets, get holder count delta
  const { holderCountDelta } = await batchUpsertUsersAndAssets({
    senderAddress,
    recipientAddress,
    tokenAddress,
    senderBalance,
    recipientBalance,
    timestamp,
    context,
  });

  // Batch update holder counts across all entities
  if (holderCountDelta !== 0) {
    await batchUpdateHolderCounts({
      tokenAddress,
      poolAddress: finalTokenData.pool,
      holderCountDelta,
      currentTokenHolderCount: finalTokenData.holderCount,
      context,
    });
  }
});

// ponder.on("ZoraCoinV4:CoinTransfer", async ({ event, context }) => {
//   const { address } = event.log;
//   const { timestamp } = event.block;
//   const { sender, recipient, senderBalance, recipientBalance } = event.args;

//   const { db, chain } = context;

//   const creatorAddress = event.transaction.from.toLowerCase() as `0x${string}`;
//   const recipientAddress = recipient.toLowerCase() as `0x${string}`;
//   const senderAddress = sender.toLowerCase() as `0x${string}`;
//   const tokenAddress = address.toLowerCase() as `0x${string}`;

//   // Batch fetch token and asset data
//   const tokenData = await db.find(token, { address: tokenAddress, chainId: chain.id });

//   // Ensure token exists (upsert if needed)
//   const finalTokenData = tokenData || await upsertTokenWithPool({
//     tokenAddress,
//     isDerc20: false,
//     isCreatorCoin: false,
//     isContentCoin: true,
//     poolAddress: null,
//     context,
//     creatorCoinPid: null,
//     creatorAddress,
//     timestamp,
//   });

//   // Batch upsert users and assets, get holder count delta
//   const { holderCountDelta } = await batchUpsertUsersAndAssets({
//     senderAddress,
//     recipientAddress,
//     tokenAddress,
//     senderBalance,
//     recipientBalance,
//     timestamp,
//     context,
//   });

//   // Batch update holder counts across all entities
//   if (holderCountDelta !== 0) {
//     await batchUpdateHolderCounts({
//       tokenAddress,
//       poolAddress: finalTokenData.pool,
//       holderCountDelta,
//       currentTokenHolderCount: finalTokenData.holderCount,
//       context,
//     });
//   }
// });
