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

// Robinhood chain Doppler deployment.
//
// Doppler protocol addresses are taken from the Robinhood deployment manifest.
// Chain-specific values not part of that manifest (WETH, stables, chainlink
// oracles) are still left as ZERO_ADDRESS and marked TODO.
export const robinhoodConfig: ChainConfig = {
  id: CHAIN_IDS.robinhood,
  name: "robinhood",
  startBlock: START_BLOCKS.robinhood,
  v4StartBlock: V4_START_BLOCKS.robinhood,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.robinhood,
  addresses: {
    v2: {
      // No UniswapV2Factory in the Robinhood deployment (only used for unichain indexing).
      factory: COMMON_ADDRESSES.ZERO_ADDRESS,
      // UniswapV2MigratorSplit
      v2Migrator: "0xb05046cea797c993fb5b583098b1c4682e9da333" as Address,
      nimCustomV2Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v3: {
      // No plain UniswapV3Initializer deployed; Robinhood uses the lockable initializer.
      v3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      // LockableUniswapV3Initializer
      lockableV3Initializer:
        "0xde8886a0019ea060b8378ee37b8a23b8117f29a3" as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      nimCustomV3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      // Canonical Uniswap V4 PoolManager
      poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951" as Address,
      // DopplerDeployer
      dopplerDeployer: "0x4389ad34938b14f25cff7ed983c53f5a42a2573f" as Address,
      // UniswapV4Initializer
      v4Initializer: "0x6cce158b6d1747617fc218592b4d60b239b957ea" as Address,
      // Canonical Uniswap V4 StateView
      stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as Address,
      // DopplerLensQuoter
      dopplerLens: "0xf4c22465532f64777ffcd7770831aeca38f35c04" as Address,
      // No standalone UniswapV4Migrator / hook in the Robinhood deployment.
      v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      // No multicurve initializers deployed on Robinhood.
      v4MulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4ScheduledMulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4ScheduledMulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      DecayMulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      DecayMulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      // DopplerHookInitializer
      DopplerHookInitializer:
        "0x4e3468951d49f2eea976ed0d6e75ffcb44a9a544" as Address,
      RehypeHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      // RehypeDopplerHookMigrator
      RehypeDopplerHookMigrator:
        "0x1a0f286bb7f5967ae89c13d3425d5ce04c34cd27" as Address,
      // RehypeDopplerHookInitializer
      RehypeDopplerHookInitializer:
        "0x6f02324d20cc679d0e585290caa6b16bacbc0f77" as Address,
      // DopplerHookMigrator
      DopplerHookMigrator:
        "0x7bf319d8e969f7596b1bc171da9ce322f67ae0c4" as Address,
      // NoOpMigrator
      NoOpMigrator: "0xba2f330edb16cd8056f5988d8ce19bbc63475a0e" as Address,
    },
    zora: {
      // Zora is not deployed on Robinhood.
      zoraFactory: COMMON_ADDRESSES.ZERO_ADDRESS,
      zoraTokenPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      zoraToken: COMMON_ADDRESSES.ZERO_ADDRESS,
      creatorCoinHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      contentCoinHook: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    shared: {
      // Airlock
      airlock: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862" as Address,
      // DopplerERC20V1Factory
      tokenFactory: "0x1b37d3a72082029c44b35b604ea473617580b69a" as Address,
      // DN404Factory
      dn404Factory: "0x37a9fa204a4d3a429fded7e3469ab076c854bc9d" as Address,
      // Canonical Uniswap UniversalRouter
      universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904" as Address,
      // GovernanceFactory
      governanceFactory:
        "0xdeb0447dae3eb177c4dba8bbccca25c8f273b7ef" as Address,
      // WETH ("WETH", 18 dec) — discovered as a numeraire via V4 PoolManager pools.
      weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73" as Address,
      chainlinkEthOracle: COMMON_ADDRESSES.ZERO_ADDRESS, // TODO
      chainlinkUsdcOracle: COMMON_ADDRESSES.ZERO_ADDRESS, // TODO
      chainlinkUsdtOracle: COMMON_ADDRESSES.ZERO_ADDRESS, // TODO
      // Base-specific numeraire tokens; not present on Robinhood.
      fxHash: {
        fxhAddress: COMMON_ADDRESSES.ZERO_ADDRESS,
        fxhWethPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      },
      noice: {
        noiceAddress: COMMON_ADDRESSES.ZERO_ADDRESS,
        noiceWethPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      },
      monad: {
        monAddress: COMMON_ADDRESSES.ZERO_ADDRESS,
        monUsdcPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      },
      eurc: {
        eurcAddress: COMMON_ADDRESSES.ZERO_ADDRESS,
        eurcUsdcPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      },
      bankr: {
        bankrAddress: COMMON_ADDRESSES.ZERO_ADDRESS,
        bankrWethPool: COMMON_ADDRESSES.ZERO_ADDRESS,
      },
    },
    stables: {
      // No USDC/USDT deployed on Robinhood yet; fill these if/when they launch.
      usdc: COMMON_ADDRESSES.ZERO_ADDRESS,
      usdt: COMMON_ADDRESSES.ZERO_ADDRESS,
      // Robinhood's native stablecoin: USDG ("Global Dollar", 6 dec, $1-pegged).
      usdg: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};
