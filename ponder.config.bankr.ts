import { createConfig, factory, mergeAbis } from "ponder";
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
  ZoraFactoryABI,
  ZoraV4HookABI,
  ZoraCreatorCoinABI,
  V4MigratorHookABI,
  V4MigratorABI,
  DopplerHookInitializerABI,
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
    connectionString: "postgresql://postgres:postgres@localhost:5432/default",
    poolConfig: {
      max: 100,
    },
  },
  ordering: "multichain",
  chains: {
    mainnet: {
      id: CHAIN_IDS.mainnet,
      rpc: http(process.env.PONDER_RPC_URL_1),
    },
    sepolia: {
      id: CHAIN_IDS.sepolia,
      rpc: http(process.env.PONDER_RPC_URL_11155111),
    },
    base: {
      id: CHAIN_IDS.base,
      rpc: http(process.env.PONDER_RPC_URL_8453),
    },
    baseSepolia: {
      id: CHAIN_IDS.baseSepolia,
      rpc: http(process.env.PONDER_RPC_URL_84532),
    },
    monad: {
      id: CHAIN_IDS.monad,
      rpc: http(process.env.PONDER_RPC_URL_143),
    },
  },
  blocks: {
    BaseChainlinkEthPriceFeed: {
      chain: "base",
      startBlock: 41900609,
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
      startBlock: 41900609,
      interval: 99999999999999, // every 5 minutes
    },
    BaseSepoliaChainlinkEthPriceFeed: {
      chain: "baseSepolia",
      startBlock: baseSepolia.startBlock,
      interval: 99999999999999, // every 5 minutes
    },
    MonadChainlinkEthPriceFeed: {
      chain: "monad",
      startBlock: monad.startBlock,
      interval: 99999999999999,
    },
    MainnetChainlinkEthPriceFeed: {
      chain: "mainnet",
      startBlock: mainnet.startBlock,
      interval: 99999999999999,
    },
    SepoliaChainlinkEthPriceFeed: {
      chain: "sepolia",
      startBlock: sepolia.startBlock,
      interval: 99999999999999,
    },
    // BaseChainlinkUsdcPriceFeed: {
    //   chain: "base",
    //   startBlock: 41900609,
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
      startBlock: 41900609,
      interval: 99999999999999, // every 5 minutes
    },
    NoiceWethPrice: {
      chain: "base",
      startBlock: 41900609,
      interval: 99999999999999, // every 5 minutes
    },
    MonadUsdcPrice: {
      chain: "monad",
      startBlock: monad.startBlock,
      interval: 99999999999999,
    },
    EurcUsdcPrice: {
      chain: "base",
      startBlock: 41900609,
      interval: 99999999999999
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
      },
    },
    MigrationPool: {
      abi: mergeAbis([UniswapV3PoolABI, UniswapV2PairABI]),
      chain: {
      },
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
      },
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
      },
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        base: {
          startBlock: 41900609,
          address: factory({
            address: base.addresses.v4.DecayMulticurveInitializer,
            event: getAbiItem({ abi: UniswapV4ScheduledMulticurveInitializerABI, name: "Create" }),
            parameter: "asset",
          }),
        },
      },
    },
    UniswapV3Migrator: {
      abi: UniswapV3MigratorAbi,
      chain: {
      },
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
      },
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
      },
    },
    UniswapV2PairUnichain: {
      abi: UniswapV2PairABI,
      chain: {
      },
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {
      },
    },
    UniswapV4MigratorHook: {
      abi: V4MigratorHookABI,
      chain: {
      },
    },
    UniswapV4Migrator: {
      abi: V4MigratorABI,
      chain: {
      },
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
      },
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
      },
    },
    ZoraFactory: {
      abi: ZoraFactoryABI,
      chain: {
      },
    },
    ZoraCreatorCoinV4: {
      abi: ZoraCreatorCoinABI,
      chain: {
      },
    },
    ZoraV4CreatorCoinHook: {
      abi: ZoraV4HookABI,
      chain: {
      },
    },
    UniswapV4MulticurveInitializer: {
      abi: UniswapV4MulticurveInitializerABI,
      chain: {
      },
    },
    UniswapV4MulticurveInitializerHook: {
      abi: UniswapV4MulticurveInitializerHookABI,
      chain: {
      },
    },
    UniswapV4ScheduledMulticurveInitializer: {
      abi: UniswapV4ScheduledMulticurveInitializerABI,
      chain: {
      },
    },
    UniswapV4ScheduledMulticurveInitializerHook: {
      abi: UniswapV4ScheduledMulticurveInitializerHookABI,
      chain: {
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
      },
    },
  },
});
