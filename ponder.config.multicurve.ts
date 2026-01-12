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
  ZoraCoinABI,
  ZoraCreatorCoinABI,
  V4MigratorHookABI,
  DopplerHookInitializerABI,
} from "./src/abis";
import { BLOCK_INTERVALS } from "./src/config/chains/constants";
import { chainConfigs, CHAIN_IDS } from "./src/config/chains";
import { LockableUniswapV3InitializerABI } from "@app/abis/v3-abis/LockableUniswapV3InitializerABI";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import { UniswapV4MulticurveInitializerHookABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerHookABI";
import { UniswapV4MulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4MulticurveInitializerABI";
import { UniswapV4ScheduledMulticurveInitializerHookABI } from "@app/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerHookABI";
import { UniswapV4ScheduledMulticurveInitializerABI } from "@app/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerABI";

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
      rpc: http(process.env.PONDER_RPC_URL_143)
    }
  },
  blocks: {
    BaseSepoliaChainlinkEthPriceFeed: {
      chain: "baseSepolia",
      startBlock: 31000617,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    BaseChainlinkEthPriceFeed: {
      chain: "base",
      startBlock: 36175538,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
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
    ZoraUsdcPrice: {
      chain: "base",
      startBlock: 31058549,
      interval: 99999999999, // never run on testnet, just need this otherwise build fails...
    },
    FxhWethPrice: {
      chain: "base",
      startBlock: 36175538,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    NoiceWethPrice: {
      chain: "base",
      startBlock: 30530166,
      interval: BLOCK_INTERVALS.FIVE_MINUTES, // every 5 minutes
    },
    MonadChainlinkEthPriceFeed: {
      chain: "base",
      startBlock: monad.startBlock,
      interval: 99999999999,
    },
    MonadUsdcPrice: {
      chain: "monad",
      startBlock: monad.startBlock,
      interval: 99999999999,
    },
    EurcUsdcPrice: {
      chain: "base",
      startBlock: 38212428,
      interval: 99999999999,
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        baseSepolia: {
        startBlock: 31000617,
          address: baseSepolia.addresses.shared.airlock,
        },
        base: {
          startBlock: 36178538,
          address: base.addresses.shared.airlock,
        },
      },
    },
    MigrationPool: {
      abi: mergeAbis([UniswapV3PoolABI, UniswapV2PairABI]),
      chain: {},
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {},
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {},
    },
    UniswapV4Initializer2: {
      abi: UniswapV4InitializerABI,
      chain: {},
    },
    UniswapV4InitializerSelfCorrecting: {
      abi: UniswapV4InitializerABI,
      chain: {},
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        base: {
          startBlock: 36178538,
          address: factory({
            address: base.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        },
        baseSepolia: {
          startBlock: 31000617,
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
      chain: {},
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {},
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {},
    },
    UniswapV2PairUnichain: {
      abi: UniswapV2PairABI,
      chain: {},
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {},
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {},
    },
    UniswapV4Pool2: {
      abi: DopplerABI,
      chain: {},
    },
    UniswapV4PoolSelfCorrecting: {
      abi: DopplerABI,
      chain: {},
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {},
    },
    ZoraFactory: {
      abi: ZoraFactoryABI,
      chain: {},
    },
    ZoraCoinV4: {
      abi: ZoraCoinABI,
      chain: {},
    },
    ZoraCreatorCoinV4: {
      abi: ZoraCreatorCoinABI,
      chain: {},
    },
    ZoraV4Hook: {
      abi: ZoraV4HookABI,
      chain: {},
    },
    ZoraV4CreatorCoinHook: {
      abi: ZoraV4HookABI,
      chain: {},
    },
    UniswapV4MulticurveInitializer: {
      abi: UniswapV4MulticurveInitializerABI,
      chain: {
        baseSepolia: {
          startBlock: 31000617,
          address: [baseSepolia.addresses.v4.v4MulticurveInitializer],
        },
        base: {
          startBlock: 36178538,
          address: base.addresses.v4.v4MulticurveInitializer,
        },
      },
    },
    UniswapV4MulticurveInitializerHook: {
      abi: UniswapV4MulticurveInitializerHookABI,
      chain: {
        baseSepolia: {
          startBlock: 31000617,
          address: [baseSepolia.addresses.v4.v4MulticurveInitializerHook],
        },
        base: {
          startBlock: 36178538,
          address: base.addresses.v4.v4MulticurveInitializerHook,
        },
      },
    },
    UniswapV4ScheduledMulticurveInitializer: {
      abi: UniswapV4ScheduledMulticurveInitializerABI,
      chain: {
        baseSepolia: {
          startBlock: 32169922,
          address: baseSepolia.addresses.v4.v4ScheduledMulticurveInitializer,
        },
        base: {
          startBlock: 36659443,
          address: base.addresses.v4.v4ScheduledMulticurveInitializer,
        },
      },
    },
    UniswapV4ScheduledMulticurveInitializerHook: {
      abi: UniswapV4ScheduledMulticurveInitializerHookABI,
      chain: {
        baseSepolia: {
          startBlock: 32169922,
          address: baseSepolia.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
        base: {
          startBlock: 36659444,
          address: base.addresses.v4.v4ScheduledMulticurveInitializerHook,
        },
      },
    },
    DopplerHookInitializer: {
      abi: DopplerHookInitializerABI,
      chain: {},
    },
    UniswapV4MigratorHook: {
      abi: V4MigratorHookABI,
      chain: {}
    }
  },
});
