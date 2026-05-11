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
      dopplerLens: "0x43d0D97EC9241A8F05A264f94B82A1d2E600f2B3" as Address,
      v4Migrator: [
        "0x166109c4ee7fe69164631caa937daa5f5cebfef0",
        "0xd3b4cf7fd24381e90a4f012fc6c5976b87b9b3ce"
      ] as Address[],
      v4MigratorHook: [
        "0x45178a8d6d368d612b7552b217802b7f97262000",
        "0xd6fecff347c6203a41874e8d77de669b54e7a500"
      ] as Address[],
      v4MulticurveInitializer: [
        "0x65de470da664a5be139a5d812be5fda0d76cc951"
      ] as Address[],
      v4MulticurveInitializerHook:
        "0x892d3c2b4abeaaf67d52a7b29783e2161b7cad40" as Address,
      v4ScheduledMulticurveInitializer: [
        "0xa36715da46ddf4a769f3290f49af58bf8132ed8e" 
      ] as Address[],
      v4ScheduledMulticurveInitializerHook:
        "0x3e342a06f9592459d75721d6956b570f02ef2dc0" as Address,
      DecayMulticurveInitializer: 
        "0xd59ce43e53d69f190e15d9822fb4540dccc91178" as Address,
      DecayMulticurveInitializerHook:
        "0xbb7784a4d481184283ed89619a3e3ed143e1adc0" as Address,
      DopplerHookInitializer: [
        "0xaa096f558f3d4c9226de77e7cc05f18e180b2544",
        "0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544"
      ] as Address[],
      RehypeHook: [
        "0x97cad5684fb7cc2bed9a9b5ebfba67138f4f2503bb",
        "0x3ec4798a9b11e8243a8db99687f7a23597b96623"
      ] as Address[],
      RehypeDopplerHookMigrator: [
        "0xc3c9f4cfd1dc0a7837cc4b202b3455b4156a8005",
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
        "0x65b6737c7a897029afe54dbb61bc4a84b232e0c4"
      ] as Address[]
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
      },
      bankr: {
        bankrAddress: "0xaec085e5a5ce8d96a7bdd3eb3a62445d4f6ce703" as Address,
        bankrWethPool: "0x1220f66a1A58275403B683c670BA10B9C7f03178" as Address
      }
    },
    stables: {
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
      usdt: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2" as Address,
    },
    oracle: ORACLE_ADDRESSES,
  },
};
