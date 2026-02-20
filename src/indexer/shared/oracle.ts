import { ethPrice, zoraUsdcPrice, fxhWethPrice, noiceWethPrice, monadUsdcPrice, eurcUsdcPrice, bankrWethPrice, usdcPrice, usdtPrice } from "ponder.schema";
import { Context } from "ponder:registry";
import { MarketDataService, PriceService } from "@app/core";
import { chainConfigs } from "@app/config";
import { parseUnits, zeroAddress } from "viem";
import { UniswapV3PoolABI } from "@app/abis/v3-abis/UniswapV3PoolABI";
import { ChainlinkOracleABI } from "@app/abis/ChainlinkOracleABI";
import { StateViewABI } from "@app/abis/v4-abis/StateViewABI";

// Reduced from 1000 to 72 (covers 6 hours at 5-min intervals)
// Price data should be recent; if not found within 6 hours, fallback to RPC
const MAX_PRICE_LOOKUP_ATTEMPTS = 72;

const FALLBACK_CACHE_TTL_MS = 30_000;
const fallbackPriceCache = new Map<string, { price: bigint; timestamp: number }>();

function getCachedFallbackPrice(key: string): bigint | null {
  const entry = fallbackPriceCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > FALLBACK_CACHE_TTL_MS) {
    fallbackPriceCache.delete(key);
    return null;
  }
  return entry.price;
}

function setCachedFallbackPrice(key: string, price: bigint): void {
  if (fallbackPriceCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of fallbackPriceCache) {
      if (now - v.timestamp > FALLBACK_CACHE_TTL_MS) {
        fallbackPriceCache.delete(k);
      }
    }
  }
  fallbackPriceCache.set(key, { price, timestamp: Date.now() });
}

export const fetchEthPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  const { db, chain, client } = context;
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

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
    return ethPriceData.price;
  }

  const cacheKey = `eth:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
  }

  console.warn(`[fetchEthPrice] DB lookup failed for chain ${chain.name}, falling back to Chainlink RPC`);

  const latestAnswer = await client.readContract({
    abi: ChainlinkOracleABI,
    address: chainConfigs[chain.name].addresses.shared.chainlinkEthOracle,
    functionName: "latestAnswer",
  });

  setCachedFallbackPrice(cacheKey, latestAnswer);
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

  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

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
    return zoraPriceData.price;
  }

  const cacheKey = `zora:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
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

  setCachedFallbackPrice(cacheKey, price);
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
  
  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

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
    return fxhPriceData.price;
  }

  const cacheKey = `fxh:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
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

  setCachedFallbackPrice(cacheKey, price);
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

  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

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
    return noicePriceData.price;
  }

  const cacheKey = `noice:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
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

  setCachedFallbackPrice(cacheKey, price);
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

  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  if (chainConfigs[chain.name].addresses.shared.monad.monUsdcPool == zeroAddress) {
    return BigInt(2) * (BigInt(10 ** 16));
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
    return monadPriceData.price;
  }

  const cacheKey = `monad:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
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

  setCachedFallbackPrice(cacheKey, price);
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

  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

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
    return eurcPriceData.price;
  }

  if (!chainConfigs[chain.name].addresses.shared.eurc ||
      chainConfigs[chain.name].addresses.shared.eurc!.eurcUsdcPool === zeroAddress) {
    return parseUnits("115", 16);
  }

  const cacheKey = `eurc:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
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

  setCachedFallbackPrice(cacheKey, price);
  return price;
};

export const fetchBankrPrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain, client } = context;
  
  if (chain.name != "base") {
    return parseUnits("1", 18);
  }

  let roundedTimestamp = BigInt(Math.floor(Number(timestamp) / 300) * 300);

  let bankrPriceData;
  let attempts = 0;
  while (!bankrPriceData && attempts < MAX_PRICE_LOOKUP_ATTEMPTS) {
    attempts++;
    bankrPriceData = await db.find(bankrWethPrice, {
      timestamp: roundedTimestamp,
      chainId: chain.id,
    });

    if (!bankrPriceData) {
      roundedTimestamp -= 300n;
    }
  }

  if (bankrPriceData) {
    return bankrPriceData.price;
  }

  const cacheKey = `bankr:${chain.id}`;
  const cachedPrice = getCachedFallbackPrice(cacheKey);
  if (cachedPrice !== null) {
    return cachedPrice;
  }

  console.warn(`[fetchbankrPrice] DB lookup failed for chain ${chain.name}, falling back to Uniswap V3 RPC`);

  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.bankr.bankrWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  const price = PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });

  setCachedFallbackPrice(cacheKey, price);
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
