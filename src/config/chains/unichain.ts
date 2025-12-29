import { Address } from "viem";
import { ChainConfig } from "./types";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  ORACLE_ADDRESSES,
  COMMON_ADDRESSES,
  RPC_ENV_VARS,
} from "./constants";

export const unichainConfig: ChainConfig = {
  id: CHAIN_IDS.unichain,
  name: "unichain",
  startBlock: START_BLOCKS.unichain,
  v4StartBlock: V4_START_BLOCKS.unichain,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.unichain,
  addresses: {
    v2: {
      factory: "0x1f98400000000000000000000000000000000002" as Address,
      v2Migrator: "0xf6023127f6E937091D5B605680056A6D27524bad" as Address,
      nimCustomV2Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v3: {
      v3Initializer: "0x9F4e56be80f08ba1A2445645EFa6d231E27b43ec" as Address,
      lockableV3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      nimCustomV3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      poolManager: "0x1F98400000000000000000000000000000000004" as Address,
      dopplerDeployer: "0xBEd386a1Fc62B6598c9b8d2BF634471B6Fe75EB7" as Address,
      v4Initializer: "0xA7A28cB18F73CDd591fa81ead6ffadf749c0d0a2" as Address,
      stateView: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2" as Address,
      dopplerLens: "0x166109C4EE7fE69164631Caa937dAA5F5cEbFef0" as Address,
      v4Migrator: "0x49f3fbb2dff7f3d03b622e3b2a6d3f2e6fdb2a5a" as Address,
      v4MigratorHook: "0x53C050d3B09C80024138165520Bd7c078D9e2000" as Address,
      v4MulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4MulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4ScheduledMulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4ScheduledMulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
    },
    shared: {
      airlock: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254" as Address,
      tokenFactory: "0x43d0D97EC9241A8F05A264f94B82A1d2E600f2B3" as Address,
      universalRouter: "0xef740bf23acae26f6492b10de645d6b98dc8eaf3" as Address,
      governanceFactory:
        "0x99C94B9Df930E1E21a4E4a2c105dBff21bF5c5aE" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
      chainlinkEthOracle:
        "0xED2B1ca5D7E246f615c2291De309643D41FeC97e" as Address,
      chainlinkUsdcOracle: "0xd15862fc3d5407a03b696548b6902d6464a69b8c" as Address,
      chainlinkUsdtOracle: "0x58fa68a373956285ddfb340edf755246f8dfca16" as Address,
      fxHash: {
        fxhAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        fxhWethPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      },
      noice: {
        noiceAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        noiceWethPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address
      },
      monad: {
        monAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        monUsdcPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      },
      eurc: {
        eurcAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        eurcUsdcPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      }
    },
    zora: {
      zoraFactory: COMMON_ADDRESSES.ZERO_ADDRESS,
      zoraTokenPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      zoraToken: COMMON_ADDRESSES.ZERO_ADDRESS,
      creatorCoinHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      contentCoinHook: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    stables: {
      usdc: "0x078d782b760474a361dda0af3839290b0ef57ad6" as Address,
      usdt: "0x9151434b16b9763660705744891fA906F660EcC5" as Address
    },
    oracle: ORACLE_ADDRESSES,
  },
};
