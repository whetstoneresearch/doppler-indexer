import { describe, it, expect } from 'vitest';
import { PriceService } from '../PriceService';

const WAD = BigInt(10) ** BigInt(18);

describe('PriceService', () => {
  describe('computePriceFromSqrtPriceX96', () => {
    it('should compute price for token0 with equal decimals', () => {
      // sqrtPriceX96 = sqrt(price) * 2^96
      // For price = 1, sqrtPriceX96 = 2^96
      const sqrtPriceX96 = BigInt(2) ** BigInt(96);
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 18,
        quoteDecimals: 18,
      });
      
      // Price of 1 should equal 1 WAD
      expect(price).toBe(WAD);
    });

    it('should compute price for token1 with equal decimals', () => {
      const sqrtPriceX96 = BigInt(2) ** BigInt(96);
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: false,
        decimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(WAD);
    });

    it('should compute price for token0 when quote token has 6 decimals (USDC)', () => {
      // ETH (18 decimals) priced in USDC (6 decimals)
      // If 1 ETH = 2000 USDC, on-chain ratio is 2000 * 10^6 / 10^18 = 2000 * 10^-12
      // sqrtPrice = sqrt(2000 * 10^-12) * 2^96
      const sqrtPriceX96 = BigInt('3543191142285914327220224');
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 18,
        quoteDecimals: 6,
      });
      
      // Price should be around 2000 * 10^18 (WAD format)
      expect(price).toBe(2000000000000000136936n);
    });

    it('should compute price for token1 when quote token has 6 decimals', () => {
      const sqrtPriceX96 = BigInt('171884451380006932495990816017293253');
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: false,
        decimals: 18,
        quoteDecimals: 6,
      });
      
      // For token1, the price should be inverted and scaled
      expect(price).toBe(212464307871750109n);
    });

    it('should compute price when base token has 6 decimals and quote has 18', () => {
      const sqrtPriceX96 = BigInt(2) ** BigInt(96);
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 6,
        quoteDecimals: 18,
      });
      
      // With 6 decimals base and 18 decimals quote, scaling should adjust
      expect(price).toBe(1000000n);
    });

    it('should handle very small sqrtPriceX96 values', () => {
      // Use a more realistic small value that won't round to 0
      // sqrt(0.000001) * 2^96 (adjusted to avoid rounding to 0)
      const sqrtPriceX96 = BigInt('79228162514264342528');
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(1n);
    });

    it('should handle very large sqrtPriceX96 values', () => {
      const sqrtPriceX96 = BigInt(2) ** BigInt(160);
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(340282366920938463463374607431768211456000000000000000000n);
    });

    it('should correctly inverse price for token0 vs token1', () => {
      const sqrtPriceX96 = BigInt('5602277097478614198912276234240'); // arbitrary value
      
      const priceToken0 = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 18,
        quoteDecimals: 18,
      });
      
      const priceToken1 = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: false,
        decimals: 18,
        quoteDecimals: 18,
      });
      
      // token0 and token1 prices should be inverses
      const product = (priceToken0 * priceToken1) / WAD;
      expect(product).toBeGreaterThan(WAD - WAD / 10000n); // within 0.1%
      expect(product).toBeLessThan(WAD + WAD / 10000n);
    });

    it('should handle realistic ETH/USDC price scenario', () => {
      // ETH = $2000, represented in Uniswap V3 pool
      // sqrtPriceX96 for ETH (18 decimals) / USDC (6 decimals)
      // price = 2000 * 10^6 / 10^18 = 2000 * 10^-12
      // sqrtPrice = sqrt(2000 * 10^-12) * 2^96 = sqrt(2) * sqrt(1000 * 10^-12) * 2^96
      
      // For WETH/USDC pool where WETH is token0
      // Note: sqrt(2000) ≈ 44.72, so this is sqrt(2000) times larger than sqrt(1)
      const sqrtPriceX96 = BigInt('3543191142285914327220224'); // sqrt(2000 * 10^-12) * 2^96
      
      const price = PriceService.computePriceFromSqrtPriceX96({
        sqrtPriceX96,
        isToken0: true,
        decimals: 18, // WETH decimals
        quoteDecimals: 6, // USDC decimals
      });
      
      // Should be close to 2000 * 10^18      
      expect(price).toBe(2000000000000000136936n);
    });
  });

  describe('computePriceFromReserves', () => {
    it('should compute price with equal decimals and 1:1 ratio', () => {
      const price = PriceService.computePriceFromReserves({
        assetBalance: WAD,
        quoteBalance: WAD,
        assetDecimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(WAD);
    });

    it('should compute price with 2:1 quote to asset ratio', () => {
      const price = PriceService.computePriceFromReserves({
        assetBalance: WAD,
        quoteBalance: 2n * WAD,
        assetDecimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(2n * WAD);
    });

    it('should compute price with 1:2 quote to asset ratio', () => {
      const price = PriceService.computePriceFromReserves({
        assetBalance: 2n * WAD,
        quoteBalance: WAD,
        assetDecimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(WAD / 2n);
    });

    it('should handle USDC (6 decimals) as quote token', () => {
      // 1 asset token = 100 USDC
      const assetBalance = 10n * WAD; // 10 tokens with 18 decimals
      const quoteBalance = 1000n * BigInt(10 ** 6); // 1000 USDC with 6 decimals
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 18,
        quoteDecimals: 6,
      });
      
      // Price should be 100 USDC per token = 100 * 10^18
      expect(price).toBe(100n * WAD);
    });

    it('should handle asset with 6 decimals and quote with 18', () => {
      // USDC (6 decimals) priced in WETH (18 decimals)
      const assetBalance = 2000n * BigInt(10 ** 6); // 2000 USDC
      const quoteBalance = WAD; // 1 WETH
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 6,
        quoteDecimals: 18,
      });
      
      // Price should be 1/2000 WETH per USDC = 0.0005 * 10^18
      expect(price).toBe(WAD / 2000n);
    });

    it('should handle both tokens with 6 decimals', () => {
      const assetBalance = 1000n * BigInt(10 ** 6);
      const quoteBalance = 500n * BigInt(10 ** 6);
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 6,
        quoteDecimals: 6,
      });
      
      expect(price).toBe(WAD / 2n);
    });

    it('should throw error when asset balance is zero', () => {
      expect(() => {
        PriceService.computePriceFromReserves({
          assetBalance: 0n,
          quoteBalance: WAD,
          assetDecimals: 18,
          quoteDecimals: 18,
        });
      }).toThrow('Asset balance cannot be zero');
    });

    it('should handle very large reserves', () => {
      const assetBalance = 1000000n * WAD;
      const quoteBalance = 2000000n * WAD;
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBe(2n * WAD);
    });

    it('should handle very small reserves', () => {
      const assetBalance = 100n;
      const quoteBalance = 200n;
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 18,
        quoteDecimals: 18,
      });
      
      expect(price).toBeGreaterThan(2n);
    });

    it('should compute realistic WETH/USDC price in V2 pool', () => {
      // Pool with 10 WETH and 20000 USDC
      const assetBalance = 10n * WAD; // 10 WETH
      const quoteBalance = 20000n * BigInt(10 ** 6); // 20000 USDC
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 18,
        quoteDecimals: 6,
      });
      
      // Price should be 2000 USDC per WETH
      expect(price).toBe(2000n * WAD);
    });

    it('should handle decimal difference of 12 (common for ETH/USDC)', () => {
      const assetBalance = WAD;
      const quoteBalance = BigInt(10 ** 6);
      
      const price = PriceService.computePriceFromReserves({
        assetBalance,
        quoteBalance,
        assetDecimals: 18,
        quoteDecimals: 6,
      });
      
      expect(price).toBe(WAD);
    });
  });
});
