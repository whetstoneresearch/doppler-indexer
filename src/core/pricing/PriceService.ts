import { Q192, WAD } from "@app/utils/constants";

/**
 * Core price calculation service that provides protocol-agnostic price computations
 */
export class PriceService {
  /**
   * Computes price from sqrt price (used by V3 and V4 protocols)
   * Returns price with 18 decimals of precision (WAD)
   * 
   * The price represents: how much quote token per 1 base token
   * Adjusts for decimal differences between base and quote tokens
   */
  static computePriceFromSqrtPriceX96({
    sqrtPriceX96,
    isToken0,
    decimals = 18,
    quoteDecimals = 18,
  }: {
    sqrtPriceX96: bigint;
    isToken0: boolean;
    decimals?: number;
    quoteDecimals?: number;
  }): bigint {
    const ratioX192 = sqrtPriceX96 * sqrtPriceX96;    
    const scalingExponent = 18 + decimals - quoteDecimals;    
    const scalingFactor = BigInt(10) ** BigInt(scalingExponent);
    
    const price = isToken0
      ? (ratioX192 * scalingFactor) / Q192
      : (Q192 * scalingFactor) / ratioX192;

    return price;
  }

  /**
   * Computes price from reserves (used by V2 protocol)
   * Uses the constant product formula: price = quoteReserve / assetReserve
   */
   static computePriceFromReserves({
     assetBalance,
     quoteBalance,
     assetDecimals,
     quoteDecimals,
   }: {
     assetBalance: bigint;
     quoteBalance: bigint;
     assetDecimals: number;
     quoteDecimals: number;
   }): bigint {
     if (assetBalance === 0n) {
       throw new Error("Asset balance cannot be zero");
     }
        
     const decimalDiff = assetDecimals - quoteDecimals;
   
     if (decimalDiff >= 0) {
       return (quoteBalance * WAD * (10n ** BigInt(decimalDiff))) / assetBalance;
     } else {
       return (quoteBalance * WAD) / (assetBalance * (10n ** BigInt(-decimalDiff)));
     }
   }
}
