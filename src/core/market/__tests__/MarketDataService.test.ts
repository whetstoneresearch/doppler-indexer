import { describe, it, expect } from 'vitest';
import { MarketDataService } from '../MarketDataService';

const WAD = BigInt(10) ** BigInt(18);

describe('MarketDataService', () => {
  describe('calculateMarketCap', () => {
    it('should calculate market cap with ETH quote token', () => {
      // Token supply: 1,000,000 tokens
      // Price: 0.01 ETH per token (in WAD format)
      // ETH price: $2000
      const totalSupply = 1000000n * WAD;
      const price = WAD / 100n; // 0.01 ETH
      const ethPriceUSD = 2000n * BigInt(10 ** 8); // Chainlink format
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      // 1,000,000 * 0.01 * 2000 = $20,000,000
      // Result should have 18 decimals
      expect(marketCap).toBe(20000000n * WAD);
    });

    it('should calculate market cap with USDC quote token', () => {
      // Token supply: 500,000 tokens
      // Price: 2 USDC per token (in WAD format)
      // USDC price: $1 (already USD)
      const totalSupply = 500000n * WAD;
      const price = 2n * WAD;
      const usdcPriceUSD = BigInt(10 ** 8); // $1 in Chainlink format
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: usdcPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      // 500,000 * 2 * 1 = $1,000,000
      expect(marketCap).toBe(1000000n * WAD);
    });

    it('should calculate market cap with 6 decimal token', () => {
      // USDC token with 6 decimals
      const totalSupply = 1000000n * BigInt(10 ** 6);
      const price = 105n * WAD / 100n; // 1.05 ETH per USDC (hypothetical)
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 6,
        decimals: 8,
      });
      
      // 1,000,000 * 1.05 * 2000 = $2,100,000,000
      expect(marketCap).toBe(2100000000n * WAD);
    });

    it('should handle very large market caps', () => {
      const totalSupply = 1000000000n * WAD; // 1 billion tokens
      const price = WAD; // 1 ETH per token
      const ethPriceUSD = 3000n * BigInt(10 ** 8);
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      // 1,000,000,000 * 1 * 3000 = $3,000,000,000,000
      expect(marketCap).toBe(3000000000000n * WAD);
    });

    it('should handle very small market caps', () => {
      const totalSupply = 1000n * WAD;
      const price = WAD / 1000n; // 0.001 ETH
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      // 1000 * 0.001 * 2000 = $2000
      expect(marketCap).toBe(2000n * WAD);
    });

    it('should handle zero total supply', () => {
      const totalSupply = 0n;
      const price = WAD;
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      expect(marketCap).toBe(0n);
    });

    it('should handle zero price', () => {
      const totalSupply = 1000000n * WAD;
      const price = 0n;
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      expect(marketCap).toBe(0n);
    });

    it('should calculate market cap for Zora creator coin scenario', () => {
      // Creator coin quoted in ZORA
      // 10,000 total supply
      // 100 ZORA per coin
      // ZORA = 0.001 ETH
      // ETH = $2000
      const totalSupply = 10000n * WAD;
      const priceInZora = 100n * WAD;
      const zoraPriceInETH = WAD / 1000n;
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      // Price in ETH
      const priceInETH = (priceInZora * zoraPriceInETH) / WAD;
      
      const marketCap = MarketDataService.calculateMarketCap({
        price: priceInETH,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: 8,
      });
      
      // 10,000 * 100 * 0.001 * 2000 = $2,000,000
      expect(marketCap).toBe(2000000n * WAD);
    });

    it('should correctly handle different quote price decimals', () => {
      const totalSupply = 100000n * WAD;
      const price = WAD;
      
      // Test with 18 decimals (like calculated ZORA prices)
      const quotePriceWith18Decimals = 2n * WAD;
      const marketCapWith18 = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: quotePriceWith18Decimals,
        assetDecimals: 18,
        decimals: 18,
      });
      
      // Test with 8 decimals (like Chainlink)
      const quotePriceWith8Decimals = 2n * BigInt(10 ** 8);
      const marketCapWith8 = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: quotePriceWith8Decimals,
        assetDecimals: 18,
        decimals: 8,
      });
      
      // Both should give same result
      expect(marketCapWith18).toBe(marketCapWith8);
      expect(marketCapWith18).toBe(200000n * WAD);
    });
  });

  describe('calculateLiquidity', () => {
    it('should calculate liquidity with ETH quote token', () => {
      // Pool: 100 tokens and 10 ETH
      // Price: 0.1 ETH per token
      // ETH price: $2000
      const assetBalance = 100n * WAD;
      const quoteBalance = 10n * WAD;
      const price = WAD / 10n;
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: ethPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
      });
      
      // Asset value: 100 * 0.1 = 10 ETH = $20,000
      // Quote value: 10 ETH = $20,000
      // Total: $40,000 (with 18 decimals)
      expect(liquidity).toBe(40000n * WAD);
    });

    it('should calculate liquidity with USDC quote token', () => {
      const assetBalance = 1000n * WAD;
      const quoteBalance = 5000n * BigInt(10 ** 6); // 5000 USDC
      const price = 5n * WAD; // 5 USDC per token
      const usdcPriceUSD = BigInt(10 ** 8); // $1
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: usdcPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
        quoteDecimals: 6, // USDC has 6 decimals
      });
      
      // Asset value: 1000 * 5 = 5000 USDC = $5000
      // Quote value: 5000 USDC = $5000
      // Total: $10,000 (with 18 decimals)
      expect(liquidity).toBe(10000n * WAD);
    });

    it('should calculate liquidity when quote is already USD', () => {
      const assetBalance = 500n * WAD;
      const quoteBalance = 1000n * WAD; // Already in USD
      const price = 2n * WAD; // 2 USD per token
      const usdPrice = BigInt(10 ** 8); // Irrelevant when isQuoteUSD is true
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: usdPrice,
        isQuoteUSD: true,
        decimals: 8,
      });
      
      // Asset value: 500 * 2 = 1000 USD
      // Quote value: 1000 USD
      // Total: 2000 USD
      expect(liquidity).toBe(2000n * WAD);
    });

    it('should handle zero asset balance', () => {
      const assetBalance = 0n;
      const quoteBalance = 10n * WAD;
      const price = WAD;
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: ethPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
      });
      
      // Only quote value: 10 ETH * $2000 = $20,000 (with 18 decimals)
      expect(liquidity).toBe(20000n * WAD);
    });

    it('should handle zero quote balance', () => {
      const assetBalance = 100n * WAD;
      const quoteBalance = 0n;
      const price = WAD / 10n;
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: ethPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
      });
      
      // Only asset value: 100 * 0.1 * $2000 = $20,000 (with 18 decimals)
      expect(liquidity).toBe(20000n * WAD);
    });

    it('should handle realistic WETH/USDC pool', () => {
      // Pool with 10 WETH and 20000 USDC
      const assetBalance = 10n * WAD;
      const quoteBalance = 20000n * BigInt(10 ** 6);
      const price = 2000n * WAD; // 2000 USDC per WETH
      const usdcPriceUSD = BigInt(10 ** 8);
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: usdcPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
        quoteDecimals: 6, // USDC has 6 decimals
      });
      
      // Asset value: 10 * 2000 = 20000 USDC = $20,000
      // Quote value: 20000 USDC = $20,000
      // Total: $40,000 (with 18 decimals)
      expect(liquidity).toBe(40000n * WAD);
    });

    it('should handle creator coin pool (quoted in ZORA)', () => {
      const assetBalance = 1000n * WAD; // Creator coins
      const quoteBalance = 100000n * WAD; // ZORA tokens
      const priceInZora = 100n * WAD; // 100 ZORA per creator coin
      
      // ZORA price scenario
      const zoraPriceInETH = WAD / 1000n; // 0.001 ETH
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      const zoraPriceUSD = (zoraPriceInETH * ethPriceUSD) / BigInt(10 ** 8); // Has 18 decimals
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price: priceInZora,
        quotePriceUSD: zoraPriceUSD,
        isQuoteUSD: false,
        decimals: 18, // ZORA price has 18 decimals
      });
      
      // Asset value: 1000 * 100 = 100,000 ZORA
      // Quote value: 100,000 ZORA
      // Total: 200,000 ZORA * 0.001 ETH * $2000 = $400,000      
      expect(liquidity).toBe(400000n * WAD);
    });

    it('should handle very large liquidity pools', () => {
      const assetBalance = 1000000n * WAD;
      const quoteBalance = 1000n * WAD;
      const price = WAD / 1000n;
      const ethPriceUSD = 3000n * BigInt(10 ** 8);
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: ethPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
      });
      
      // Asset value: 1,000,000 * 0.001 = 1000 ETH = $3,000,000
      // Quote value: 1000 ETH = $3,000,000
      // Total: $6,000,000 (with 18 decimals)
      expect(liquidity).toBe(6000000n * WAD);
    });

    it('should handle imbalanced pools', () => {
      // Pool heavily weighted towards one side
      const assetBalance = 1000000n * WAD;
      const quoteBalance = WAD; // Only 1 ETH
      const price = WAD / 1000000n; // Very low price
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: ethPriceUSD,
        isQuoteUSD: false,
        decimals: 8,
      });
      
      // Asset value: 1,000,000 * (1/1,000,000) = 1 ETH = $2000
      // Quote value: 1 ETH = $2000
      // Total: $4000 (with 18 decimals)
      expect(liquidity).toBe(4000n * WAD);
    });
  });

  describe('Integration tests with quote info scenarios', () => {
    it('should calculate correct metrics for ETH-quoted token', () => {
      // Scenario: Token quoted in ETH
      const totalSupply = 1000000n * WAD;
      const assetBalance = 10000n * WAD;
      const quoteBalance = 100n * WAD; // 100 ETH
      const price = WAD / 100n; // 0.01 ETH per token
      const ethPriceUSD = 2000n * BigInt(10 ** 8);      
      const quotePriceDecimals = 8;
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: ethPriceUSD,
        assetDecimals: 18,
        decimals: quotePriceDecimals,
      });
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: ethPriceUSD,
        isQuoteUSD: false,
        decimals: quotePriceDecimals,
      });
      
      // Market cap: 1,000,000 * 0.01 * 2000 = $20,000,000
      expect(marketCap).toBe(20000000n * WAD);
      
      // Liquidity: (10,000 * 0.01 + 100) * 2000 = (100 + 100) * 2000 = $400,000 (with 18 decimals)
      expect(liquidity).toBe(400000n * WAD);
    });

    it('should calculate correct metrics for USDC-quoted token', () => {
      const totalSupply = 500000n * WAD;
      const assetBalance = 5000n * WAD;
      const quoteBalance = 10000n * BigInt(10 ** 6); // 10,000 USDC
      const price = 2n * WAD; // 2 USDC per token
      const usdcPriceUSD = BigInt(10 ** 8); // $1
      const quoteDecimals = 6;
      const quotePriceDecimals = 8;
      
      const marketCap = MarketDataService.calculateMarketCap({
        price,
        totalSupply,
        quotePriceUSD: usdcPriceUSD,
        assetDecimals: 18,
        decimals: quotePriceDecimals,
      });
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price,
        quotePriceUSD: usdcPriceUSD,
        isQuoteUSD: false,
        decimals: quotePriceDecimals,
        quoteDecimals: quoteDecimals, // USDC has 6 decimals
      });
      
      // Market cap: 500,000 * 2 * 1 = $1,000,000
      expect(marketCap).toBe(1000000n * WAD);
      
      // Liquidity: (5,000 * 2 + 10,000) * 1 = $20,000 (with 18 decimals)
      expect(liquidity).toBe(20000n * WAD);
    });

    it('should calculate correct metrics for creator coin (Zora-quoted)', () => {
      const totalSupply = 10000n * WAD;
      const assetBalance = 1000n * WAD;
      const quoteBalance = 100000n * WAD; // ZORA
      const priceInZora = 100n * WAD; // 100 ZORA per coin
      
      // ZORA is quoted in ETH
      const zoraPriceInETH = WAD / 1000n; // 0.001 ETH per ZORA
      const ethPriceUSD = 2000n * BigInt(10 ** 8);
      const zoraPriceUSD = (zoraPriceInETH * ethPriceUSD) / BigInt(10 ** 8); // 18 decimals
      
      const quoteDecimals = 18;
      const quotePriceDecimals = 18; // Calculated prices use 18 decimals
      
      const marketCap = MarketDataService.calculateMarketCap({
        price: priceInZora,
        totalSupply,
        quotePriceUSD: zoraPriceUSD,
        assetDecimals: 18,
        decimals: quotePriceDecimals,
      });
      
      const liquidity = MarketDataService.calculateLiquidity({
        assetBalance,
        quoteBalance,
        price: priceInZora,
        quotePriceUSD: zoraPriceUSD,
        isQuoteUSD: false,
        decimals: quotePriceDecimals,
      });
      
      // Market cap: 10,000 * 100 * 0.001 * 2000 = $2,000,000
      expect(marketCap).toBe(2000000n * WAD);
      
      // Liquidity: (1,000 * 100 + 100,000) * 0.001 * 2000 = 200,000 * 2 = $400,000      
      expect(liquidity).toBe(400000n * WAD);
    });
  });
});
