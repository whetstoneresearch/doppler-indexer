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

const BASE_STOCK_TOKENS = chainConfigs.base.addresses.stockTokens ?? [];

describe("base stock token config (Coinbase tokenized equities)", () => {
  it("configures the 13 Coinbase tokenized equities", () => {
    expect(BASE_STOCK_TOKENS.length).toBe(13);
    expect(BASE_STOCK_TOKENS.map((s) => s.symbol).sort()).toEqual([
      "AAPLc", "AMZNc", "COINc", "CRCLc", "GOOGLc", "INTCc", "METAc",
      "MSFTc", "MSTRc", "NVDAc", "SNDKc", "SPCXc", "TSLAc",
    ]);
  });

  it("all tokens use 8 decimals and vanity 0xb2 addresses", () => {
    for (const stock of BASE_STOCK_TOKENS) {
      expect(stock.decimals).toBe(8);
      expect(stock.address.toLowerCase().startsWith("0xb2")).toBe(true);
    }
  });

  it("has no zero addresses", () => {
    for (const stock of BASE_STOCK_TOKENS) {
      expect(stock.address).not.toBe(zeroAddress);
      expect(stock.chainlinkOracle).not.toBe(zeroAddress);
    }
  });

  it("has unique token addresses, oracle addresses, and symbols", () => {
    const addresses = BASE_STOCK_TOKENS.map((s) => s.address.toLowerCase());
    const oracles = BASE_STOCK_TOKENS.map((s) => s.chainlinkOracle.toLowerCase());
    const symbols = BASE_STOCK_TOKENS.map((s) => s.symbol);
    expect(new Set(addresses).size).toBe(addresses.length);
    expect(new Set(oracles).size).toBe(oracles.length);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("token and oracle addresses never overlap", () => {
    const addresses = new Set(BASE_STOCK_TOKENS.map((s) => s.address.toLowerCase()));
    for (const stock of BASE_STOCK_TOKENS) {
      expect(addresses.has(stock.chainlinkOracle.toLowerCase())).toBe(false);
    }
  });

  it("does not overlap with other configured base quote tokens", () => {
    const { shared, stables, zora } = chainConfigs.base.addresses;
    const reserved = new Set(
      [
        shared.weth,
        shared.fxHash.fxhAddress,
        shared.noice.noiceAddress,
        shared.eurc.eurcAddress,
        shared.bankr.bankrAddress,
        zora.zoraToken,
        stables.usdc,
        stables.usdt,
        stables.usdg,
      ].map((a) => a.toLowerCase())
    );
    for (const stock of BASE_STOCK_TOKENS) {
      expect(reserved.has(stock.address.toLowerCase())).toBe(false);
    }
  });

  it("finds a base stock token by address in any casing", () => {
    const tsla = BASE_STOCK_TOKENS.find((s) => s.symbol === "TSLAc")!;
    expect(getStockTokenConfig("base", tsla.address.toLowerCase())!.symbol).toBe("TSLAc");
    expect(getStockTokenConfig("base", tsla.address.toUpperCase().replace("0X", "0x"))!.symbol).toBe("TSLAc");
  });

  it("base and robinhood listings do not leak across chains", () => {
    const tsla = BASE_STOCK_TOKENS.find((s) => s.symbol === "TSLAc")!;
    expect(getStockTokenConfig("robinhood", tsla.address)).toBeUndefined();
    const rhTsla = ROBINHOOD_STOCK_TOKENS.find((s) => s.symbol === "TSLA")!;
    expect(getStockTokenConfig("base", rhTsla.address)).toBeUndefined();
  });
});

describe("robinhood stock token decimals", () => {
  it("all robinhood stock tokens use 18 decimals", () => {
    for (const stock of ROBINHOOD_STOCK_TOKENS) {
      expect(stock.decimals).toBe(18);
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
