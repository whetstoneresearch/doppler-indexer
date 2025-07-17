import { createConfig } from "ponder";
import { http } from "viem";
import { BLOCK_INTERVALS } from "@app/config/blocks/intervals";
import {
  CHAIN_IDS,
  START_BLOCKS,
} from "./src/config/chains";
import settings from "./settings";
import { baseSepoliaConfig } from "./src/config/chains/baseSepolia";

const { dbSettings } = settings;

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

export const buildConfig = () => {
  const config = {
    database: dbSettings,
    ordering: "multichain" as const,
    chains: Object.assign({}, mainnetConfig.chains, baseSepoliaConfig.chains),
    blocks: Object.assign({}, mainnetConfig.blocks, baseSepoliaConfig.blocks),
    contracts: Object.assign({}, mainnetConfig.contracts, baseSepoliaConfig.contracts),
  }

  return config;
};

const config = buildConfig();

export default createConfig(config);
