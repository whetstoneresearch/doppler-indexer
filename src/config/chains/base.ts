import { Address, http, zeroAddress } from "viem";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  ORACLE_ADDRESSES,
  COMMON_ADDRESSES,
  RPC_ENV_VARS,
} from "./constants";
import { ChainConfig } from "ponder";
import { BLOCK_INTERVALS } from "../blocks";
import { baseSepolia } from "viem/chains";

interface IMetricRefresherConfig {
  startBlock: number;
  interval: number;
}

interface IMetricV4CheckpointRefresherConfig extends IMetricRefresherConfig {}

interface IAirlockContractConfig {
  startBlock: number;
  address: Address;
}

interface IUniswapInitializer {
  startBlock: number;
  address: Address;
}

interface IDopplerChainConfig {
  chain: ChainConfig;
  metricRefresher: IMetricRefresherConfig;
  metricV4CheckpointRefresher: IMetricV4CheckpointRefresherConfig;
  airlock: IAirlockContractConfig;
  uniswapV3Initializer: IUniswapInitializer;
  uniswapV4Initializer: IUniswapInitializer;
}

export const tmp: IDopplerChainConfig = {
  chain: {
    id: CHAIN_IDS.baseSepolia,
    rpc: http(process.env.PONDER_RPC_URL_84532),
  },
  metricRefresher: {
    startBlock: START_BLOCKS.baseSepolia,
    interval: BLOCK_INTERVALS.THOUSAND_BLOCKS,
  },
  metricV4CheckpointRefresher: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // every 50 blocks
  },
  airlock: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: "0x3411306ce66c9469bff1535ba955503c4bde1c6e" as Address,
  },
  uniswapV3Initializer: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47" as Address,
  },
  uniswapV4Initializer: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: "0xca2079706a4c2a4a1aa637dfb47d7f27fe58653f" as Address,
  },
};
