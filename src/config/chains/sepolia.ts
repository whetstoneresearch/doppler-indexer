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

export const sepoliaConfig: ChainConfig = {
  id: CHAIN_IDS.sepolia,
  name: "sepolia",
  startBlock: START_BLOCKS.sepolia,
  oracleStartBlock: START_BLOCKS.sepolia,
  rpcEnvVar: RPC_ENV_VARS.sepolia,
  addresses: {
    v2: {
      factory: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6" as Address,
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
      poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543" as Address,
      dopplerDeployer: "0xb35469ee64a87afd19b31615094fe3962d73e421" as Address,
      dopplerLens: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      stateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c" as Address,
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
      universalRouter: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b" as Address,
      governanceFactory:
        "0xddae8b3ed08184682f7bc32b74d943ceefeab638" as Address,
      weth: "0x7b79995e5f793a07bc00c21412e50ecae098e7f9" as Address,
      chainlinkEthOracle:
        "0x694AA1769357215DE4FAC081bf1f309aDC325306" as Address,
      chainlinkUsdcOracle: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E" as Address,
      chainlinkUsdtOracle: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
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
      },
      bankr: {
        bankrAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        bankrWethPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address
      }
    },
    stables: {
      usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
      usdt: "0x7169d38820dfd117c3fa1f22a697dba58d90ba06" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};