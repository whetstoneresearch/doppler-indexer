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

export const mainnetConfig: ChainConfig = {
  id: CHAIN_IDS.mainnet,
  name: "mainnet",
  startBlock: START_BLOCKS.mainnet,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.mainnet,
  addresses: {
    v2: {
      factory: "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f" as Address,
      v2Migrator: "0x765875bff87614ce0581ee73b9fa663b71f3dff2" as Address,
      nimCustomV2Migrator: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
    },
    v3: {
      v3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      lockableV3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      nimCustomV3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
    },
    zora: {
      zoraFactory: COMMON_ADDRESSES.ZERO_ADDRESS,
      zoraTokenPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      zoraToken: COMMON_ADDRESSES.ZERO_ADDRESS,
      creatorCoinHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      contentCoinHook: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90" as Address,
      dopplerDeployer: "0xb35469ee64a87afd19b31615094fe3962d73e421" as Address,
      dopplerLens: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227" as Address,
      v4Initializer: "0x53b4c21a6cb61d64f636abbfa6e8e90e6558e8ad" as Address,
      v4Migrator: "0x0820a4d0173c17ece283f7bdaaf0f8876eb205f5" as Address,
      v4MigratorHook: "0x4053d4fa966cbdcc20ec62070ac8814de8bee500" as Address,
      v4MulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4MulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4ScheduledMulticurveInitializer: "0xf84378c9f39e0ff267f3101c88773359c5393876" as Address,
      v4ScheduledMulticurveInitializerHook:
        "0xc6a562cb5cbfa29bcb1bdccf903b8b8f2e4a2dc0" as Address,
      DopplerHookInitializer: "0xaa096f558f3d4c9226de77e7cc05f18e180b2544" as Address,
      RehypeHook: "0x97cad5684fb7cc2bed9a9b5ebfba67138f4f2503" as Address
    },
    shared: {
      airlock: "0xde3599a2ec440b296373a983c85c365da55d9dfa" as Address,
      tokenFactory: "0xe7df2a4520c26a2d4dedb3a7585bfbcd30eaba6e" as Address,
      universalRouter: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af" as Address,
      governanceFactory:
        "0xddae8b3ed08184682f7bc32b74d943ceefeab638" as Address,
      weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" as Address,
      chainlinkEthOracle:
        "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419" as Address,
      chainlinkUsdcOracle: "0xd30e2101a97dcbaebcbc04f14c3f624e67a35165" as Address,
      chainlinkUsdtOracle: "0x3ec8593f930ea45ea58c968260e6e9ff53fc934f" as Address,
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
    stables: {
      usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address,
      usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};