import { ethPrice, zoraUsdcPrice, fxhWethPrice, noiceWethPrice, monadUsdcPrice, eurcUsdcPrice, usdcPrice, usdtPrice } from "ponder.schema";
import { Context } from "ponder:registry";
import { MarketDataService, PriceService } from "@app/core";
import { chainConfigs } from "@app/config";
import { parseUnits, zeroAddress } from "viem";
import { UniswapV3PoolABI } from "@app/abis/v3-abis/UniswapV3PoolABI";

// Maximum number of 5-minute intervals to search backwards for price data
// 1000 attempts = ~3.5 days of historical data
const MAX_PRICE_LOOKUP_ATTEMPTS = 1000;

export const fetchEthPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  const { db, chain } = context;
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

  if (!ethPriceData) {
    throw new Error(
      `No ETH price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return ethPriceData.price;
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

  // Try database lookup first
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

  // FALLBACK: Fetch directly from RPC if database lookup fails
  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs[chain.name].addresses.zora.zoraTokenPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  return PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: true,
    decimals: 18,
    quoteDecimals: 6,
  });
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

  // Try database lookup first
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

  // FALLBACK: Fetch directly from RPC if database lookup fails
  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.fxHash.fxhWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  return PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });
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

  // Try database lookup first
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

  // FALLBACK: Fetch directly from RPC if database lookup fails
  const slot0 = await client.readContract({
    abi: UniswapV3PoolABI,
    address: chainConfigs["base"].addresses.shared.noice.noiceWethPool,
    functionName: "slot0",
  });

  const sqrtPriceX96 = slot0[0] as bigint;

  return PriceService.computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0: false,
    decimals: 18,
    quoteDecimals: 18,
  });
};

export const fetchMonadPrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain } = context;
  
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

  if (!monadPriceData) {
    throw new Error(
      `No MONAD price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return monadPriceData.price;
};

export const fetchEurcPrice = async (
  timestamp: bigint,
  context: Context
): Promise<bigint> => {
  const { db, chain } = context;
  
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

  if (!eurcPriceData) {
    throw new Error(
      `No EURC price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return eurcPriceData.price;
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
