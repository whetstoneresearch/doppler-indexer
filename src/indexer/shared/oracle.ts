import { ethPrice, zoraUsdcPrice, fxhWethPrice, noiceWethPrice, monadUsdcPrice, eurcUsdcPrice, usdcPrice, usdtPrice } from "ponder.schema";
import { Context } from "ponder:registry";
import { MarketDataService } from "@app/core";
import { chainConfigs } from "@app/config";
import { parseUnits, zeroAddress } from "viem";

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
  const { db, chain } = context;
  
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

  if (!zoraPriceData) {
    throw new Error(
      `No ZORA price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return zoraPriceData.price;
};

export const fetchFxhPrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain } = context;

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

  if (!fxhPriceData) {
    throw new Error(
      `No FXH price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return fxhPriceData.price;
};

export const fetchNoicePrice = async (
  timestamp: bigint,
  context: Context,
): Promise<bigint> => {
  const { db, chain } = context;
  
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

  if (!noicePriceData) {
    throw new Error(
      `No NOICE price data found after ${MAX_PRICE_LOOKUP_ATTEMPTS} attempts for chain ${chain.name} (searched back to timestamp ${roundedTimestamp})`
    );
  }

  return noicePriceData.price;
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
