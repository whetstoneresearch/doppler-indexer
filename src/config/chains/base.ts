import { Address } from "viem";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  ORACLE_ADDRESSES,
  COMMON_ADDRESSES,
  RPC_ENV_VARS,
} from "./constants";
import { IChainConfig } from "@app/types/config";

export const baseConfig: IChainConfig = {
  id: CHAIN_IDS.base,
  name: "base",
  startBlock: START_BLOCKS.base,
  v4StartBlock: V4_START_BLOCKS.base,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.base,
  addresses: {
    v2: {
      factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" as Address,
      v2Migrator: "0x5F3bA43D44375286296Cb85F1EA2EBfa25dde731" as Address,
    },
    v3: {
      v3Initializer: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5" as Address,
      lockableV3Initializer:
        "0xE0dC4012AC9C868F09c6e4b20d66ED46D6F258d0" as Address,
      v3Migrator: "0x9C18A677902d2068be71e1A6bb11051fb69C74d5" as Address,
    },
    v4: {
      poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b" as Address,
      dopplerDeployer: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056" as Address,
      v4Initializer: "0x8AF018e28c273826e6b2d5a99e81c8fB63729b07" as Address,
      v4Initializer2: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254" as Address,
      stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71" as Address,
      dopplerLens: "0x094d926a969b3024ca46d2186bf13fd5cdba9ce2" as Address,
      v4Migrator: "0xa24e35a5d71d02a59b41e7c93567626302da1958" as Address,
      v4MigratorHook: "0x1370ad7fda3b054eca3532a066b968433e736000" as Address,
      v4InitializerSelfCorrecting:
        "0x82Ac010C67f70BACf7655cd8948a4AD92A173CAC" as Address,
    },
    shared: {
      airlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12" as Address,
      tokenFactory: "0xFAafdE6a5b658684cC5eb0C5c2c755B00A246F45" as Address,
      universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43" as Address,
      governanceFactory:
        "0xb4deE32EB70A5E55f3D2d861F49Fb3D79f7a14d9" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
      // TODO: fix
      migrator: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};