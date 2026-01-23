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
      lockableV3Initializer:
        "0x1fb8a108ff5c16213ebe3456314858d6b069a23b" as Address,
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
        "0xe713efce3c639432fc3ca902f34edaf15ebcf3ac",
        "0xf326d8cdb65a4ad334cfbdd7d3a3cb27be8b770d",
        "0xb2eC6559704467306D04322a5dC082B2af4562dD"
      ] as Address[],
      v4MigratorHook: [
        "0x508812fcdd4972a59b66eb2cad3772279c052000",
        "0x9d0c38a80647e53d5a8a319b39de2b66b8586500"
      ] as Address[],
      v4MulticurveInitializer: [
        "0x359b5952a254baaa0105381825daedb8986bb55c",        
        "0x1718405e58c61425cdc0083262bc9f72198f5232"
      ] as Address[],
      v4MulticurveInitializerHook: [
        "0x06f5bbb7e503c87d78b6811077d6572fd8a3ed40",
        "0x6a1061FC558dDe1E6fD0eFd641b370d435b56d40"
      ] as Address[],
      v4ScheduledMulticurveInitializer:
        "0x5c10d3e14aae2ef95619b25e907e013260e832e4" as Address,
      v4ScheduledMulticurveInitializerHook:
        "0x5d663f9c993deff2d17ce4232d75f347df7dadc0" as Address,
      DopplerHookInitializer: "0x98cd6478debe443069db863abb9626d94de9a544" as Address,
      RehypeHook: "0x636A756CeE08775CC18780F52dd90B634F18ad37" as Address
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
      }
    },
    stables: {
      usdc: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as Address,
      usdt: "0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};

export const baseConfig: ChainConfig = {
  id: CHAIN_IDS.base,
  name: "base",
  startBlock: START_BLOCKS.base,
  v4StartBlock: V4_START_BLOCKS.base,
  oracleStartBlock: START_BLOCKS.mainnet,
  zoraStartBlock: 26602741,
  rpcEnvVar: RPC_ENV_VARS.base,
  addresses: {
    v2: {
      factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" as Address,
      v2Migrator: "0x5F3bA43D44375286296Cb85F1EA2EBfa25dde731" as Address,
      nimCustomV2Migrator: "0xf76b53f9bc94f531add7b980f119cf386ebf0cb8" as Address,
    },
    v3: {
      v3Initializer: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5" as Address,
      lockableV3Initializer:
        "0xE0dC4012AC9C868F09c6e4b20d66ED46D6F258d0" as Address,
      v3Migrator: "0x9C18A677902d2068be71e1A6bb11051fb69C74d5" as Address,
      nimCustomV3Migrator: "0x4fb11B8B6aa5B0861A39F6127aE3f91F0763C03e" as Address,
    },
    v4: {
      poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b" as Address,
      dopplerDeployer: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056" as Address,
      v4Initializer: [
        "0x8AF018e28c273826e6b2d5a99e81c8fB63729b07", 
        "0x77EbfBAE15AD200758E9E2E61597c0B07d731254", 
        "0x82Ac010C67f70BACf7655cd8948a4AD92A173CAC", 
        "0xED344444633B965cd148F8fFCE3765938A179094",
        "0x53b4c21a6Cb61D64F636ABBfa6E8E90E6558e8ad"
      ] as Address[],
      stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71" as Address,
      dopplerLens: "0x094d926a969b3024ca46d2186bf13fd5cdba9ce2" as Address,
      v4Migrator: [
        "0xa24e35a5d71d02a59b41e7c93567626302da1958",
        "0x166109c4ee7fe69164631caa937daa5f5cebfef0"
      ] as Address[],
      v4MigratorHook: [
        "0x1370ad7fda3b054eca3532a066b968433e736000",
        "0x45178a8d6d368d612b7552b217802b7f97262000"
      ] as Address[],
      v4MulticurveInitializer:
        "0x65de470da664a5be139a5d812be5fda0d76cc951" as Address,
      v4MulticurveInitializerHook:
        "0x892d3c2b4abeaaf67d52a7b29783e2161b7cad40" as Address,
      v4ScheduledMulticurveInitializer:
        "0xa36715da46ddf4a769f3290f49af58bf8132ed8e" as Address,
      v4ScheduledMulticurveInitializerHook:
        "0x3e342a06f9592459d75721d6956b570f02ef2dc0" as Address,
      DopplerHookInitializer: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      RehypeHook: COMMON_ADDRESSES.ZERO_ADDRESS as Address
    },
    zora: {
      zoraFactory: "0x777777751622c0d3258f214F9DF38E35BF45baF3" as Address,
      zoraTokenPool: "0xedc625b74537ee3a10874f53d170e9c17a906b9c" as Address,
      zoraToken: "0x1111111111166b7FE7bd91427724B487980aFc69" as Address,
      creatorCoinHook: "0xd61A675F8a0c67A73DC3B54FB7318B4D91409040" as Address,
      contentCoinHook: "0x9ea932730A7787000042e34390B8E435dD839040" as Address,
    },
    shared: {
      airlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12" as Address,
      tokenFactory: "0xFAafdE6a5b658684cC5eb0C5c2c755B00A246F45" as Address,
      universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43" as Address,
      governanceFactory:
        "0xb4deE32EB70A5E55f3D2d861F49Fb3D79f7a14d9" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
      chainlinkEthOracle:
        "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as Address,
      chainlinkUsdcOracle: "0x7e860098f58bbfc8648a4311b374b1d669a2bc6b" as Address,
      chainlinkUsdtOracle: "0xf19d560eb8d2adf07bd6d13ed03e1d11215721f9" as Address,
      fxHash: {
        fxhAddress: "0x5fc2843838e65eb0b5d33654628f446d54602791" as Address,
        fxhWethPool: "0xC3e7433ae4d929092F8dFf62F7E2f15f23bC3E63" as Address,
      },
      noice: {
        noiceAddress: "0x9cb41fd9dc6891bae8187029461bfaadf6cc0c69" as Address,
        noiceWethPool: "0xeff7f8fe083d7a446717b992bf84391253e54789" as Address
      },
      monad: {
        monAddress: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
        monUsdcPool: COMMON_ADDRESSES.ZERO_ADDRESS as Address,
      },
      eurc: {
        eurcAddress: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42" as Address,
        eurcUsdcPool: "0xb18fad93e3c5a5f932d901f0c22c5639a832d6f29a4392fff3393fb734dd0720" as Address
      }
    },
    stables: {
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
      usdt: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};
