import { Address, zeroAddress } from "viem";
import { Context } from "ponder:registry";
import { chainConfigs } from "@app/config";
import { pool, token } from "ponder:schema";
import { PriceService } from "@app/core";
import { WAD } from "@app/utils/constants";
import {
  fetchEthPrice,
  fetchZoraPrice,
  fetchFxhPrice,
  fetchNoicePrice,
  fetchMonadPrice,
  fetchUsdcPrice,
  fetchUsdtPrice,
  fetchEurcPrice
} from "@app/indexer/shared/oracle";

export enum QuoteToken {
  Eth,
  Zora,
  Fxh,
  Noice,
  Mon,
  Usdc,
  Usdt,
  Eurc,
  CreatorCoin,
  Unknown
}

export interface QuoteInfo {
  quoteToken: QuoteToken;
  quotePrice: bigint | null;
  quoteDecimals: number; // Token decimals (e.g., 18 for ETH, 6 for USDC)
  quotePriceDecimals: number; // Price feed decimals (e.g., 8 for Chainlink feeds)
}

interface QuoteTypeCache {
  type: QuoteToken;
  decimals: number;
  priceDecimals: number;
}
const quoteTypeCache = new Map<string, QuoteTypeCache>();

function getQuoteTypeCacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

interface CreatorCoinCacheEntry {
  poolAddress: string | null;
  price: bigint | null;
  timestamp: number;
}
const creatorCoinCache = new Map<string, CreatorCoinCacheEntry>();
const CREATOR_COIN_CACHE_TTL = 60_000; // 60 seconds

