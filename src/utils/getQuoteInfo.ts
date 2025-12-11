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
  quoteDecimals: number;
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
    
  // uses 8 for tokens that use chainlink price feeds
  const quoteDecimals = 
    (isQuoteZora || isQuoteFxh || isQuoteNoice || isQuoteMon || creatorCoinInfo.isQuoteCreatorCoin) ? 18
    : (isQuoteEth || isQuoteUsdc || isQuoteUsdt) ? 8
    : isQuoteEurc ? 6
    // assumes 18 decimals for unknown quote tokens
    : 18;
  
  // Short circuit price fetching if timestamp is null
  if (timestamp === null) {
    return {
      quoteToken,
      quotePrice: null,
      quoteDecimals
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
    const zoraPrice = await fetchZoraPrice(timestamp, context);
    quotePrice = (creatorCoinInfo.price! * zoraPrice) / WAD;
  } else {    
    // return price of 1^10^-20 (1/10th cent) if unknown quote token, will report incorrect metrics
    // TODO: find path back to a terminal token we know usd price for and calculate usd price of quote token
    quotePrice = BigInt(1) / (BigInt(10) ** BigInt(21));
  }
  
  const quoteInfo = {
    quoteToken,
    quotePrice,
    quoteDecimals
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
    
    const price = PriceService.computePriceFromSqrtPriceX96({
      sqrtPriceX96: poolEntity!.sqrtPrice,
      isToken0: poolEntity!.isToken0,
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
