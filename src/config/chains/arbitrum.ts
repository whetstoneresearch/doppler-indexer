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

// Arbitrum One Doppler deployment.
//
// Doppler protocol addresses come from the Arbitrum deployment manifest. The
// modules the Airlock actually accepts were read back from its SetModuleState
// logs at block 495566005:
//   TokenFactory       DopplerERC20V1Factory, DN404Factory
//   GovernanceFactory  GovernanceFactory, NoOpGovernanceFactory, LaunchpadGovernanceFactory
//   PoolInitializer    DopplerHookInitializer, UniswapV4Initializer, LockableUniswapV3Initializer
//   LiquidityMigrator  DopplerHookMigrator, UniswapV2MigratorSplit, NoOpMigrator
// The Rehype initializer/migrator are registered one level down, via
// SetDopplerHookState on the DopplerHookInitializer / DopplerHookMigrator; they
// still emit their own events, so they are indexed as their own sources.
//
// Uniswap/token/oracle addresses are not in that manifest and were verified
// on-chain: every Doppler V4 contract's poolManager() returns the PoolManager
// below, StateView and DopplerLensQuoter point at the same PoolManager,
// LockableUniswapV3Initializer.factory() is the canonical V3 factory, and
// UniswapV2MigratorSplit.factory() is the canonical V2 factory.
export const arbitrumConfig: ChainConfig = {
  id: CHAIN_IDS.arbitrum,
  name: "arbitrum",
  startBlock: START_BLOCKS.arbitrum,
  v4StartBlock: V4_START_BLOCKS.arbitrum,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.arbitrum,
  addresses: {
    v2: {
      // Canonical UniswapV2Factory (UniswapV2MigratorSplit.factory()). Only the
      // unichain pair-factory source reads this today; migrated V2 pairs are
      // picked up through the Airlock:Migrate factory instead.
      factory: "0xf1d7cc64fb4452f05c498126312ebe29f30fbcf9" as Address,
      // UniswapV2MigratorSplit
      v2Migrator: "0xb05046cea797c993fb5b583098b1c4682e9da333" as Address,
      nimCustomV2Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v3: {
      // No plain UniswapV3Initializer deployed; Arbitrum uses the lockable one.
      v3Initializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      // LockableUniswapV3Initializer
      lockableV3Initializer:
        "0xde8886a0019ea060b8378ee37b8a23b8117f29a3" as Address,
      v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      nimCustomV3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    v4: {
      // Canonical Uniswap V4 PoolManager
      poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32" as Address,
      // DopplerDeployer
      dopplerDeployer: "0x4389ad34938b14f25cff7ed983c53f5a42a2573f" as Address,
      // UniswapV4Initializer
      v4Initializer: "0x6cce158b6d1747617fc218592b4d60b239b957ea" as Address,
      // Canonical Uniswap V4 StateView
      stateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990" as Address,
      // DopplerLensQuoter
      dopplerLens: "0xf4c22465532f64777ffcd7770831aeca38f35c04" as Address,
      // No standalone UniswapV4Migrator / hook in the Arbitrum deployment.
      v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      // No multicurve initializers deployed on Arbitrum.
      v4MulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4MulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4ScheduledMulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      v4ScheduledMulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      DecayMulticurveInitializer: COMMON_ADDRESSES.ZERO_ADDRESS,
      DecayMulticurveInitializerHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      // DopplerHookInitializer
      DopplerHookInitializer:
        "0xaa7f809bb3752f715fa2e418230667c382a56544" as Address,
      // No separately-deployed rehype pool hook; the migrator is the only
      // rehype-side hook registered on this chain.
      RehypeHook: COMMON_ADDRESSES.ZERO_ADDRESS,
      // RehypeDopplerHookMigrator
      RehypeDopplerHookMigrator:
        "0x660740d7d6fb2c8998fa3fff459cceb9ac12c84b" as Address,
      // RehypeDopplerHookInitializer
      RehypeDopplerHookInitializer:
        "0x5f9eb5f6726fe88d5e39867967f5b833d2fa3215" as Address,
      // DopplerHookMigrator
      DopplerHookMigrator:
        "0x7bf319d8e969f7596b1bc171da9ce322f67ae0c4" as Address,
      // NoOpMigrator
      NoOpMigrator: "0xba2f330edb16cd8056f5988d8ce19bbc63475a0e" as Address,
    },
    zora: {
      // Zora is not deployed on Arbitrum.
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
      universalRouter: "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" as Address,
      // GovernanceFactory
      governanceFactory:
        "0xdeb0447dae3eb177c4dba8bbccca25c8f273b7ef" as Address,
      // Canonical WETH ("WETH", 18 dec)
      weth: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as Address,
      // Chainlink feeds (8 dec), verified live on-chain by description().
      chainlinkEthOracle:
        "0x639fe6ab55c921f74e7fac1ee960c0b6293ba612" as Address,
      chainlinkUsdcOracle:
        "0x50834f3163758fcc1df9973b6e91f0f0f0434ad3" as Address,
      chainlinkUsdtOracle:
        "0x3f3f5df88dc9f13eac63df89ec16ef6e7e25dde7" as Address,
      // Base-specific numeraire tokens; not present on Arbitrum.
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
      // Native Circle USDC ("USDC", 6 dec) — not the bridged USDC.e.
      usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as Address,
      // Tether USD₮0 ("USD₮0", 6 dec)
      usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" as Address,
      // USDG is not deployed on Arbitrum.
      usdg: COMMON_ADDRESSES.ZERO_ADDRESS,
    },
    oracle: ORACLE_ADDRESSES,
  },
};
