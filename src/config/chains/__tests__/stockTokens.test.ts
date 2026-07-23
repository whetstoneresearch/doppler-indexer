import { describe, it, expect } from "vitest";
import { zeroAddress } from "viem";
import { chainConfigs, getStockTokenConfig } from "../index";

const ROBINHOOD_STOCK_TOKENS = chainConfigs.robinhood.addresses.stockTokens ?? [];

describe("robinhood stock token config", () => {
  it("configures stock tokens on robinhood", () => {
    expect(ROBINHOOD_STOCK_TOKENS.length).toBeGreaterThan(0);
  });

  it("has no zero addresses", () => {
    for (const stock of ROBINHOOD_STOCK_TOKENS) {
      expect(stock.address).not.toBe(zeroAddress);
      expect(stock.chainlinkOracle).not.toBe(zeroAddress);
    }
  });

  it("has unique token addresses, oracle addresses, and symbols", () => {
    const addresses = ROBINHOOD_STOCK_TOKENS.map((s) => s.address.toLowerCase());
    const oracles = ROBINHOOD_STOCK_TOKENS.map((s) => s.chainlinkOracle.toLowerCase());
    const symbols = ROBINHOOD_STOCK_TOKENS.map((s) => s.symbol);
    expect(new Set(addresses).size).toBe(addresses.length);
    expect(new Set(oracles).size).toBe(oracles.length);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("token and oracle addresses never overlap", () => {
    const addresses = new Set(ROBINHOOD_STOCK_TOKENS.map((s) => s.address.toLowerCase()));
    for (const stock of ROBINHOOD_STOCK_TOKENS) {
      expect(addresses.has(stock.chainlinkOracle.toLowerCase())).toBe(false);
    }
  });

  it("does not overlap with other configured robinhood quote tokens", () => {
    const { shared, stables } = chainConfigs.robinhood.addresses;
    const reserved = new Set(
      [shared.weth, stables.usdc, stables.usdt, stables.usdg].map((a) => a.toLowerCase())
    );
    for (const stock of ROBINHOOD_STOCK_TOKENS) {
      expect(reserved.has(stock.address.toLowerCase())).toBe(false);
    }
  });
});

describe("getStockTokenConfig", () => {
  it("finds a stock token by lowercase address", () => {
    const aapl = ROBINHOOD_STOCK_TOKENS.find((s) => s.symbol === "AAPL")!;
    const found = getStockTokenConfig("robinhood", aapl.address.toLowerCase());
    expect(found).toBeDefined();
    expect(found!.symbol).toBe("AAPL");
  });

  it("finds a stock token by checksummed/uppercase address", () => {
    const aapl = ROBINHOOD_STOCK_TOKENS.find((s) => s.symbol === "AAPL")!;
    const found = getStockTokenConfig("robinhood", aapl.address.toUpperCase().replace("0X", "0x"));
    expect(found).toBeDefined();
    expect(found!.symbol).toBe("AAPL");
  });

  it("returns undefined for unknown addresses", () => {
    expect(
      getStockTokenConfig("robinhood", "0x000000000000000000000000000000000000dead")
    ).toBeUndefined();
    expect(getStockTokenConfig("robinhood", zeroAddress)).toBeUndefined();
  });

  it("returns undefined on chains without stock tokens", () => {
    const aapl = ROBINHOOD_STOCK_TOKENS.find((s) => s.symbol === "AAPL")!;
    expect(getStockTokenConfig("base", aapl.address)).toBeUndefined();
    expect(getStockTokenConfig("mainnet", aapl.address)).toBeUndefined();
  });

  it("never matches WETH (robinhood's primary numeraire)", () => {
    expect(
      getStockTokenConfig("robinhood", chainConfigs.robinhood.addresses.shared.weth)
    ).toBeUndefined();
  });
});
