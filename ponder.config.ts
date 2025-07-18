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

const devConfig = {
 database: dbSettings,
 ordering: "multichain" as const,
 chains: Object.assign({}, mainnetConfig.chains, baseSepoliaConfig.chains),
 blocks: Object.assign({}, mainnetConfig.blocks, baseSepoliaConfig.blocks),
 contracts: Object.assign({}, mainnetConfig.contracts, baseSepoliaConfig.contracts),
} as const;

const stageConfig = {
 database: dbSettings,
 ordering: "multichain" as const,
 chains: Object.assign({}, mainnetConfig.chains, baseSepoliaConfig.chains, baseConfig.chains),
 blocks: Object.assign({}, mainnetConfig.blocks, baseSepoliaConfig.blocks, baseConfig.blocks),
 contracts: Object.assign({}, mainnetConfig.contracts, baseSepoliaConfig.contracts, baseConfig.contracts),
} as const;

const cfg = settings.dopplerEnv === "stage" ? createConfig(stageConfig) : createConfig(devConfig);

console.log(JSON.stringify({ chains: cfg.chains, blocks: cfg.blocks }, null, 2));
console.log(settings.dopplerEnv);

export default cfg;