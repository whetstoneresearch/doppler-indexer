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

export const baseSepoliaConfig: ChainConfig = {
  id: CHAIN_IDS.baseSepolia,
  name: "baseSepolia",
  startBlock: START_BLOCKS.baseSepolia,
  v4StartBlock: V4_START_BLOCKS.baseSepolia,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.baseSepolia,
  addresses: {
    v2: {
      factory: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e" as Address,
      v2Migrator: "0x04a898f3722c38f9def707bd17dc78920efa977c" as Address,
      nimCustomV2Migrator: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
    },
    v3: {
      v3Initializer: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47" as Address,
      lockableV3Initializer: [
        "0x1fb8a108ff5c16213ebe3456314858d6b069a23b",
        "0x16AdA5Be50C3c2D94Af5fEae6b539C40A78Ad53c"
      ] as Address[],
      v3Migrator: "0x0A3d3678b31cfF5F926c2A0384E742E4747605A0" as Address,
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
      poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408" as Address,
      dopplerDeployer: "0x4bf819dfa4066bd7c9f21ea3db911bd8c10cb3ca" as Address,
      dopplerLens: "0x4a8d81db741248a36d9eb3bc6ef648bf798b47a7" as Address,
      stateView: "0x571291b572ed32ce6751a2cb2486ebee8defb9b4" as Address,
      v4Initializer: [
        "0xca2079706a4c2a4a1aa637dfb47d7f27fe58653f",
        "0x832e4763deecb9941a768f2bbd18583219f018cc",
        "0x8e891d249f1ecbffa6143c03eb1b12843aef09d3",
        "0x870386944938130457606451820a351420888434",
        "0x53b4c21a6Cb61D64F636ABBfa6E8E90E6558e8ad"
      ] as Address[],
      v4Migrator: [
        "0xf326d8cdb65a4ad334cfbdd7d3a3cb27be8b770d",
        "0xeee0eccb54398ce371caacbcef076d3ed597ddb3"
      ] as Address[],
      v4MigratorHook: [
        "0x9d0c38a80647e53d5a8a319b39de2b66b8586500",
        "0x127caaad598ffa97577940b0a5c3b6150019e500"
      ] as Address[],
      v4MulticurveInitializer: [
        "0x359b5952a254baaa0105381825daedb8986bb55c",        
        "0x1718405e58c61425cdc0083262bc9f72198f5232"
      ] as Address[],
      v4MulticurveInitializerHook: [
        "0x06f5bbb7e503c87d78b6811077d6572fd8a3ed40",
        "0x6a1061FC558dDe1E6fD0eFd641b370d435b56d40"
      ] as Address[],
      v4ScheduledMulticurveInitializer: [
        "0x5c10d3e14aae2ef95619b25e907e013260e832e4",
        "0xF84378C9F39e0FF267f3101c88773359c5393876"
      ] as Address[],
      v4ScheduledMulticurveInitializerHook: [
        "0x5d663f9c993deff2d17ce4232d75f347df7dadc0",
        "0xc6a562cb5CbFA29BCB1bDCCF903b8B8f2E4A2DC0"
      ] as Address[],
      DecayMulticurveInitializer: [
        "0xd59ce43e53d69f190e15d9822fb4540dccc91178",
        "0x8652ee6a8e0002d38ef1ab204782227c7723a292"
      ] as Address[],
      DecayMulticurveInitializerHook: [
        "0xbb7784a4d481184283ed89619a3e3ed143e1adc0",
        "0x1ef6b7f2c23e4b0174cae2e6c44141a2591c6dc0"
      ] as Address[],
      DopplerHookInitializer: [
        "0x98cd6478debe443069db863abb9626d94de9a544",
        "0xaa096f558f3d4c9226de77e7cc05f18e180b2544",
        "0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544"
       ] as Address[],
      RehypeHook: [
        "0x0ed4c733f2642bd947b464a05acc848a9580eae7",
        "0x97cad5684fb7cc2bed9a9b5ebfba67138f4f2503",
        "0x636A756CeE08775CC18780F52dd90B634F18ad37",
        "0x3ec4798a9b11e8243a8db99687f7a23597b96623"
       ] as Address[],
      RehypeDopplerHookMigrator: [
        "0x2497969a9d38045e7bd3d632af9685d9fd774ca1",
        "0xc3c9f4cfd1dc0a7837cc4b202b3455b4156a8005",
        "0x6477ae25bca3db3911af7cbb48a0ace38692720b",
        "0x82d5e22911fbbcb8d3e45812d74ee6203c5824e0",
        "0xd199e7836e91654c0475a90e0c1d0e402bb84372",
        "0xea95DfdF69B90c65C827070852F7039D6aF6Dd7b"
      ] as Address[],
      RehypeDopplerHookInitializer: [
        "0xC918c6Edb8e0B62B5B73B3F812249a986ba8066d",
        "0x6ab5ae3191c914de8437431091776fc90f314be4",
        "0xBF4195ab0B03e1eB3345dd1e83BeD7650b1ed123"
      ] as Address[],
      DopplerHookMigrator: [
        "0x1e40b0875dda35f41e15cfb475403859b8c860c4",
        "0x65b6737c7a897029afe54dbb61bc4a84b232e0c4",
        "0xf848fea3329185529b50228bcb36f3b5a60960c4",
        "0x8bbbe586f9a902c15a759fc134a99a2d28bc20c4"
      ] as Address[],
      NoOpMigrator: "0xF11066abbd329ac4bBA39455340539322C222eb0" as Address,
    },
    shared: {
      airlock: "0x3411306ce66c9469bff1535ba955503c4bde1c6e" as Address,
      tokenFactory: "0xc69ba223c617f7d936b3cf2012aa644815dbe9ff" as Address,
      universalRouter: "0x492e6456d9528771018deb9e87ef7750ef184104" as Address,
      governanceFactory:
        "0x9dbfaadc8c0cb2c34ba698dd9426555336992e20" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
      chainlinkEthOracle:
        "0x5b0cf2b36a65a6BB085D501B971e4c102B9Cd473" as Address,
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
      },
      bankr: {
        bankrAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        bankrWethPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address
      }
    },
    stables: {
      usdc: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as Address,
      usdt: "0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};
