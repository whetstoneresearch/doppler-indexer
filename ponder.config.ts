import { createConfig, factory, mergeAbis } from "ponder";
import { getAbiItem } from "viem";
import {
  UniswapV3InitializerABI,
  UniswapV4InitializerABI,
  UniswapV3PoolABI,
  AirlockABI,
  DERC20ABI,
  DopplerABI,
  PoolManagerABI,
  UniswapV2PairABI,
  ZoraFactoryABI,
  ZoraV4HookABI,
  ZoraCreatorCoinABI,
  V4MigratorHookABI,
  V4MigratorABI,
  DopplerHookInitializerABI,
  DopplerHookMigratorABI,
  RehypeDopplerHookMigratorABI,
} from "./src/abis";
import { BLOCK_INTERVALS } from "./src/config/chains/constants";
import { chainConfigs, CHAIN_IDS } from "./src/config/chains";
import { LockableUniswapV3InitializerABI } from "@app/abis/v3-abis/LockableUniswapV3InitializerABI";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import { UniswapV2FactoryABI } from "@app/abis/UniswapV2Factory";
import { UniswapV4MulticurveInitializerHookABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerHookABI";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { UniswapV4ScheduledMulticurveInitializerHookABI } from "@app/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerHookABI";
import { UniswapV4ScheduledMulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerABI";

const { base, baseSepolia, monad, mainnet, sepolia } = chainConfigs;

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL,
    poolConfig: {
      max: 100,
    },
  },
  ordering: "multichain",
  chains: {
    mainnet: {
      id: CHAIN_IDS.mainnet,
      rpc: process.env.PONDER_RPC_URL_1,
    },
    sepolia: {
      id: CHAIN_IDS.sepolia,
      rpc: process.env.PONDER_RPC_URL_11155111,
    },
    base: {
      id: CHAIN_IDS.base,
      rpc: process.env.PONDER_RPC_URL_8453,
    },
    baseSepolia: {
      id: CHAIN_IDS.baseSepolia,
      rpc: process.env.PONDER_RPC_URL_84532,
    },
    monad: {
      id: CHAIN_IDS.monad,
      rpc: process.env.PONDER_RPC_URL_143,
    },
  },
  blocks: {
    BaseChainlinkEthPriceFeed: {
      chain: "base",
      startBlock: base.startBlock,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    // UnichainChainlinkEthPriceFeed: {
    //   chain: "unichain",
    //   startBlock: unichain.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    // },
    // InkChainlinkEthPriceFeed: {
    //   chain: "ink",
    //   startBlock: ink.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    // },
    ZoraUsdcPrice: {
      chain: "base",
      startBlock: 31058549,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    BaseSepoliaChainlinkEthPriceFeed: {
      chain: "baseSepolia",
      startBlock: baseSepolia.startBlock,
      interval: 99999999999999, // every 5 minutes
    },
    MonadChainlinkEthPriceFeed: {
      chain: "monad",
      startBlock: monad.startBlock,
      interval: BLOCK_INTERVALS.FIVE_MINUTES_MONAD,
    },
    MainnetChainlinkEthPriceFeed: {
      chain: "mainnet",
      startBlock: mainnet.startBlock,
      interval: BLOCK_INTERVALS.FIFTY_BLOCKS,
    },
    SepoliaChainlinkEthPriceFeed: {
      chain: "sepolia",
      startBlock: sepolia.startBlock,
      interval: BLOCK_INTERVALS.FIFTY_BLOCKS,
    },
    // BaseChainlinkUsdcPriceFeed: {
    //   chain: "base",
    //   startBlock: base.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    // BaseSepoliaChainlinkUsdcPriceFeed: {
    //   chain: "baseSepolia",
    //   startBlock: baseSepolia.startBlock,
    //   interval: 99999999999999,
    // },
    // InkChainlinkUsdcPriceFeed: {
    //   chain: "ink",
    //   startBlock: ink.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    // InkChainlinkUsdtPriceFeed: {
    //   chain: "ink",
    //   startBlock: ink.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    // UnichainChainlinkUsdcPriceFeed: {
    //   chain: "unichain",
    //   startBlock: unichain.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    // UnichainChainlinkUsdtPriceFeed: {
    //   chain: "unichain",
    //   startBlock: unichain.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    // MonadChainlinkUsdcPriceFeed: {
    //   chain: "monad",
    //   startBlock: monad.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    // MonadChainlinkUsdtPriceFeed: {
    //   chain: "monad",
    //   startBlock: monad.startBlock,
    //   interval: BLOCK_INTERVALS.FIVE_MINUTES,
    // },
    FxhWethPrice: {
      chain: "base",
      startBlock: 36178538,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    NoiceWethPrice: {
      chain: "base",
      startBlock: 30530166,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    MonadUsdcPrice: {
      chain: "monad",
      startBlock: monad.startBlock,
      interval: BLOCK_INTERVALS.FIVE_MINUTES_MONAD,
    },
    EurcUsdcPrice: {
      chain: "base",
      startBlock: 38212428,
      interval: BLOCK_INTERVALS.FIVE_MINUTES
    },
    BankrWethPrice: {
      chain: "base",
      startBlock: 41900609,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
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
        base: {
          startBlock: base.startBlock,
          address: base.addresses.shared.airlock,
        },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: ink.addresses.shared.airlock,
        // },
        monad: {
          startBlock: 34746368,
          address: monad.addresses.shared.airlock,
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.shared.airlock,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.shared.airlock,
        }
      },
    },
    MigrationPool: {
      abi: mergeAbis([UniswapV3PoolABI, UniswapV2PairABI]),
      chain: {
        base: {
          startBlock: base.startBlock,
          address: factory({
            address: base.addresses.shared.airlock,
            event: getAbiItem({
              abi: AirlockABI,
              name: "Migrate",
            }),
            parameter: "pool",
          }),
        },
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: factory({
        //     address: unichain.addresses.shared.airlock,
        //     event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
        //     parameter: "pool",
        //   }),
        // },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: factory({
        //     address: ink.addresses.shared.airlock,
        //     event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
        //     parameter: "pool",
        //   }),
        // },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: factory({
            address: mainnet.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
            parameter: "pool",
          }),
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: factory({
            address: sepolia.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
            parameter: "pool",
          }),
        },
      },
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        // unichain: {
        //   startBlock: unichain.startBlock,
        //   address: unichain.addresses.v3.v3Initializer,
        // },
        base: {
          startBlock: base.startBlock,
          address: base.addresses.v3.v3Initializer,
        },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: ink.addresses.v3.v3Initializer,
        // },
      },
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        // unichain: {
        //   startBlock: unichain.v4StartBlock,
        //   address: unichain.addresses.v4.v4Initializer,
        // },
        base: {
          startBlock: base.v4StartBlock,
          address: base.addresses.v4.v4Initializer,
        },
        // ink: {
        //   startBlock: ink.v4StartBlock,
        //   address: ink.addresses.v4.v4Initializer,
        // },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.v4Initializer,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.v4Initializer,
        },
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
        base: {
          startBlock: base.startBlock,
          address: factory({
            address: base.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: factory({
        //     address: ink.addresses.shared.airlock,
        //     event: getAbiItem({ abi: AirlockABI, name: "Create" }),
        //     parameter: "asset",
        //   }),
        // },
        monad: {
          startBlock: 34746368,
          address: factory({
            address: monad.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: factory({
            address: mainnet.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: factory({
            address: sepolia.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        },
      },
    },
    UniswapV3Migrator: {
      abi: UniswapV3MigratorAbi,
      chain: {
        base: {
          startBlock: base.startBlock, // hardcoded for now
          address: base.addresses.v3.v3Migrator,
        },
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
        base: {
          startBlock: base.startBlock,
          address: factory({
            address: base.addresses.v3.v3Initializer,
            event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        },
        // ink: {
        //   startBlock: ink.startBlock,
        //   address: factory({
        //     address: ink.addresses.v3.v3Initializer,
        //     event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
      },
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        base: {
          startBlock: base.startBlock,
          address: factory({
            address: base.addresses.v3.lockableV3Initializer,
            event: getAbiItem({
              abi: LockableUniswapV3InitializerABI,
              name: "Create",
            }),
            parameter: "poolOrHook",
          }),
        },
        monad: {
          startBlock: 34746370,
          address: factory({
            address: monad.addresses.v3.lockableV3Initializer,
            event: getAbiItem({
              abi: LockableUniswapV3InitializerABI,
              name: "Create"
            }),
            parameter: "poolOrHook"
          })
        }
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
        base: {
          startBlock: base.v4StartBlock,
          address: base.addresses.v4.poolManager,
        },
        // unichain: {
        //   startBlock: unichain.v4StartBlock,
        //   address: unichain.addresses.v4.poolManager,
        // },
        // ink: {
        //   startBlock: ink.v4StartBlock,
        //   address: ink.addresses.v4.poolManager,
        // },
        monad: {
          startBlock: monad.startBlock,
          address: monad.addresses.v4.poolManager
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.poolManager,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.poolManager,
        },
      },
    },
    UniswapV4MigratorHook: {
      abi: V4MigratorHookABI,
      chain: {
        base: {
          startBlock: base.v4StartBlock,
          address: base.addresses.v4.v4MigratorHook,
        },
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: base.addresses.v4.v4MigratorHook
        },
        // unichain: {
        //   startBlock: unichain.v4StartBlock,
        //   address: unichain.addresses.v4.v4MigratorHook,
        // },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.v4MigratorHook,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.v4MigratorHook,
        },
      },
    },
    UniswapV4Migrator: {
      abi: V4MigratorABI,
      chain: {
        base: {
          startBlock: base.v4StartBlock,
          address: base.addresses.v4.v4Migrator,
        },
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.v4Migrator,
        },
        // unichain: {
        //   startBlock: unichain.v4StartBlock,
        //   address: unichain.addresses.v4.v4Migrator,
        // },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.v4Migrator,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.v4Migrator,
        },
      },
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        base: {
          startBlock: base.v4StartBlock,
          address: factory({
            address: base.addresses.v4.v4Initializer,
            event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        },
        // unichain: {
        //   startBlock: unichain.v4StartBlock,
        //   address: factory({
        //     address: unichain.addresses.v4.v4Initializer,
        //     event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
        // ink: {
        //   startBlock: ink.v4StartBlock,
        //   address: factory({
        //     address: ink.addresses.v4.v4Initializer,
        //     event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
        //     parameter: "poolOrHook",
        //   }),
        // },
        monad: {
          startBlock: monad.startBlock,
          address: factory({
            address: monad.addresses.v4.v4ScheduledMulticurveInitializer,
            event: getAbiItem({ abi: UniswapV4ScheduledMulticurveInitializerABI, name: "Create"}),
            parameter: "poolOrHook"
          }),
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: factory({
            address: mainnet.addresses.v4.v4ScheduledMulticurveInitializer,
            event: getAbiItem({ abi: UniswapV4ScheduledMulticurveInitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: factory({
            address: sepolia.addresses.v4.v4ScheduledMulticurveInitializer,
            event: getAbiItem({ abi: UniswapV4ScheduledMulticurveInitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        },

      },
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
        base: {
          startBlock: base.startBlock,
          address: base.addresses.v3.lockableV3Initializer,
        },
        monad: {
          startBlock: 34746370,
          address: monad.addresses.v3.lockableV3Initializer
        }
      },
    },
    ZoraFactory: {
      abi: ZoraFactoryABI,
      chain: {
        base: {
          startBlock: 31058549,
          address: base.addresses.zora.zoraFactory,
        },
      },
    },
    // ZoraCoinV4: {
    //   abi: ZoraCoinABI,
    //   chain: {
    //     base: {
    //       startBlock: 31058549,
    //       address: factory({
    //         address: base.addresses.zora.zoraFactory,
    //         event: getAbiItem({ abi: ZoraFactoryABI, name: "CoinCreatedV4" }),
    //         parameter: "coin",
    //       }),
    //     },
    //   },
    // },
    ZoraCreatorCoinV4: {
      abi: ZoraCreatorCoinABI,
      chain: {
        base: {
          startBlock: 31058549,
          address: factory({
            address: base.addresses.zora.zoraFactory,
            event: getAbiItem({
              abi: ZoraFactoryABI,
              name: "CreatorCoinCreated",
            }),
            parameter: "coin",
          }),
        },
      },
    },
    // ZoraV4Hook: {
    //   abi: ZoraV4HookABI,
    //   chain: {
    //     base: {
    //       startBlock: 31058549,
    //       address: factory({
    //         address: base.addresses.zora.zoraFactory,
    //         event: getAbiItem({ abi: ZoraFactoryABI, name: "CoinCreatedV4" }),
    //         parameter: "poolKey.hooks",
    //       }),
    //     },
    //   },
    // },
    ZoraV4CreatorCoinHook: {
      abi: ZoraV4HookABI,
      chain: {
        base: {
          startBlock: 31058549,
          address: factory({
            address: base.addresses.zora.zoraFactory,
            event: getAbiItem({
              abi: ZoraFactoryABI,
              name: "CreatorCoinCreated",
            }),
            parameter: "poolKey.hooks",
          }),
        },
      },
    },
    UniswapV4MulticurveInitializer: {
      abi: UniswapV4MulticurveInitializerABI,
      chain: {
        base: {
          startBlock: 36178538,
          address: base.addresses.v4.v4MulticurveInitializer,
        },
      },
    },
    UniswapV4MulticurveInitializerHook: {
      abi: UniswapV4MulticurveInitializerHookABI,
      chain: {
        base: {
          startBlock: 36178538,
          address: base.addresses.v4.v4MulticurveInitializerHook,
        },
      },
    },
    UniswapV4ScheduledMulticurveInitializer: {
      abi: UniswapV4ScheduledMulticurveInitializerABI,
      chain: {
        base: {
          startBlock: 36659443,
          address: base.addresses.v4.v4ScheduledMulticurveInitializer,
        },
        monad: {
          startBlock: 34746368,
          address: monad.addresses.v4.v4ScheduledMulticurveInitializer,
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.v4ScheduledMulticurveInitializer,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.v4ScheduledMulticurveInitializer,
        },
      },
    },
    UniswapV4ScheduledMulticurveInitializerHook: {
      abi: UniswapV4ScheduledMulticurveInitializerHookABI,
      chain: {
        base: {
          startBlock: 36659444,
          address: base.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
        monad: {
          startBlock: 34746368,
          address: monad.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
      },
    },
    DecayMulticurveInitializer: {
      abi: UniswapV4ScheduledMulticurveInitializerABI,
      chain: {
        base: {
          startBlock: 42019831,
          address: base.addresses.v4.DecayMulticurveInitializer,
        },
      },
    },
    DecayMulticurveInitializerHook: {
      abi: UniswapV4ScheduledMulticurveInitializerHookABI,
      chain: {
        base: {
          startBlock: 42019829,
          address: base.addresses.v4.DecayMulticurveInitializerHook,
        },
      },
    },
    DopplerHookInitializer: {
      abi: DopplerHookInitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.DopplerHookInitializer,
        },
        base: {
          startBlock: base.v4StartBlock,
          address: base.addresses.v4.DopplerHookInitializer,
        },
        mainnet: {
          startBlock: mainnet.v4StartBlock,
          address: mainnet.addresses.v4.DopplerHookInitializer,
        },
        sepolia: {
          startBlock: sepolia.startBlock,
          address: sepolia.addresses.v4.DopplerHookInitializer,
        },
        monad: {
          startBlock: monad.startBlock,
          address: monad.addresses.v4.DopplerHookInitializer,
        },
      },
    },
    DopplerHookMigrator: {
      abi: DopplerHookMigratorABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.DopplerHookMigrator,
        },
      },
    },
    RehypeDopplerHookMigrator: {
      abi: RehypeDopplerHookMigratorABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.RehypeDopplerHookMigrator,
        },
      },
    },
  },
});
