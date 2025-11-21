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

export const monadConfig: ChainConfig = {
  id: CHAIN_IDS.monad,
  name: "monad",
  startBlock: START_BLOCKS.monad,
  v4StartBlock: V4_START_BLOCKS.monad,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.monad,
  addresses: {
    v2: {
      factory: "0x182a927119d56008d921126764bf884221b10f59" as Address,
      v2Migrator: "0x136191b46478cab023cbc01a36160c4aad81677a" as Address,
      nimCustomV2Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v3: {
      v3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      lockableV3Initializer: "0x8b4c7db9121fc885689c0a50d5a1429f15aec2a0" as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      nimCustomV3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      poolManager: "0x188d586ddcf52439676ca21a244753fa19f9ea8e" as Address,
      dopplerDeployer: "0xaCE07c3c1D3b556D42633211f0Da71dc6F6d1c42" as Address,
      v4Initializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      stateView: "0x77395f3b2e73ae90843717371294fa97cc419d64" as Address,
      dopplerLens: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4MulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      v4ScheduledMulticurveInitializer: "0xce3099b2f07029b086e5e92a1573c5f5a3071783" as Address,
      v4ScheduledMulticurveInitializerHook: "0x580ca49389d83b019d07e17e99454f2f218e2dc0" as Address,
    },
    shared: {
      airlock: "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12" as Address,
      tokenFactory: "0xaa47d2977d622dbdfd33eef6a8276727c52eb4e5" as Address,
      universalRouter: "0x0d97dc33264bfc1c226207428a79b26757fb9dc3" as Address,
      governanceFactory:
        "0xfaafde6a5b658684cc5eb0c5c2c755b00a246f45" as Address,
      weth: "0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242" as Address,
      chainlinkEthOracle:
        "0x1B1414782B859871781bA3E4B0979b9ca57A0A04" as Address,
      fxHash: {
        fxhAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        fxhWethPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      },
      noice: {
        noiceAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        noiceWethPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address
      },
      monad: {
        monAddress: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address,
        monUsdcPool: "0x659bD0BC4167BA25c62E05656F78043E7eD4a9da" as Address,
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
      usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};
