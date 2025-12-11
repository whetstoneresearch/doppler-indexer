import { WAD, CHAINLINK_ETH_DECIMALS } from "@app/utils/constants";
import { PriceService } from "@app/core/pricing";

/**
 * Market metrics interface
 */
export interface MarketMetrics {
  marketCapUsd: bigint;
  liquidityUsd: bigint;
  volumeUsd?: bigint;
  priceUsd?: bigint;
  percentDayChange?: number;
}

/**
 * Liquidity calculation parameters
 */
export interface LiquidityParams {
  assetBalance: bigint;
  quoteBalance: bigint;
  price: bigint;
  quotePriceUSD: bigint;
  isQuoteUSD?: boolean;
  decimals?: number;
}

/**
 * Market cap calculation parameters
 */
export interface MarketCapParams {
  price: bigint;
  totalSupply: bigint;
  quotePriceUSD: bigint;
  assetDecimals?: number;  
  decimals?: number;
}

/**
 * Volume calculation parameters
 */
export interface VolumeParams {
  amountIn: bigint;
  amountOut: bigint;
  quotePriceUSD: bigint;
  isQuoteUSD?: boolean;
  quoteDecimals?: number;
}

/**
 * Service for centralized market data calculations
 * Consolidates market cap, liquidity, volume, and other market metrics
 */
export class MarketDataService {
  /**
   * Calculate market capitalization in USD
   * Formula: (price * totalSupply) / 10^decimals * ethPrice (if quote is ETH)
   */
  static calculateMarketCap(params: MarketCapParams): bigint {
    const {
      price,
      totalSupply,
      quotePriceUSD,
      assetDecimals = 18,
      decimals = 8,
    } = params;
    // Calculate market cap in quote currency
    const marketCap = (price * totalSupply) / BigInt(10 ** assetDecimals);

    return (marketCap * quotePriceUSD) / BigInt(10 ** decimals);
  }

  /**
   * Calculate total liquidity in USD
   * Formula: assetValue + quoteValue (both in USD)
   */
  static calculateLiquidity(params: LiquidityParams): bigint {
    const {
      assetBalance,
      quoteBalance,
      price,
      quotePriceUSD,
      isQuoteUSD = false,
      decimals = 8,
    } = params;

    // Calculate asset value in quote currency
    const assetValueInQuote = (assetBalance * price) / WAD;

    if (!isQuoteUSD) {
      // Convert both to USD
      const assetValueUsd = (assetValueInQuote * quotePriceUSD) / BigInt(10 ** decimals);
      const quoteValueUsd = (quoteBalance * quotePriceUSD) / BigInt(10 ** decimals);
      return assetValueUsd + quoteValueUsd;
    }

    // If quote is already USD, just add them
    return assetValueInQuote + quoteBalance;
  }

  /**
   * Calculate swap volume in USD
   */
  static calculateVolume(params: VolumeParams): bigint {
    const {
      amountIn,
      amountOut,
      quotePriceUSD,
      isQuoteUSD = false,
      quoteDecimals = 18,
    } = params;
    if (amountIn == 0n && amountOut ==0n){
      return 0n;
    }

    // Use the larger amount as volume indicator
    const swapAmount = amountIn > 0n ? amountIn : amountOut;

    if (!isQuoteUSD) {
      return (swapAmount * quotePriceUSD) / BigInt(10 ** quoteDecimals);
    }

    return swapAmount;
  }
}
