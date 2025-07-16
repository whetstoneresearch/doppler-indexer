import { IndexerConfigs } from "./types";
import { unichainConfig } from "./unichain";
import { baseConfig } from "./base";
import { inkConfig } from "./ink";
import { baseSepoliaConfig } from "./baseSepolia";
import { mainnetConfig } from "./mainnet";

export * from "./types";
export * from "./constants";

// Combined configuration object
export const chainConfigs: IndexerConfigs = {
  mainnet: mainnetConfig,
  unichain: unichainConfig,
  baseSepolia: baseSepoliaConfig,
  base: baseConfig,
  ink: inkConfig,
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