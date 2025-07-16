import { createConfig } from "ponder";
import { http } from "viem";
import { BLOCK_INTERVALS } from "@app/config/blocks/intervals";
import {
  CHAIN_IDS,
  START_BLOCKS,
} from "./src/config/chains";
import settings from "./settings";
import { baseSepoliaDopplerChainConfig } from "./src/config/chains/baseSepolia";
import { AirlockABI } from "@app/abis/AirlockABI";
import { UniswapV4InitializerABI } from "@app/abis/v4-abis/UniswapV4InitializerABI";
import { UniswapV3InitializerABI } from "@app/abis/v3-abis/UniswapV3InitializerABI";
import { DERC20ABI } from "@app/abis/DERC20ABI";
import { UniswapV3PoolABI } from "@app/abis/v3-abis/UniswapV3PoolABI";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import { UniswapV2PairABI } from "@app/abis/UniswapV2PairABI";
import { DopplerABI, LockableUniswapV3InitializerABI, PoolManagerABI } from "@app/abis";

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

const baseSepoliaConfig = {
  chains: {
    baseSepolia: {
      ...baseSepoliaDopplerChainConfig.chain,
    },
  },
  blocks: {
    MetricRefresher: {
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.metricRefresher,
      }
    },
    V4CheckpointsRefresher: {
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.metricV4CheckpointRefresher,
      }
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.airlock,
      }
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Initializer,
      }
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV4Initializer,
      }
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.derc20,
      }
    },
    UniswapV3MigrationPool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Migrator,
      }
    },
    UniswapV3Migrator: {
      abi: UniswapV3MigratorAbi,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Migrator,
      }
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Pool,
      }
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.lockableUniswapV3Pool,
      }
    },
    UniswapV2Pair: {
      abi: UniswapV2PairABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV2Pair,
      }
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.poolManager,
      }
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.uniswapV4Pool,
      }
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
        baseSepolia: baseSepoliaDopplerChainConfig.lockableUniswapV3Initializer,
      }
    },
  }
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

console.log(JSON.stringify({ end: { config } }, null, 2));  

export default createConfig(config);
