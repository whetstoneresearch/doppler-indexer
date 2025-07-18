import { Address, getAbiItem, http, HttpTransport } from "viem";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  COMMON_ADDRESSES,
  LOCKABLE_V3_INITIALIZER_START_BLOCKS,
} from "./constants";
import { factory } from "ponder";
import { BLOCK_INTERVALS } from "../blocks";
import { AirlockABI, DERC20ABI, DopplerABI, LockableUniswapV3InitializerABI, PoolManagerABI, UniswapV2PairABI, UniswapV3InitializerABI, UniswapV3MigratorABI, UniswapV3PoolABI, UniswapV4InitializerABI } from "@app/abis";
import { IChainConfig } from "@app/types/config";

export const baseSepoliaConst: IChainConfig = {
  id: CHAIN_IDS.baseSepolia,
  rpc: http(process.env.PONDER_RPC_URL_84532),
  name: "baseSepolia",
  startBlock: START_BLOCKS.baseSepolia,
  v4StartBlock: V4_START_BLOCKS.baseSepolia,
  oracleStartBlock: START_BLOCKS.mainnet,
  addresses: {
    v2: {
      factory: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e" as Address,
      v2Migrator: "0x04a898f3722c38f9def707bd17dc78920efa977c" as Address,
    },
    v3: {
      v3Initializer: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47" as Address,
      lockableV3Initializer:
        "0x1fb8a108ff5c16213ebe3456314858d6b069a23b" as Address,
      v3Migrator: "0x0A3d3678b31cfF5F926c2A0384E742E4747605A0" as Address,
    },
    v4: {
      poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408" as Address,
      dopplerDeployer: "0x4bf819dfa4066bd7c9f21ea3db911bd8c10cb3ca" as Address,
      v4Initializer2: COMMON_ADDRESSES.ZERO_ADDRESS,
      dopplerLens: "0x4a8d81db741248a36d9eb3bc6ef648bf798b47a7" as Address,
      stateView: "0x571291b572ed32ce6751a2cb2486ebee8defb9b4" as Address,
      v4Initializer: "0xca2079706a4c2a4a1aa637dfb47d7f27fe58653f" as Address,
      v4Migrator: "0xe713efce3c639432fc3ca902f34edaf15ebcf3ac" as Address,
      v4MigratorHook: "0x508812fcdd4972a59b66eb2cad3772279c052000" as Address,
      v4InitializerSelfCorrecting:
        "0x8e891d249f1ecbffa6143c03eb1b12843aef09d3" as Address,
    },
    shared: {
      airlock: "0x3411306ce66c9469bff1535ba955503c4bde1c6e" as Address,
      tokenFactory: "0xc69ba223c617f7d936b3cf2012aa644815dbe9ff" as Address,
      universalRouter: "0x492e6456d9528771018deb9e87ef7750ef184104" as Address,
      governanceFactory:
        "0x9dbfaadc8c0cb2c34ba698dd9426555336992e20" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
    },
  },
};

// TODO: make some proper types
export const baseSepoliaConfig = {
  chains: {
    baseSepolia: {
      id: CHAIN_IDS.baseSepolia,
      rpc: baseSepoliaConst.rpc,
    },
  },
  blocks: {
    MetricRefresher: {
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS,
        }
      }
    },
    V4CheckpointsRefresher: {
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.v4StartBlock,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS,
        }
      }
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.v4StartBlock,
          address: baseSepoliaConst.addresses.shared.airlock,
        }
      }
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.startBlock,
          address: baseSepoliaConst.addresses.v3.v3Initializer,
        }
      }
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.v4StartBlock,
          address: [
            baseSepoliaConst.addresses.v4.v4Initializer,
            baseSepoliaConst.addresses.v4.v4Initializer2,
            baseSepoliaConst.addresses.v4.v4InitializerSelfCorrecting,
          ],
        }
      }
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.startBlock,
          address: factory({
            address: baseSepoliaConst.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        }
      }
    },
    UniswapV3Migrator: {
      abi: UniswapV3MigratorABI,
      chain: {
        baseSepolia: {
          // TODO: validate
          startBlock: 28245945,
          address: baseSepoliaConst.addresses.v3.v3Migrator,
        }
      }
    },
    UniswapV3MigrationPool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: {
          // TODO: validate
          startBlock: 28245945,
          address: factory({
            address: baseSepoliaConst.addresses.v3.v3Migrator,
            event: getAbiItem({ abi: UniswapV3MigratorABI, name: "Migrate" }),
            parameter: "pool",
          }),
        }
      }
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.startBlock,
          address: factory({
            address: baseSepoliaConst.addresses.v3.v3Initializer,
            event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        }
      }
    },
    LockableUniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        baseSepolia: {
          startBlock: LOCKABLE_V3_INITIALIZER_START_BLOCKS.baseSepolia,
          address: factory({
            address: baseSepoliaConst.addresses.v3.lockableV3Initializer,
            event: getAbiItem({ abi: LockableUniswapV3InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        }
      }
    },
    UniswapV2Pair: {
      abi: UniswapV2PairABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.startBlock,
          address: factory({
            address: baseSepoliaConst.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
            parameter: "pool",
          }),
        }
      }
    },
    PoolManager: {
      abi: PoolManagerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.v4StartBlock,
          address: baseSepoliaConst.addresses.v4.poolManager,
        }
      }
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.v4StartBlock,
          address: factory({
            address: [
              baseSepoliaConst.addresses.v4.v4Initializer,
              baseSepoliaConst.addresses.v4.v4Initializer2,
              baseSepoliaConst.addresses.v4.v4InitializerSelfCorrecting,
            ],
            event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        }
      }
    },
    LockableUniswapV3Initializer: {
      abi: LockableUniswapV3InitializerABI,
      chain: {
        baseSepolia: {
          startBlock: baseSepoliaConst.startBlock,
          address: baseSepoliaConst.addresses.v3.lockableV3Initializer,
        }
      }
    },
  }
} as const;

// TBD: jank?
export type BaseSepoliaConfig = typeof baseSepoliaConfig;
