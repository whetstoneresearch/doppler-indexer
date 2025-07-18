import { IndexerConfigs } from "./types";
import { unichainConst } from "./unichain";
import { baseConst } from "./base";
import { inkConst } from "./ink";
import { baseSepoliaConst } from "./baseSepolia";
import { COMMON_ADDRESSES } from "./constants";

export * from "./types";
export * from "./constants";

// Combined configuration object
export const chainConfigs: IndexerConfigs = {
  base: baseConst,
  baseSepolia: baseSepoliaConst,
  unichain: unichainConst,
  ink: inkConst,
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