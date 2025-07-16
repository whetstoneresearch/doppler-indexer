import { createConfig, factory } from "ponder";
import { getAbiItem, http } from "viem";
import {
  UniswapV3InitializerABI,
  UniswapV4InitializerABI,
  UniswapV3PoolABI,
  AirlockABI,
  DERC20ABI,
  DopplerABI,
  PoolManagerABI,
  UniswapV2PairABI,
} from "./src/abis";
import { BLOCK_INTERVALS } from "@app/config/blocks/intervals";
import {
  chainConfigs,
  CHAIN_IDS,
  V4_START_BLOCKS,
  START_BLOCKS,
} from "./src/config/chains";
import { LockableUniswapV3InitializerABI } from "@app/abis/v3-abis/LockableUniswapV3InitializerABI";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import settings from "./settings";
import { baseSepoliaDopplerChainConfig } from "./src/config/chains/baseSepolia";

const { unichain, baseSepolia, ink, base } = chainConfigs;

const { enabledChains, dbSettings } = settings;

export default createConfig({
  database: dbSettings,
  ordering: "multichain",
  chains: {
    mainnet: {
      id: CHAIN_IDS.mainnet,
      rpc: http(process.env.PONDER_RPC_URL_1),
    },
    unichain: {
      id: CHAIN_IDS.unichain,
      rpc: http(process.env.PONDER_RPC_URL_130),
    },
    ...(enabledChains.includes("baseSepolia")
      ? { baseSepolia: baseSepoliaDopplerChainConfig.chain }
      : {}),
    ink: {
      id: CHAIN_IDS.ink,
      rpc: http(process.env.PONDER_RPC_URL_57073),
    },
    base: {
      id: CHAIN_IDS.base,
      rpc: http(process.env.PONDER_RPC_URL_8453),
    },
  },
  blocks: {
    ChainlinkEthPriceFeed: {
      chain: "mainnet",
      startBlock: START_BLOCKS.mainnet,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    MetricRefresher: {
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.metricRefresher,
            }
          : {}),
      },
    },
    V4CheckpointsRefresher: {
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.metricV4CheckpointRefresher,
            }
          : {}),
      },
    },
    PendingTokenImages: {
      chain: {
        // base: {
        //   startBlock: base.startBlock,
        //   interval: BLOCK_INTERVALS.THOUSAND_BLOCKS * 3, // Check every 3000 blocks
        // },
      },
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.airlock,
            }
          : {}),
      },
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Initializer,
            }
          : {}),
      },
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV4Initializer,
            }
          : {}),
      },
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? { baseSepolia: baseSepoliaDopplerChainConfig.derc20 }
          : {}),
      },
    },
    UniswapV3MigrationPool: {
      abi: UniswapV3PoolABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Migrator,
            }
          : {}),
      },
    },
    UniswapV3Migrator: {
      abi: UniswapV3MigratorAbi,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Migrator,
            }
          : {}),
      },
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Pool,
            }
          : {}),
      },
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.lockableUniswapV3Pool,
            }
          : {}),
      },
    },
    UniswapV2Pair: {
      abi: UniswapV2PairABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV2Pair,
            }
          : {}),
      },
    },
    UniswapV2PairUnichain: {
      abi: UniswapV2PairABI,
      chain: {},
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.poolManager,
            }
          : {}),
      },
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV4Pool,
            }
          : {}),
      },
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.lockableUniswapV3Initializer,
            }
          : {}),
      },
    },
  },
});
