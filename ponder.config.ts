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
  LOCKABLE_V3_INITIALIZER_START_BLOCKS,
  SELF_CORRECTING_V4_INITIALIZER_START_BLOCKS,
} from "./src/config/chains";
import { LockableUniswapV3InitializerABI } from "@app/abis/v3-abis/LockableUniswapV3InitializerABI";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import settings from "./settings";
import { baseSepoliaDopplerChainConfig } from "./src/config/chains/baseSepolia";

const { unichain, mainnet, baseSepolia, ink, base } = chainConfigs;

const { enabledChains, dbSettings } = settings;

export default createConfig({
  database: dbSettings,
  ordering: "multichain",
  chains: {
    mainnet: baseSepoliaDopplerChainConfig.chain,
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
      startBlock: mainnet.startBlock,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    MetricRefresher: {
      chain: {
        unichain: {
          startBlock: unichain.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS, // every 1000 blocks
        },
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: {
                startBlock: baseSepolia.startBlock,
                interval: BLOCK_INTERVALS.THOUSAND_BLOCKS, // every 1000 blocks
              },
            }
          : {}),
        ink: {
          startBlock: ink.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS, // every 1000 blocks
        },
        base: {
          startBlock: base.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS, // every 1000 blocks
        },
      },
    },
    V4CheckpointsRefresher: {
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: {
                startBlock: baseSepolia.v4StartBlock,
                interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // every 50 blocks
              },
            }
          : {}),
        base: {
          startBlock: base.v4StartBlock,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // every 50 blocks
        },
        unichain: {
          startBlock: unichain.v4StartBlock,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // every 50 blocks
        },
        ink: {
          startBlock: ink.v4StartBlock,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // every 50 blocks
        },
      },
    },
    PendingTokenImages: {
      chain: {
        base: {
          startBlock: base.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS * 3, // Check every 3000 blocks
        },
      },
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: unichain.addresses.shared.airlock,
        // },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: ink.addresses.shared.airlock,
        // },
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: {
                startBlock: V4_START_BLOCKS.baseSepolia,
                address: baseSepolia.addresses.shared.airlock,
              },
            }
          : {}),
        // base: {
        //   startBlock: base.startBlock,
        //   address: base.addresses.shared.airlock,
        // },
      },
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: unichain.addresses.v3.v3Initializer,
        // },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: ink.addresses.v3.v3Initializer,
        // },
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: {
                startBlock: V4_START_BLOCKS.baseSepolia,
                address: baseSepolia.addresses.v3.v3Initializer,
              },
            }
          : {}),
        // base: {
        //   startBlock: base.startBlock,
        //   address: base.addresses.v3.v3Initializer,
        // },
      },
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        // unichain: {
        //   startBlock: V4_START_BLOCKS.unichain,
        //   address: unichain.addresses.v4.v4Initializer,
        // },
        // ink: {
        //   startBlock: V4_START_BLOCKS.ink,
        //   address: ink.addresses.v4.v4Initializer,
        // },
        // baseSepolia: {
        //   startBlock: V4_START_BLOCKS.baseSepolia,
        //   address: baseSepolia.addresses.v4.v4Initializer,
        // },
        // base: {
        //   startBlock: V4_START_BLOCKS.base,
        //   address: base.addresses.v4.v4Initializer,
        // },
      },
      address: [],
    },
    // UniswapV4Initializer2: {
    //   abi: UniswapV4InitializerABI,
    //   chain: {
    //     // base: {
    //     //   startBlock: V4_START_BLOCKS.base,
    //     //   address: base.addresses.v4.v4Initializer2,
    //     // },
    //     // unichain: {
    //     //   startBlock: V4_START_BLOCKS.unichain,
    //     //   address: unichain.addresses.v4.v4Initializer2,
    //     // },
    //     // ink: {
    //     //   startBlock: V4_START_BLOCKS.ink,
    //     //   address: ink.addresses.v4.v4Initializer2,
    //     // },
    //   },
    // },
    UniswapV4InitializerSelfCorrecting: {
      abi: UniswapV4InitializerABI,
      chain: {
        // base: {
        //   startBlock: SELF_CORRECTING_V4_INITIALIZER_START_BLOCKS.base,
        //   address: base.addresses.v4.v4InitializerSelfCorrecting,
        // },
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: {
                startBlock: SELF_CORRECTING_V4_INITIALIZER_START_BLOCKS.baseSepolia,
                address: baseSepolia.addresses.v4.v4InitializerSelfCorrecting,
              },
            }
          : {}),
      },
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: factory({
        //     address: unichain.addresses.shared.airlock,
        //     event: getAbiItem({ abi: AirlockABI, name: "Create" }),
        //     parameter: "asset",
        //   }),
        // },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: factory({
        //     address: ink.addresses.shared.airlock,
        //     event: getAbiItem({ abi: AirlockABI, name: "Create" }),
        //     parameter: "asset",
        //   }),
        // },
        ...(enabledChains.includes("baseSepolia")
          ? { baseSepolia: baseSepoliaDopplerChainConfig.derc20 }
          : {}),
        // base: {
        //   startBlock: base.startBlock,
        //   address: factory({
        //     address: base.addresses.shared.airlock,
        //     event: getAbiItem({ abi: AirlockABI, name: "Create" }),
        //     parameter: "asset",
        //   }),
        // },
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
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: factory({
        //     address: unichain.addresses.v3.v3Initializer,
        //     event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: factory({
        //     address: ink.addresses.v3.v3Initializer,
        //     event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.uniswapV3Pool,
            }
          : {}),
        // base: {
        //   startBlock: base.startBlock,
        //   address: factory({
        //     address: base.addresses.v3.v3Initializer,
        //     event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
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
        // base: {
        //   startBlock: LOCKABLE_V3_INITIALIZER_START_BLOCKS.base,
        //   address: factory({
        //     address: base.addresses.v3.lockableV3Initializer,
        //     event: getAbiItem({ abi: LockableUniswapV3InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
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
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: factory({
        //     address: ink.addresses.shared.airlock,
        //     event: getAbiItem({
        //       abi: AirlockABI,
        //       name: "Migrate",
        //     }),
        //     parameter: "pool",
        //   }),
        // },
        // base: {
        //   startBlock: base.startBlock,
        //   address: factory({
        //     address: base.addresses.shared.airlock,
        //     event: getAbiItem({
        //       abi: AirlockABI,
        //       name: "Migrate",
        //     }),
        //     parameter: "pool",
        //   }),
        // },
      },
    },
    UniswapV2PairUnichain: {
      abi: UniswapV2PairABI,
      chain: {
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: factory({
        //     address: unichain.addresses.v2.factory,
        //     event: getAbiItem({
        //       abi: UniswapV2FactoryABI,
        //       name: "PairCreated",
        //     }),
        //     parameter: "pair",
        //   }),
        // },
      },
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {
        ...(enabledChains.includes("baseSepolia")
          ? {
              baseSepolia: baseSepoliaDopplerChainConfig.poolManager,
            }
          : {}),
        // base: {
        //   startBlock: V4_START_BLOCKS.base,
        //   address: base.addresses.v4.poolManager,
        // },
        // unichain: {
        //   startBlock: V4_START_BLOCKS.unichain,
        //   address: unichain.addresses.v4.poolManager,
        // },
        // ink: {
        //   startBlock: V4_START_BLOCKS.ink,
        //   address: ink.addresses.v4.poolManager,
        // },
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
        // base: {
        //   startBlock: V4_START_BLOCKS.base,
        //   address: factory({
        //     address: base.addresses.v4.v4Initializer,
        //     event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
        // unichain: {
        //   startBlock: V4_START_BLOCKS.unichain,
        //   address: factory({
        //     address: unichain.addresses.v4.v4Initializer,
        //     event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
        // ink: {
        //   startBlock: V4_START_BLOCKS.ink,
        //   address: factory({
        //     address: ink.addresses.v4.v4Initializer,
        //     event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
      },
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: LOCKABLE_V3_INITIALIZER_START_BLOCKS.baseSepolia,
          address: baseSepolia.addresses.v3.lockableV3Initializer,
        },
        // base: {
        //   startBlock: LOCKABLE_V3_INITIALIZER_START_BLOCKS.base,
        //   address: base.addresses.v3.lockableV3Initializer,
        // },
      },
    },
  },
});
