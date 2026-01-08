import { createConfig, factory, mergeAbis } from "ponder";
import { getAbiItem, http } from "viem";
import {
  UniswapV3InitializerABI,
  UniswapV4InitializerABI,
  V4MigratorHookABI,
  UniswapV3PoolABI,
  AirlockABI,
  DERC20ABI,
  DopplerABI,
  PoolManagerABI,
  UniswapV2PairABI,
  ZoraFactoryABI,
  ZoraV4HookABI,
  ZoraCoinABI,
  ZoraCreatorCoinABI,
  DopplerHookInitializerABI,
} from "./src/abis";
import { BLOCK_INTERVALS } from "./src/config/chains/constants";
import { chainConfigs, CHAIN_IDS } from "./src/config/chains";
import { LockableUniswapV3InitializerABI } from "@app/abis/v3-abis/LockableUniswapV3InitializerABI";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import {
  UniswapV4MulticurveInitializerABI,
  UniswapV4MulticurveInitializerHookABI,
  UniswapV4ScheduledMulticurveInitializerABI,
  UniswapV4ScheduledMulticurveInitializerHookABI,
} from "@app/abis/multicurve-abis";

const { base, unichain, ink, baseSepolia, monad } = chainConfigs;

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: "postgresql://postgres:postgres@localhost:5432/default",
    poolConfig: {
      max: 100,
    },
  },
  ordering: "multichain",
  chains: {
    baseSepolia: {
      id: CHAIN_IDS.baseSepolia,
      rpc: http(process.env.PONDER_RPC_URL_84532),
    },
    base: {
      id: CHAIN_IDS.base,
      rpc: http(process.env.PONDER_RPC_URL_8453),
    },
    unichain: {
      id: CHAIN_IDS.unichain,
      rpc: http(process.env.PONDER_RPC_URL_130),
    },
    ink: {
      id: CHAIN_IDS.ink,
      rpc: http(process.env.PONDER_RPC_URL_130),
    },
    monad: {
      id: CHAIN_IDS.monad,
      rpc: http(process.env.PONDER_RPC_URL_143),
    }
  },
  blocks: {
    BaseSepoliaChainlinkEthPriceFeed: {
      chain: "baseSepolia",
      startBlock: baseSepolia.startBlock,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    BaseChainlinkEthPriceFeed: {
      chain: "base",
      startBlock: base.startBlock,
      interval: 99999999999, // never run on testnet, just need this otherwise build fails...
    },
    UnichainChainlinkEthPriceFeed: {
      chain: "unichain",
      startBlock: unichain.startBlock,
      interval: 99999999999, // never run on testnet, just need this otherwise build fails...
    },
    InkChainlinkEthPriceFeed: {
      chain: "ink",
      startBlock: ink.startBlock,
      interval: 99999999999, // never run on testnet, just need this otherwise build fails...
    },
    MonadChainlinkEthPriceFeed: {
      chain: "monad",
      startBlock: monad.startBlock,
      interval: 99999999999
    },
    ZoraUsdcPrice: {
      chain: "base",
      startBlock: 31058549,
      interval: 99999999999, // never run on testnet, just need this otherwise build fails...
    },
    FxhWethPrice: {
      chain: "base",
      startBlock: 38094491,
      interval: 99999999999, // every 5 minutes
    },
    NoiceWethPrice: {
      chain: "base",
      startBlock: 38094491,
      interval: 99999999999, // every 5 minutes
    },
    MonadUsdcPrice: {
      chain: "monad",
      startBlock: 42295250,
      interval: 99999999999,
    },
    EurcUsdcPrice: {
      chain: "base",
      startBlock: 39224595,
      interval: 99999999999
    }
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.shared.airlock,
        },
      },
    },
    MigrationPool: {
      abi: mergeAbis([UniswapV3PoolABI, UniswapV2PairABI]),
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: factory({
            address: baseSepolia.addresses.shared.airlock,
            event: getAbiItem({
              abi: AirlockABI,
              name: "Migrate",
            }),
            parameter: "pool",
          }),
        },
      },
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v3.v3Initializer,
        },
      },
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: baseSepolia.addresses.v4.v4Initializer,
        },
      },
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: factory({
            address: baseSepolia.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        },
      },
    },
    UniswapV3Migrator: {
      abi: UniswapV3MigratorAbi,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock, // hardcoded for now
          address: baseSepolia.addresses.v3.v3Migrator,
        },
      },
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: factory({
            address: baseSepolia.addresses.v3.v3Initializer,
            event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        },
      },
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: factory({
            address: baseSepolia.addresses.v3.lockableV3Initializer,
            event: getAbiItem({
              abi: LockableUniswapV3InitializerABI,
              name: "Create",
            }),
            parameter: "poolOrHook",
          }),
        },
      },
    },
    UniswapV2PairUnichain: {
      abi: UniswapV2PairABI,
      chain: {},
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: baseSepolia.addresses.v4.poolManager,
        },
      },
    },
    UniswapV4MigratorHook: {
      abi: V4MigratorHookABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: baseSepolia.addresses.v4.v4MigratorHook,
        }
      },
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: factory({
            address: baseSepolia.addresses.v4.v4Initializer,
            event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        },
      },
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v3.lockableV3Initializer,
        },
      },
    },
    ZoraFactory: {
      abi: ZoraFactoryABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: baseSepolia.addresses.zora.zoraFactory,
        },
      },
    },
    // ZoraCoinV4: {
    //   abi: ZoraCoinABI,
    //   chain: {
    //     baseSepolia: {
    //       startBlock: baseSepolia.v4StartBlock,
    //       address: factory({
    //         address: baseSepolia.addresses.zora.zoraFactory,
    //         event: getAbiItem({ abi: ZoraFactoryABI, name: "CoinCreatedV4" }),
    //         parameter: "coin",
    //       }),
    //     },
    //   },
    // },
    ZoraCreatorCoinV4: {
      abi: ZoraCreatorCoinABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: factory({
            address: baseSepolia.addresses.zora.zoraFactory,
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
    //     baseSepolia: {
    //       startBlock: baseSepolia.v4StartBlock,
    //       address: factory({
    //         address: baseSepolia.addresses.zora.zoraFactory,
    //         event: getAbiItem({ abi: ZoraFactoryABI, name: "CoinCreatedV4" }),
    //         parameter: "poolKey.hooks",
    //       }),
    //     },
    //   },
    // },
    ZoraV4CreatorCoinHook: {
      abi: ZoraV4HookABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: factory({
            address: baseSepolia.addresses.zora.zoraFactory,
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
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.v4MulticurveInitializer,
        },
      },
    },
    UniswapV4MulticurveInitializerHook: {
      abi: UniswapV4MulticurveInitializerHookABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.v4MulticurveInitializerHook,
        },
      },
    },
    UniswapV4ScheduledMulticurveInitializer: {
      abi: UniswapV4ScheduledMulticurveInitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address: baseSepolia.addresses.v4.v4ScheduledMulticurveInitializer,
        },
      },
    },
    UniswapV4ScheduledMulticurveInitializerHook: {
      abi: UniswapV4ScheduledMulticurveInitializerHookABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.startBlock,
          address:
            baseSepolia.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
      },
    },
    DopplerHookInitializer: {
      abi: DopplerHookInitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepolia.v4StartBlock,
          address: baseSepolia.addresses.v4.dopplerHookInitializer,
        },
      },
    },
  },
});
