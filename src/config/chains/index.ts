import { IndexerConfigs } from "./types";
import { unichainConst } from "./unichain";
import { baseConst } from "./base";
// import { inkConfig } from "./ink";
import { baseSepoliaConst } from "./baseSepolia";
import { mainnetConfig } from "./mainnet";
import { COMMON_ADDRESSES } from "./constants";

export * from "./types";
export * from "./constants";

// Combined configuration object
export const chainConfigs: IndexerConfigs = {
  mainnet: mainnetConfig,
  unichain: unichainConst,
  base: baseConst,
  // ink: inkConfig,
  baseSepolia: baseSepoliaConst, // TODO: whack naming
};

// Utility functions
export const getChainConfig = (network: keyof IndexerConfigs) => chainConfigs[network];

export const getChainById = (chainId: number) =>
  Object.values(chainConfigs).find(config => config.id === chainId);

export const getAllChainIds = () =>
  Object.values(chainConfigs).map(config => config.id);

export const getActiveChains = () =>
  Object.values(chainConfigs).filter(config =>
    config.addresses.shared.airlock !== COMMON_ADDRESSES.ZERO_ADDRESS
  );