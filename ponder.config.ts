import { createConfig } from "ponder";
import { http } from "viem";
import { BLOCK_INTERVALS } from "@app/config/blocks/intervals";
import {
  CHAIN_IDS,
  START_BLOCKS,
} from "./src/config/chains";
import settings, { DopplerEnv } from "./settings";
import { baseSepoliaConfig } from "./src/config/chains/baseSepolia";
import { baseConfig } from "@app/config/chains/base";
import { unichainConfig } from "@app/config/chains/unichain";
import { inkConfig } from "@app/config/chains/ink";

const { dbSettings, dopplerEnv } = settings;

const mainnetConfig = {
  chains: {
    mainnet: {
      id: CHAIN_IDS.mainnet,
      rpc: http(process.env.PONDER_RPC_URL_1),
    },
  },
  blocks: {
    ChainlinkEthPriceFeed: {
      chain: "mainnet",
      startBlock: START_BLOCKS.mainnet,
      interval: BLOCK_INTERVALS.FIVE_MINUTES,
    },
  },
  contracts: {},
} as const;

export const buildConfig = (env: DopplerEnv) => {
  const devConfig = {
    database: dbSettings,
    ordering: "multichain" as const,
    chains: Object.assign({}, mainnetConfig.chains, baseSepoliaConfig.chains),
    blocks: Object.assign({}, mainnetConfig.blocks, baseSepoliaConfig.blocks),
    contracts: Object.assign({}, mainnetConfig.contracts, baseSepoliaConfig.contracts),
  }

  const stageConfig = {
    database: dbSettings,
    ordering: "multichain" as const,
    chains: Object.assign({}, mainnetConfig.chains, baseSepoliaConfig.chains, baseConfig.chains),
    blocks: Object.assign({}, mainnetConfig.blocks, baseSepoliaConfig.blocks, baseConfig.blocks),
    contracts: Object.assign({}, mainnetConfig.contracts, baseSepoliaConfig.contracts, baseConfig.contracts),
  }

  const prodConfig = {
    database: dbSettings,
    ordering: "multichain" as const,
    chains: Object.assign({}, mainnetConfig.chains, baseSepoliaConfig.chains, baseConfig.chains, unichainConfig.chains, inkConfig.chains),
    blocks: Object.assign({}, mainnetConfig.blocks, baseSepoliaConfig.blocks, baseConfig.blocks, unichainConfig.blocks, inkConfig.blocks),
    contracts: Object.assign({}, mainnetConfig.contracts, baseSepoliaConfig.contracts, baseConfig.contracts, unichainConfig.contracts, inkConfig.contracts),
  }

  return env === "dev" ? devConfig : stageConfig;
};

const config = buildConfig(dopplerEnv);

export default createConfig(config);