export async function getQuoteInfo(quoteAddress: Address, timestamp: bigint | null, context: Context): Promise<QuoteInfo> {
  quoteAddress = quoteAddress.toLowerCase() as Address;
  const cacheKey = getQuoteTypeCacheKey(context.chain.id, quoteAddress);

  const cachedType = quoteTypeCache.get(cacheKey);
  if (cachedType) {
    if (timestamp === null) {
      return {
        quoteToken: cachedType.type,
        quotePrice: null,
        quoteDecimals: cachedType.decimals,
        quotePriceDecimals: cachedType.priceDecimals
      };
    }

    const quotePrice = await fetchPriceForQuoteType(cachedType.type, timestamp, context, quoteAddress);
    return {
      quoteToken: cachedType.type,
      quotePrice,
      quoteDecimals: cachedType.decimals,
      quotePriceDecimals: cachedType.priceDecimals
    };
  }

  const nativeEthAddress = zeroAddress;
  const wethAddress = chainConfigs[context.chain.name].addresses.shared.weth.toLowerCase();
  const zoraAddress = chainConfigs[context.chain.name].addresses.zora.zoraToken.toLowerCase();
  const fxhAddress = chainConfigs[context.chain.name].addresses.shared.fxHash.fxhAddress.toLowerCase();
  const noiceAddress = chainConfigs[context.chain.name].addresses.shared.noice.noiceAddress.toLowerCase();
  const monAddress = chainConfigs[context.chain.name].addresses.shared.monad.monAddress.toLowerCase();
  const usdcAddress = chainConfigs[context.chain.name].addresses.stables.usdc.toLowerCase();
  const usdtAddress = chainConfigs[context.chain.name].addresses.stables.usdt.toLowerCase();
  const eurcAddress = chainConfigs[context.chain.name].addresses.shared.eurc.eurcAddress.toLowerCase();

  const isQuoteEth = (quoteAddress === nativeEthAddress || quoteAddress === wethAddress);
  const isQuoteZora = quoteAddress != zeroAddress && quoteAddress === zoraAddress;
  const isQuoteFxh = quoteAddress != zeroAddress && quoteAddress === fxhAddress;
  const isQuoteNoice = quoteAddress != zeroAddress && quoteAddress === noiceAddress;
  const isQuoteMon = quoteAddress != zeroAddress && quoteAddress === monAddress;
  const isQuoteUsdc = quoteAddress != zeroAddress && quoteAddress === usdcAddress;
  const isQuoteUsdt = quoteAddress != zeroAddress && quoteAddress === usdtAddress;
  const isQuoteEurc = quoteAddress != zeroAddress && quoteAddress === eurcAddress;

  let creatorCoinInfo;
  if (!(isQuoteZora || isQuoteFxh || isQuoteNoice || isQuoteMon || isQuoteUsdc || isQuoteUsdt || isQuoteEurc)) {
    creatorCoinInfo = await getCreatorCoinInfo(quoteAddress, context);
  } else {
    creatorCoinInfo = {
      isQuoteCreatorCoin: false,
      creatorCoinPoolId: null,
      price: null
    };
  }

  const quoteToken =
    isQuoteZora ? QuoteToken.Zora
    : isQuoteFxh ? QuoteToken.Fxh
    : isQuoteNoice ? QuoteToken.Noice
    : isQuoteMon ? QuoteToken.Mon
    : isQuoteUsdc ? QuoteToken.Usdc
    : isQuoteUsdt ? QuoteToken.Usdt
    : isQuoteEurc ? QuoteToken.Eurc
    : creatorCoinInfo.isQuoteCreatorCoin ? QuoteToken.CreatorCoin
    : isQuoteEth ? QuoteToken.Eth
    : QuoteToken.Unknown;

  // Token decimals (actual token decimals)
  const quoteDecimals =
    (isQuoteZora || isQuoteFxh || isQuoteNoice || isQuoteMon || creatorCoinInfo.isQuoteCreatorCoin || isQuoteEth) ? 18
    : (isQuoteUsdc || isQuoteUsdt || isQuoteEurc) ? 6
    // assumes 18 decimals for unknown quote tokens
    : 18;

  // Price feed decimals (decimals of the USD price value)
  // Chainlink feeds use 8 decimals, EURC uses 18 (from computePriceFromSqrtPriceX96)
  const quotePriceDecimals =
    (isQuoteEth || isQuoteUsdc || isQuoteUsdt) ? 8 // Chainlink feeds use 8 decimals
    : isQuoteEurc ? 18 // EURC price computed from sqrtPriceX96 has 18 decimals
    : quoteDecimals;

  if (quoteToken !== QuoteToken.Unknown) {
    quoteTypeCache.set(cacheKey, {
      type: quoteToken,
      decimals: quoteDecimals,
      priceDecimals: quotePriceDecimals
    });
  }
  
  // Short circuit price fetching if timestamp is null
  if (timestamp === null) {
    return {
      quoteToken,
      quotePrice: null,
      quoteDecimals,
      quotePriceDecimals
    };
  }
    
  let quotePrice;
  if (isQuoteEth) {
    quotePrice = await fetchEthPrice(timestamp, context);
  } else if (isQuoteZora) {
    quotePrice = await fetchZoraPrice(timestamp, context);
  } else if (isQuoteFxh) {
    const [ethPrice, fxhWethPrice] = await Promise.all([
      fetchEthPrice(timestamp, context),
      fetchFxhPrice(timestamp, context),
    ]);
    quotePrice = fxhWethPrice! * ethPrice / 10n ** 8n;
  } else if (isQuoteNoice) {
    const [ethPrice, noiceWethPrice] = await Promise.all([
      fetchEthPrice(timestamp, context),
      fetchNoicePrice(timestamp, context),
    ]);
    quotePrice = noiceWethPrice! * ethPrice / 10n ** 8n;
  } else if (isQuoteMon) {
    quotePrice = await fetchMonadPrice(timestamp, context);
  } else if (isQuoteUsdc) {
    quotePrice = await fetchUsdcPrice(timestamp, context);
  } else if (isQuoteUsdt) {
    quotePrice = await fetchUsdtPrice(timestamp, context);
  } else if (isQuoteEurc) {
    quotePrice = await fetchEurcPrice(timestamp, context);
  } else if (creatorCoinInfo.isQuoteCreatorCoin) {
    if (creatorCoinInfo.price === null) {
      // Creator coin pool doesn't exist yet, fall back to unknown token handling
      quotePrice = BigInt(1) / (BigInt(10) ** BigInt(21));
    } else {
      const zoraPrice = await fetchZoraPrice(timestamp, context);
      quotePrice = (creatorCoinInfo.price * zoraPrice) / WAD;
    }
  } else {    
    // return price of 1^10^-20 (1/10th cent) if unknown quote token, will report incorrect metrics
    // TODO: find path back to a terminal token we know usd price for and calculate usd price of quote token
    quotePrice = BigInt(1) / (BigInt(10) ** BigInt(21));
  }
  
  const quoteInfo = {
    quoteToken,
    quotePrice,
    quoteDecimals,
    quotePriceDecimals
  }
  
  return quoteInfo;
}

interface CreatorCoinInfo {
  isQuoteCreatorCoin: boolean;
  creatorCoinPoolId: Address | null;
  price: bigint | null;
}

