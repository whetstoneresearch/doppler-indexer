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
  fetchEurcPrice,
  fetchBankrPrice
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
  Bankr,
  CreatorCoin,
  Unknown
}

export interface QuoteInfo {
  quoteToken: QuoteToken;
  quotePrice: bigint | null;
  quoteDecimals: number; // Token decimals (e.g., 18 for ETH, 6 for USDC)
  quotePriceDecimals: number; // Price feed decimals (e.g., 8 for Chainlink feeds)
}

export async function getQuoteInfo(quoteAddress: Address, timestamp: bigint | null, context: Context): Promise<QuoteInfo> {
  quoteAddress = quoteAddress.toLowerCase() as Address;
  
  const nativeEthAddress = zeroAddress;
  const wethAddress = chainConfigs[context.chain.name].addresses.shared.weth.toLowerCase();
  const zoraAddress = chainConfigs[context.chain.name].addresses.zora.zoraToken.toLowerCase();
  const fxhAddress = chainConfigs[context.chain.name].addresses.shared.fxHash.fxhAddress.toLowerCase();
  const noiceAddress = chainConfigs[context.chain.name].addresses.shared.noice.noiceAddress.toLowerCase();
  const monAddress = chainConfigs[context.chain.name].addresses.shared.monad.monAddress.toLowerCase();
  const usdcAddress = chainConfigs[context.chain.name].addresses.stables.usdc.toLowerCase();
  const usdtAddress = chainConfigs[context.chain.name].addresses.stables.usdt.toLowerCase();
  const eurcAddress = chainConfigs[context.chain.name].addresses.shared.eurc.eurcAddress.toLowerCase();
  const bankrAddress = chainConfigs[context.chain.name].addresses.shared.bankr.bankrAddress.toLowerCase();
  
  const isQuoteEth = (quoteAddress === nativeEthAddress || quoteAddress === wethAddress);
  const isQuoteZora = quoteAddress != zeroAddress && quoteAddress === zoraAddress;
  const isQuoteFxh = quoteAddress != zeroAddress && quoteAddress === fxhAddress;
  const isQuoteNoice = quoteAddress != zeroAddress && quoteAddress === noiceAddress;
  const isQuoteMon = quoteAddress != zeroAddress && quoteAddress === monAddress;
  const isQuoteUsdc = quoteAddress != zeroAddress && quoteAddress === usdcAddress;
  const isQuoteUsdt = quoteAddress != zeroAddress && quoteAddress === usdtAddress;
  const isQuoteEurc = quoteAddress != zeroAddress && quoteAddress === eurcAddress;
  const isQuoteBankr = quoteAddress != zeroAddress && quoteAddress === bankrAddress;
  
  let creatorCoinInfo;
  if (!(isQuoteZora || isQuoteFxh || isQuoteNoice || isQuoteMon || isQuoteUsdc || isQuoteUsdt || isQuoteEurc || isQuoteBankr)) {
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
    : isQuoteBankr ? QuoteToken.Bankr
    : creatorCoinInfo.isQuoteCreatorCoin ? QuoteToken.CreatorCoin
    : isQuoteEth ? QuoteToken.Eth
    : QuoteToken.Unknown;
    
  // Token decimals (actual token decimals)
  const quoteDecimals = 
    (isQuoteZora || isQuoteFxh || isQuoteNoice || isQuoteMon || creatorCoinInfo.isQuoteCreatorCoin || isQuoteEth || isQuoteBankr) ? 18
    : (isQuoteUsdc || isQuoteUsdt || isQuoteEurc) ? 6
    // assumes 18 decimals for unknown quote tokens
    : 18;
  
  // Price feed decimals (decimals of the USD price value)
  // Chainlink feeds use 8 decimals, EURC uses 18 (from computePriceFromSqrtPriceX96)
  const quotePriceDecimals =
    (isQuoteEth || isQuoteUsdc || isQuoteUsdt) ? 8 // Chainlink feeds use 8 decimals
    : isQuoteEurc ? 18 // EURC price computed from sqrtPriceX96 has 18 decimals
    : quoteDecimals;
  
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
  } else if (isQuoteBankr) {
    quotePrice = await fetchBankrPrice(timestamp, context);
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
  
  const coinEntity = await db.find(
    token, {
      address: quoteAddress,
      chainId: chain.id,
    }
  );
  
  const isQuoteCreatorCoin = coinEntity?.isCreatorCoin ?? false;
  const creatorCoinPoolId = isQuoteCreatorCoin ? coinEntity?.pool : null;
  
  if (!isQuoteCreatorCoin || !creatorCoinPoolId) {
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
    
    return {
      isQuoteCreatorCoin,
      creatorCoinPoolId,
      price
    };
  }
}
