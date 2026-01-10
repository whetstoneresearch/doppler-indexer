import { ethPrice, zoraUsdcPrice, fxhWethPrice, noiceWethPrice, monadUsdcPrice, eurcUsdcPrice, usdcPrice, usdtPrice } from "ponder.schema";
import { Context } from "ponder:registry";
import { MarketDataService, PriceService } from "@app/core";
import { chainConfigs } from "@app/config";
import { parseUnits, zeroAddress } from "viem";
import { UniswapV3PoolABI } from "@app/abis/v3-abis/UniswapV3PoolABI";
import { ChainlinkOracleABI } from "@app/abis/ChainlinkOracleABI";
import { StateViewABI } from "@app/abis/v4-abis/StateViewABI";

const MAX_PRICE_LOOKUP_ATTEMPTS = 1000;

const priceCache = new Map<string, { price: bigint; timestamp: bigint }>();
const PRICE_CACHE_WINDOW = 300n; // 5 minutes - accept cached price if within this window
const MAX_CACHE_SIZE = 1000;

function getCachedPrice(key: string, requestedTimestamp: bigint): bigint | null {
  const entry = priceCache.get(key);
  if (!entry) return null;

  const timeDiff = requestedTimestamp > entry.timestamp
    ? requestedTimestamp - entry.timestamp
    : entry.timestamp - requestedTimestamp;

  if (timeDiff <= PRICE_CACHE_WINDOW) {
    return entry.price;
  }
  return null;
}

function setCachedPrice(key: string, price: bigint, timestamp: bigint): void {
  const existing = priceCache.get(key);

  if (!existing || timestamp > existing.timestamp) {
    if (priceCache.size >= MAX_CACHE_SIZE && !existing) {
      const firstKey = priceCache.keys().next().value;
      if (firstKey) priceCache.delete(firstKey);
    }
    priceCache.set(key, { price, timestamp });
  }
}

export const fetchEthPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  const { db, chain, client } = context;
  const cacheKey = `eth:${chain.id}`;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  const cachedDbPrice = getCachedPrice(cacheKey, roundedTimestamp);
  if (cachedDbPrice !== null) {
    return cachedDbPrice;
  }

  let ethPriceData;
  let attempts = 0;
  while (!ethPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    ethPriceData = await db.find(ethPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!ethPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (ethPriceData) {
    setCachedPrice(cacheKey, ethPriceData.price, ethPriceData.timestamp);
    return ethPriceData.price;
  }

  console.warn(`[fetchEthPrice] DB lookup failed for chain ${chain.name}, falling back to Chainlink RPC`);

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: chainConfigs[chain.name].addresses.shared.chainlinkEthOracle,
    functionName: "latestAnswer",
  });

  setCachedPrice(cacheKey, latestAnswer, roundedTimestamp);
  return latestAnswer;
};

export const fetchZoraPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  const { db, chain, client } = context;

  if (chain.name != "base") {
    return parseUnits("1", 18);
  }

  const cacheKey = `zora:${chain.id}`;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  const cachedDbPrice = getCachedPrice(cacheKey, roundedTimestamp);
  if (cachedDbPrice !== null) {
    return cachedDbPrice;
  }

  let zoraPriceData;
  let attempts = 0;
  while (!zoraPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    zoraPriceData = await db.find(zoraUsdcPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!zoraPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (zoraPriceData) {
    setCachedPrice(cacheKey, zoraPriceData.price, zoraPriceData.timestamp);
    return zoraPriceData.price;
  }

  console.warn(`[fetchZoraPrice] DB lookup failed for chain ${chain.name}, falling back to Uniswap V3 RPC`);

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs[chain.name].addresses.zora.zoraTokenPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: true,
    decimals: 18,
    quoteDecimals: 6,
  });

  setCachedPrice(cacheKey, price, roundedTimestamp);
  return price;
};

export const fetchFxhPrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain, client } = context;

  if (chain.name != "base") {
    return parseUnits("1", 18);
  }

  const cacheKey = `fxh:${chain.id}`;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  const cachedDbPrice = getCachedPrice(cacheKey, roundedTimestamp);
  if (cachedDbPrice !== null) {
    return cachedDbPrice;
  }

  let fxhPriceData;
  let attempts = 0;
  while (!fxhPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    fxhPriceData = await db.find(fxhWethPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!fxhPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (fxhPriceData) {
    setCachedPrice(cacheKey, fxhPriceData.price, fxhPriceData.timestamp);
    return fxhPriceData.price;
  }

  console.warn(`[fetchFxhPrice] DB lookup failed for chain ${chain.name}, falling back to Uniswap V3 RPC`);

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.fxHash.fxhWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });

  setCachedPrice(cacheKey, price, roundedTimestamp);
  return price;
};