async function getCreatorCoinInfo(quoteAddress: Address, context: Context): Promise<CreatorCoinInfo> {
  const { db, chain } = context;
  const cacheKey = getQuoteTypeCacheKey(chain.id, quoteAddress);

  const cachedEntry = creatorCoinCache.get(cacheKey);
  if (cachedEntry && (Date.now() - cachedEntry.timestamp) < CREATOR_COIN_CACHE_TTL) {
    if (cachedEntry.poolAddress === null) {
      return {
        isQuoteCreatorCoin: false,
        creatorCoinPoolId: null,
        price: null
      };
    }
    return {
      isQuoteCreatorCoin: true,
      creatorCoinPoolId: cachedEntry.poolAddress as Address,
      price: cachedEntry.price
    };
  }

  const coinEntity = await db.find(
    token, {
      address: quoteAddress,
      chainId: chain.id,
    }
  );

  const isQuoteCreatorCoin = coinEntity?.isCreatorCoin ?? false;
  const creatorCoinPoolId = isQuoteCreatorCoin ? coinEntity?.pool : null;

  if (!isQuoteCreatorCoin || !creatorCoinPoolId) {
    creatorCoinCache.set(cacheKey, {
      poolAddress: null,
      price: null,
      timestamp: Date.now()
    });
    return {
      isQuoteCreatorCoin: false,
      creatorCoinPoolId: null,
      price: null
    };
  } else {
    const poolEntity = await db.find(pool, {
      address: creatorCoinPoolId as Address,
      chainId: chain.id,
    });

    if (!poolEntity) {
      console.error(
        `Creator coin pool ${creatorCoinPoolId} not found in database for token ${quoteAddress}. ` +
        `This should not happen - creator coin pools are created via ZoraFactory:CreatorCoinCreated events.`
      );
      creatorCoinCache.set(cacheKey, {
        poolAddress: creatorCoinPoolId,
        price: null,
        timestamp: Date.now()
      });
      return {
        isQuoteCreatorCoin: true,
        creatorCoinPoolId,
        price: null
      };
    }

    const price = PriceService.computePriceFromSqrtPriceX96({
      sqrtPriceX96: poolEntity.sqrtPrice,
      isToken0: poolEntity.isToken0,
      decimals: 18,
      quoteDecimals: 18
    });

    creatorCoinCache.set(cacheKey, {
      poolAddress: creatorCoinPoolId,
      price,
      timestamp: Date.now()
    });

    return {
      isQuoteCreatorCoin,
      creatorCoinPoolId,
      price
    };
  }
}

// Helper function to fetch price based on quote type (used when cache hit)
async function fetchPriceForQuoteType(
  quoteType: QuoteToken,
  timestamp: bigint,
  context: Context,
  quoteAddress: Address
): Promise<bigint> {
  switch (quoteType) {
    case QuoteToken.Eth:
      return fetchEthPrice(timestamp, context);
    case QuoteToken.Zora:
      return fetchZoraPrice(timestamp, context);
    case QuoteToken.Fxh: {
      const [ethPrice, fxhWethPrice] = await Promise.all([
        fetchEthPrice(timestamp, context),
        fetchFxhPrice(timestamp, context),
      ]);
      return fxhWethPrice! * ethPrice / 10n ** 8n;
    }
    case QuoteToken.Noice: {
      const [ethPrice, noiceWethPrice] = await Promise.all([
        fetchEthPrice(timestamp, context),
        fetchNoicePrice(timestamp, context),
      ]);
      return noiceWethPrice! * ethPrice / 10n ** 8n;
    }
    case QuoteToken.Mon:
      return fetchMonadPrice(timestamp, context);
    case QuoteToken.Usdc:
      return fetchUsdcPrice(timestamp, context);
    case QuoteToken.Usdt:
      return fetchUsdtPrice(timestamp, context);
    case QuoteToken.Eurc:
      return fetchEurcPrice(timestamp, context);
    case QuoteToken.CreatorCoin: {
      const creatorCoinInfo = await getCreatorCoinInfo(quoteAddress, context);
      if (creatorCoinInfo.price === null) {
        return BigInt(1) / (BigInt(10) ** BigInt(21));
      }
      const zoraPrice = await fetchZoraPrice(timestamp, context);
      return (creatorCoinInfo.price * zoraPrice) / WAD;
    }
    default:
      return BigInt(1) / (BigInt(10) ** BigInt(21));
  }
}
