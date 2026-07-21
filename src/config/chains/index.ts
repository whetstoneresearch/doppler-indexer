import { IndexerConfigs, StockTokenConfig } from "./types";
import { unichainConfig } from "./unichain";
import { baseConfig } from "./base";
import { baseSepoliaConfig } from "./baseSepolia";
import { inkConfig } from "./ink";
import { monadConfig } from "./monad";
import { mainnetConfig } from "./mainnet";
import { sepoliaConfig } from "./sepolia";
import { robinhoodConfig } from "./robinhood";

export * from "./types";
export * from "./constants";

// Combined configuration object
export const chainConfigs: IndexerConfigs = {
  mainnet: mainnetConfig,
  unichain: unichainConfig,
  baseSepolia: baseSepoliaConfig,
  base: baseConfig,
  ink: inkConfig,
  monad: monadConfig,
  sepolia: sepoliaConfig,
  robinhood: robinhoodConfig
};

// Utility functions
export const getChainConfig = (network: keyof IndexerConfigs) => chainConfigs[network];

export const getChainById = (chainId: number) =>
  Object.values(chainConfigs).find(config => config.id === chainId);

export const getAllChainIds = () =>
  Object.values(chainConfigs).map(config => config.id);

export const getActiveChains = () =>
  Object.values(chainConfigs).filter(config =>
    config.addresses.shared.airlock !== "0x0000000000000000000000000000000000000000"
  );

// Lazily-built per-chain lowercase-address lookup for stock quote tokens.
// getQuoteInfo runs on every swap, so this must be a Map hit, not an array scan.
const stockTokenMaps = new Map<string, Map<string, StockTokenConfig>>();

export const getStockTokenConfig = (
  network: keyof IndexerConfigs,
  tokenAddress: string
): StockTokenConfig | undefined => {
  let map = stockTokenMaps.get(network);
  if (!map) {
    map = new Map();
    for (const stock of chainConfigs[network].addresses.stockTokens ?? []) {
      map.set(stock.address.toLowerCase(), stock);
    }
    stockTokenMaps.set(network, map);
  }
  return map.get(tokenAddress.toLowerCase());
};