export const fetchNoicePrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain, client } = context;

  if (chain.name != "base") {
    return parseUnits("1", 18);
  }

  const cacheKey = `noice:${chain.id}`;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  const cachedDbPrice = getCachedPrice(cacheKey, roundedTimestamp);
  if (cachedDbPrice !== null) {
    return cachedDbPrice;
  }

  let noicePriceData;
  let attempts = 0;
  while (!noicePriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    noicePriceData = await db.find(noiceWethPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!noicePriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (noicePriceData) {
    setCachedPrice(cacheKey, noicePriceData.price, noicePriceData.timestamp);
    return noicePriceData.price;
  }

  console.warn(`[fetchNoicePrice] DB lookup failed for chain ${chain.name}, falling back to Uniswap V3 RPC`);

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.noice.noiceWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });

  setCachedPrice(cacheKey, price, roundedTimestamp);
  return price;
};

export const fetchMonadPrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain, client } = context;

  if (chain.name != "monad") {
    return parseUnits("1", 18);
  }

  if (chainConfigs[chain.name].addresses.shared.monad.monUsdcPool == zeroAddress) {
    return BigInt(2) * (BigInt(10 ** 16));
  }

  const cacheKey = `monad:${chain.id}`;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  const cachedDbPrice = getCachedPrice(cacheKey, roundedTimestamp);
  if (cachedDbPrice !== null) {
    return cachedDbPrice;
  }

  let monadPriceData;
  let attempts = 0;
  while (!monadPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    monadPriceData = await db.find(monadUsdcPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!monadPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (monadPriceData) {
    setCachedPrice(cacheKey, monadPriceData.price, monadPriceData.timestamp);
    return monadPriceData.price;
  }

  console.warn(`[fetchMonadPrice] DB lookup failed for chain ${chain.name}, falling back to Uniswap V3 RPC`);

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs[chain.name].addresses.shared.monad.monUsdcPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: true,
    decimals: 18,
    quoteDecimals: 6,
  });

  setCachedPrice(cacheKey, price, roundedTimestamp);
  return price;
};

export const fetchEurcPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  const { db, chain, client } = context;

  if (chain.name != "base") {
    return parseUnits("115", 16);
  }

  const cacheKey = `eurc:${chain.id}`;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  const cachedDbPrice = getCachedPrice(cacheKey, roundedTimestamp);
  if (cachedDbPrice !== null) {
    return cachedDbPrice;
  }

  let eurcPriceData;
  let attempts = 0;
  while (!eurcPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    eurcPriceData = await db.find(eurcUsdcPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!eurcPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (eurcPriceData) {
    setCachedPrice(cacheKey, eurcPriceData.price, eurcPriceData.timestamp);
    return eurcPriceData.price;
  }

  if (!chainConfigs[chain.name].addresses.shared.eurc ||
      chainConfigs[chain.name].addresses.shared.eurc!.eurcUsdcPool === zeroAddress) {
    return parseUnits("115", 16);
  }

  console.warn(`[fetchEurcPrice] DB lookup failed for chain ${chain.name}, falling back to V4 StateView RPC`);

  const slot0 = await client.readContract({
    abi: StateViewABI,
    address: chainConfigs[chain.name].addresses.v4.stateView,
    functionName: "getSlot0",
    args: [chainConfigs[chain.name].addresses.shared.eurc!.eurcUsdcPool],
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: true,
    decimals: 6,
    quoteDecimals: 6,
  });

  setCachedPrice(cacheKey, price, roundedTimestamp);
  return price;
};

export const fetchUsdcPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  // return hardcoded usdc value to lower rpc load
  return BigInt(100000000);
  
  // Note: Code below is unreachable due to early return above
  // Keeping for reference if dynamic pricing is needed in the future
  /*
  const { db, chain } = context;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  let usdcPriceData;
  let attempts = 0;
  while (!usdcPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    usdcPriceData = await db.find(usdcPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!usdcPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (!usdcPriceData) {
    throw new Error(
      `No USDC price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return usdcPriceData.price;
  */
};

export const fetchUsdtPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  // return hardcoded usdt value to lower rpc load
  return BigInt(100000000);
  
  // Note: Code below is unreachable due to early return above
  // Keeping for reference if dynamic pricing is needed in the future
  /*
  const { db, chain } = context;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  let usdtPriceData;
  let attempts = 0;
  while (!usdtPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    usdtPriceData = await db.find(usdtPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!usdtPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (!usdtPriceData) {
    throw new Error(
      `No USDT price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return usdtPriceData.price;
  */
};
