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
      RehypeDopplerHookMigrator: [
        "0x1a0f286bb7f5967ae89c13d3425d5ce04c34cd27",
        "0x975f9d1939cf6e4a3c9d99f9d41e6411cf4da23b"
      ] as Address[],
      // RehypeDopplerHookInitializer
      RehypeDopplerHookInitializer: [
        "0x6f02324d20cc679d0e585290caa6b16bacbc0f77",
        "0x9982538f41f2ae29ddb9d3d9307010052984fdbb"
      ] as Address[],
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
    // Robinhood tokenized equities/ETFs (18 dec) with a Chainlink USD feed
    // (8 dec, 24/5 market-hours updates). Token addresses are the canonical
    // Robinhood Stock Tokens: every one is a BeaconProxy deployed by
    // 0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046 with implementation
    // 0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2 (verified on Blockscout —
    // lookalike tokens with the same symbol exist, so check before adding).
    // Feed proxies from https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood
    // Stock tokens without a Chainlink feed (e.g. NFLX, QCOM) are omitted;
    // they fall through to unknown-quote-token handling.
    stockTokens: [
      { symbol: "AAPL", address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" as Address, chainlinkOracle: "0x6b22a786baa607d76728168703a39ea9c99f2cd0" as Address },
      { symbol: "AMD", address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc" as Address, chainlinkOracle: "0x943a29e7ae51a4798823ca9eed2ed533b2a22c72" as Address },
      { symbol: "AMZN", address: "0x12f190a9f9d7d37a250758b26824b97ce941bf54" as Address, chainlinkOracle: "0xd5a1508ced74c084ebf3cbe853e2c968fb2a651c" as Address },
      { symbol: "ASML", address: "0x47f93d52cbec7c6d2cfc080e154002370a60daea" as Address, chainlinkOracle: "0xb4106147e8cce40b7d46124090d373a71b70f87d" as Address },
      { symbol: "BABA", address: "0xad25ac6c84d497db898fa1e8387bf6af3532a1c4" as Address, chainlinkOracle: "0x62cc8f9b5f56a33c9c8a60c8b92779f523c4e984" as Address },
      { symbol: "CLSK", address: "0xcbb95bbf36099d34da091dc6fa6f49efa257cee3" as Address, chainlinkOracle: "0x810c12d3a554bc47fd39597fe3b3aac4941f50ef" as Address },
      { symbol: "COIN", address: "0x6330d8c3178a418788df01a47479c0ce7ccf450b" as Address, chainlinkOracle: "0xa3a468a452940b7d6b69991207b508c609a98ef2" as Address },
      { symbol: "CRCL", address: "0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5" as Address, chainlinkOracle: "0x6652edf64ba3731c4f2d3ce821a0fb1f1f6b482a" as Address },
      { symbol: "CRWV", address: "0x5f10a1c971b69e47e059e1dc91901b59b3fb49c3" as Address, chainlinkOracle: "0xe1b3aabcafad1c94708dc1367dcff8aa4407487c" as Address },
      { symbol: "EWY", address: "0x7f0abef0c07280f82c6a08ead09ded6bae2c13fc" as Address, chainlinkOracle: "0xefdf54610b62a7753ec30bdc380847c12d32e1d1" as Address },
      { symbol: "GME", address: "0x1b0e319c6a659f002271b69db8a7df2f911c153e" as Address, chainlinkOracle: "0x27c71df6a64fb476468edf256cf72c038bab5b67" as Address },
      { symbol: "GOOGL", address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3" as Address, chainlinkOracle: "0xf6f373a037c30f0e5010d854385ca89185ae638b" as Address },
      { symbol: "INTC", address: "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681" as Address, chainlinkOracle: "0x3f390c5c24628ac7c489515402235fead71d1913" as Address },
      { symbol: "IONQ", address: "0x558378e000d634a36593e338ebacdd6207640efe" as Address, chainlinkOracle: "0x22efec4919baf55f360e0edee4abeb26de4971eb" as Address },
      { symbol: "META", address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35" as Address, chainlinkOracle: "0x7c38c00c30bee9378381e7b6135d7283356d71b1" as Address },
      { symbol: "MSFT", address: "0xe93237c50d904957cf27e7b1133b510c669c2e74" as Address, chainlinkOracle: "0x45c3c877c15e6ba2ebb19ea114ea508d14c1af2e" as Address },
      { symbol: "MSTR", address: "0xec262a75e413fafd0df80480274532c79d42da09" as Address, chainlinkOracle: "0x396118bdfb181e6240e74d243f266b061c0edc3d" as Address },
      { symbol: "MU", address: "0xff080c8ce2e5feadaca0da81314ae59d232d4afd" as Address, chainlinkOracle: "0x425eefdcf05ed6526c3ce61af99429a228a6d596" as Address },
      { symbol: "NBIS", address: "0x9d9c6684f596f66a64c030b93a886d51fd4d7931" as Address, chainlinkOracle: "0xe1d87b116ba0fe898998f1d140339d1fa1e09705" as Address },
      { symbol: "NVDA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" as Address, chainlinkOracle: "0x379ec4f7c378f34a1b47e4f3cbebcbac3e8e9f15" as Address },
      { symbol: "ORCL", address: "0xb0992820e760d836549ba69bc7598b4af75dee03" as Address, chainlinkOracle: "0x0e6a64a2b58a6693a531e6c555f3a5d042eea844" as Address },
      { symbol: "PLTR", address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a" as Address, chainlinkOracle: "0x820abedff239034956b7a9d2f0a331f9f075eb4c" as Address },
      { symbol: "QQQ", address: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68" as Address, chainlinkOracle: "0x80901d846d5d7b030f26b480776ee3b29374c2ae" as Address },
      { symbol: "RGTI", address: "0x284358abc07f9359f19f4b5b4ac91901be2597ba" as Address, chainlinkOracle: "0x2a045cf1c49c61c166c036d2f06fa2d2d984f765" as Address },
      { symbol: "RKLB", address: "0x3b14c39e89d60d627b42a1a4ca45b5bb45fc12e2" as Address, chainlinkOracle: "0x045477bf65aef6f4f2386ad0164579e48381cc74" as Address },
      { symbol: "SGOV", address: "0x92fd66527192e3e61d4ddd13322aa222de86f9b5" as Address, chainlinkOracle: "0xa0df4ee0fff975306345875e3548fcc519577a11" as Address },
      { symbol: "SLV", address: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f" as Address, chainlinkOracle: "0x209b73908e92ae021826ed79609845451ecba2ce" as Address },
      { symbol: "SNDK", address: "0xb90a19ff0af67f7779aff50a882a9cff42446400" as Address, chainlinkOracle: "0xfb133fa4b7b385802b693a293606682df47109a3" as Address },
      { symbol: "SPCX", address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea" as Address, chainlinkOracle: "0xb265810950ba6c5c0ff821c9963014a56fd8bffb" as Address },
      { symbol: "SPY", address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c" as Address, chainlinkOracle: "0x319724394d3a0e3669269846abe664cd621f9f6a" as Address },
      { symbol: "TSLA", address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d" as Address, chainlinkOracle: "0x4a1166a659a55625345e9515b32adecea5547c38" as Address },
      { symbol: "TSM", address: "0x58ffe4a942d3885baa22d7520691f611ef09e7aa" as Address, chainlinkOracle: "0x874cf94aa8ec88fd9560094dd065f2fb3e41fc2f" as Address },
      { symbol: "USAR", address: "0xd917b029c761d264c6a312bbbcda868658ef86a6" as Address, chainlinkOracle: "0xa994d3684e8400a6c8078226925779fdee682dd9" as Address },
      { symbol: "USO", address: "0xa30fa36db767ad9ed3f7a60fc79526fb4d56d344" as Address, chainlinkOracle: "0x75a9c76ef439e2c7c2e5a34ab105ecfe3766431c" as Address },
    ],
  },
};
