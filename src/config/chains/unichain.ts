import { Address, getAbiItem, http } from "viem";
import { IChainConfig } from "@app/types/config";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  COMMON_ADDRESSES,
} from "./constants";
import { AirlockABI, DERC20ABI, DopplerABI, UniswapV2PairABI, UniswapV3InitializerABI, UniswapV3PoolABI, UniswapV4InitializerABI } from "@app/abis";
import { BLOCK_INTERVALS } from "../blocks";
import { factory } from "ponder";

export const unichainConst: IChainConfig = {
  id: CHAIN_IDS.unichain,
  rpc: http(process.env.PONDER_RPC_URL_130),
  name: "unichain",
  startBlock: START_BLOCKS.unichain,
  v4StartBlock: V4_START_BLOCKS.unichain,
  oracleStartBlock: START_BLOCKS.mainnet,
  addresses: {
    v2: {
      factory: "0x1f98400000000000000000000000000000000002" as Address,
      v2Migrator: "0xf6023127f6E937091D5B605680056A6D27524bad" as Address,
    },
    v3: {
      v3Initializer: "0x9F4e56be80f08ba1A2445645EFa6d231E27b43ec" as Address,
      lockableV3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      poolManager: "0x1F98400000000000000000000000000000000004" as Address,
      dopplerDeployer: "0xBEd386a1Fc62B6598c9b8d2BF634471B6Fe75EB7" as Address,
      v4Initializer: "0xA7A28cB18F73CDd591fa81ead6ffadf749c0d0a2" as Address,
      stateView: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2" as Address,
      dopplerLens: "0x166109C4EE7fE69164631Caa937dAA5F5cEbFef0" as Address,
      v4Initializer2: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4InitializerSelfCorrecting: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    shared: {
      airlock: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254" as Address,
      tokenFactory: "0x43d0D97EC9241A8F05A264f94B82A1d2E600f2B3" as Address,
      universalRouter: "0xef740bf23acae26f6492b10de645d6b98dc8eaf3" as Address,
      governanceFactory: "0x99C94B9Df930E1E21a4E4a2c105dBff21bF5c5aE" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
    },
  },
};

export const unichainConfig = {
  chains: {
    unichain: {
      id: CHAIN_IDS.unichain,
      rpc: unichainConst.rpc,
    },
  },
  blocks: {
    MetricRefresher: {
      chain: {
        unichain: {
          startBlock: unichainConst.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS,
        }
      }
    },
    V4CheckpointsRefresher: {
      chain: {
        unichain: {
          startBlock: unichainConst.v4StartBlock,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS,
        }
      }
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        unichain: {
          startBlock: unichainConst.v4StartBlock,
          address: unichainConst.addresses.shared.airlock,
        }
      }
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        unichain: {
          startBlock: unichainConst.startBlock,
          address: unichainConst.addresses.v3.v3Initializer,
        }
      }
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        unichain: {
          startBlock: unichainConst.v4StartBlock,
          address: [
            unichainConst.addresses.v4.v4Initializer,
          ],
        }
      }
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        unichain: {
          startBlock: unichainConst.startBlock,
          address: factory({
            address: unichainConst.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        }
      }
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        unichain: {
          startBlock: unichainConst.startBlock,
          address: factory({
            address: unichainConst.addresses.v3.v3Initializer,
            event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        }
      }
    },
    UniswapV2Pair: {
      abi: UniswapV2PairABI,
      chain: {
        unichain: {
          startBlock: unichainConst.startBlock,
          address: factory({
            address: unichainConst.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
            parameter: "pool",
          }),
        }
      }
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        unichain: {
          startBlock: unichainConst.v4StartBlock,
          address: factory({
            address: [
              unichainConst.addresses.v4.v4Initializer,
            ],
            event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        }
      }
    },
  }
} as const;

// TBD: jank?
export type unichainConfig = typeof unichainConfig;