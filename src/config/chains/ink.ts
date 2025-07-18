import { Address, getAbiItem, http } from "viem";
import { IChainConfig } from "@app/types/config";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  COMMON_ADDRESSES,
} from "./constants";
import { AirlockABI, DERC20ABI, DopplerABI, UniswapV2PairABI, UniswapV3InitializerABI, UniswapV3PoolABI, UniswapV4InitializerABI } from "@app/abis";
import { BLOCK_INTERVALS } from "../blocks/intervals";
import { factory } from "ponder";

export const inkConst: IChainConfig = {
  id: CHAIN_IDS.ink,
  rpc: http(process.env.PONDER_RPC_URL_57073),
  name: "ink",
  startBlock: START_BLOCKS.ink,
  v4StartBlock: V4_START_BLOCKS.ink,
  oracleStartBlock: START_BLOCKS.mainnet,
  addresses: {
    v2: {
      factory: "0xfe57A6BA1951F69aE2Ed4abe23e0f095DF500C04" as Address,
      v2Migrator: "0x5F3bA43D44375286296Cb85F1EA2EBfa25dde731" as Address,
    },
    v3: {
      v3Initializer: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5" as Address,
      lockableV3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32" as Address,
      dopplerDeployer: "0x8b4C7DB9121FC885689C0A50D5a1429F15AEc2a0" as Address,
      v4Initializer: "0xC99b485499f78995C6F1640dbB1413c57f8BA684" as Address,
      v4Initializer2: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056" as Address,
      stateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990" as Address,
      dopplerLens: "0xCe3099B2F07029b086E5e92a1573C5f5A3071783" as Address,
      v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4InitializerSelfCorrecting: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
    },
    shared: {
      airlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12" as Address,
      tokenFactory: "0xFAafdE6a5b658684cC5eb0C5c2c755B00A246F45" as Address,
      universalRouter: "0x112908dac86e20e7241b0927479ea3bf935d1fa0" as Address,
      governanceFactory: "0xb4deE32EB70A5E55f3D2d861F49Fb3D79f7a14d9" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
    },
  },
};

// TODO: make some proper types
export const inkConfig = {
  chains: {
    ink: {
      id: CHAIN_IDS.ink,
      rpc: inkConst.rpc,
    },
  },
  blocks: {
    MetricRefresher: {
      chain: {
        ink: {
          startBlock: inkConst.startBlock,
          interval: BLOCK_INTERVALS.THOUSAND_BLOCKS,
        }
      }
    },
    V4CheckpointsRefresher: {
      chain: {
        ink: {
          startBlock: inkConst.v4StartBlock,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS,
        }
      }
    },
  },
  contracts: {
    Airlock: {
      abi: AirlockABI,
      chain: {
        ink: {
          startBlock: inkConst.v4StartBlock,
          address: inkConst.addresses.shared.airlock,
        }
      }
    },
    UniswapV3Initializer: {
      abi: UniswapV3InitializerABI,
      chain: {
        ink: {
          startBlock: inkConst.startBlock,
          address: inkConst.addresses.v3.v3Initializer,
        }
      }
    },
    UniswapV4Initializer: {
      abi: UniswapV4InitializerABI,
      chain: {
        ink: {
          startBlock: inkConst.v4StartBlock,
          address: [
            inkConst.addresses.v4.v4Initializer,
            inkConst.addresses.v4.v4Initializer2,
          ],
        }
      }
    },
    DERC20: {
      abi: DERC20ABI,
      chain: {
        ink: {
          startBlock: inkConst.startBlock,
          address: factory({
            address: inkConst.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Create" }),
            parameter: "asset",
          }),
        }
      }
    },
    UniswapV3Pool: {
      abi: UniswapV3PoolABI,
      chain: {
        ink: {
          startBlock: inkConst.startBlock,
          address: factory({
            address: inkConst.addresses.v3.v3Initializer,
            event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
            parameter: "poolOrHook",
          }),
        }
      }
    },
    UniswapV2Pair: {
      abi: UniswapV2PairABI,
      chain: {
        ink: {
          startBlock: inkConst.startBlock,
          address: factory({
            address: inkConst.addresses.shared.airlock,
            event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
            parameter: "pool",
          }),
        }
      }
    },
    UniswapV4Pool: {
      abi: DopplerABI,
      chain: {
        ink: {
          startBlock: inkConst.v4StartBlock,
          address: factory({
            address: [
              inkConst.addresses.v4.v4Initializer,
              inkConst.addresses.v4.v4Initializer2,
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
export type InkConfig = typeof inkConfig;