import { Address, getAbiItem, http } from "viem";
import {
  CHAIN_IDS,
  START_BLOCKS,
  V4_START_BLOCKS,
  ORACLE_ADDRESSES,
  COMMON_ADDRESSES,
  RPC_ENV_VARS,
  LOCKABLE_V3_INITIALIZER_START_BLOCKS,
} from "./constants";
import { factory } from "ponder";
import { BLOCK_INTERVALS } from "../blocks";
import { AirlockABI, LockableUniswapV3InitializerABI, UniswapV3InitializerABI, UniswapV4InitializerABI } from "@app/abis";
import { UniswapV3MigratorAbi } from "@app/abis/v3-abis/UniswapV3Migrator";
import { IChainConfig } from "@app/types/config";
import { ChainConfig } from "ponder";

// todo: fix this v bad
type AddressConfig = Address | Address[] | any 

export const baseSepoliaConfig: IChainConfig = {
  id: CHAIN_IDS.baseSepolia,
  name: "baseSepolia",
  startBlock: START_BLOCKS.baseSepolia,
  v4StartBlock: V4_START_BLOCKS.baseSepolia,
  oracleStartBlock: START_BLOCKS.mainnet,
  rpcEnvVar: RPC_ENV_VARS.baseSepolia,
  addresses: {
    v2: {
      factory: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e" as Address,
      v2Migrator: "0xb2ec6559704467306d04322a5dc082b2af4562dd" as Address,
    },
    v3: {
      v3Initializer: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47" as Address,
      lockableV3Initializer:
        "0x1fb8a108ff5c16213ebe3456314858d6b069a23b" as Address,
      v3Migrator: "0x0A3d3678b31cfF5F926c2A0384E742E4747605A0" as Address,
    },
    v4: {
      poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408" as Address,
      dopplerDeployer: "0x4bf819dfa4066bd7c9f21ea3db911bd8c10cb3ca" as Address,
      v4Initializer2: COMMON_ADDRESSES.ZERO_ADDRESS,
      dopplerLens: "0x4a8d81db741248a36d9eb3bc6ef648bf798b47a7" as Address,
      stateView: "0x571291b572ed32ce6751a2cb2486ebee8defb9b4" as Address,
      v4Initializer: "0xca2079706a4c2a4a1aa637dfb47d7f27fe58653f" as Address,
      v4Migrator: "0xe713efce3c639432fc3ca902f34edaf15ebcf3ac" as Address,
      v4MigratorHook: "0x508812fcdd4972a59b66eb2cad3772279c052000" as Address,
      v4InitializerSelfCorrecting:
        "0x8e891d249f1ecbffa6143c03eb1b12843aef09d3" as Address,
    },
    shared: {
      airlock: "0x3411306ce66c9469bff1535ba955503c4bde1c6e" as Address,
      tokenFactory: "0xc69ba223c617f7d936b3cf2012aa644815dbe9ff" as Address,
      universalRouter: "0x492e6456d9528771018deb9e87ef7750ef184104" as Address,
      governanceFactory:
        "0x9dbfaadc8c0cb2c34ba698dd9426555336992e20" as Address,
      weth: COMMON_ADDRESSES.WETH_BASE,
    },
    oracle: ORACLE_ADDRESSES,
  },
};

interface IMetricRefresherConfig {
  startBlock: number;
  interval: number;
}

interface IMetricV4CheckpointRefresherConfig extends IMetricRefresherConfig {}

interface IContractConfig {
    startBlock: number;
    address: AddressConfig;
}

interface IDopplerChainConfig {
  chain: ChainConfig;
  metricRefresher: IMetricRefresherConfig;

  // enable for v2 migrator indexing
  airlock: IContractConfig;
  uniswapV2Pair: IContractConfig;
  derc20: IContractConfig;

  // enable standard v3 pool indexing
  uniswapV3Initializer: IContractConfig;
  uniswapV3Pool: IContractConfig


  // enable v4 pool indexing
  uniswapV4Initializer: IContractConfig;
  uniswapV4Pool: IContractConfig;
  poolManager: IContractConfig;
  metricV4CheckpointRefresher: IMetricV4CheckpointRefresherConfig;

  // enable v3 migrator indexing
  uniswapV3Migrator: IContractConfig;
  uniswapV3MigrationPool: IContractConfig;

  // enable lockable v3 pool indexing
  lockableUniswapV3Initializer: IContractConfig;
  lockableUniswapV3Pool: IContractConfig;
}

export const baseSepoliaDopplerChainConfig: IDopplerChainConfig = {
  chain: {
    id: CHAIN_IDS.baseSepolia,
    rpc: http(process.env.PONDER_RPC_URL_84532),
  },
  metricRefresher: {
    startBlock: START_BLOCKS.baseSepolia,
    interval: BLOCK_INTERVALS.THOUSAND_BLOCKS,
  },
  metricV4CheckpointRefresher: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // every 50 blocks
  },
  airlock: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: baseSepoliaConfig.addresses.shared.airlock,
  },
  uniswapV3Initializer: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: baseSepoliaConfig.addresses.v3.v3Initializer,
  },
  uniswapV4Initializer: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: [
      baseSepoliaConfig.addresses.v4.v4Initializer,
      baseSepoliaConfig.addresses.v4.v4Initializer2,
      baseSepoliaConfig.addresses.v4.v4InitializerSelfCorrecting,
    ],
  },
  derc20: {
    startBlock: START_BLOCKS.baseSepolia,
    address: factory({
        address: baseSepoliaConfig.addresses.shared.airlock,
        event: getAbiItem({ abi: AirlockABI, name: "Create" }),
        parameter: "asset",
    }),
  },
  // todo: if we are using the migrator we will always use the migration pool down stream
  uniswapV3Migrator: {
    startBlock: 28245945, // hardcoded for now
    address: baseSepoliaConfig.addresses.v3.v3Migrator,
  },
  uniswapV3MigrationPool: {
    startBlock: 28245945, // hardcoded for now
    address: factory({
      address: baseSepoliaConfig.addresses.v3.v3Migrator,
      event: getAbiItem({ abi: UniswapV3MigratorAbi, name: "Migrate" }),
      parameter: "pool",
    }),
  },
  uniswapV3Pool: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: factory({
        address: baseSepoliaConfig.addresses.v3.v3Initializer,
        event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
        parameter: "poolOrHook",
    }),
  },
  lockableUniswapV3Pool: {
    startBlock: LOCKABLE_V3_INITIALIZER_START_BLOCKS.baseSepolia,
    address: factory({
      address: baseSepoliaConfig.addresses.v3.lockableV3Initializer,
      event: getAbiItem({ abi: LockableUniswapV3InitializerABI, name: "Create" }),
      parameter: "poolOrHook",
    }),
  },
  uniswapV2Pair: {
    startBlock: START_BLOCKS.baseSepolia,
    address: factory({
      address: baseSepoliaConfig.addresses.shared.airlock,
      event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
      parameter: "pool",
    }),
  },
  poolManager: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: baseSepoliaConfig.addresses.v4.poolManager,
  },
  uniswapV4Pool: {
    startBlock: V4_START_BLOCKS.baseSepolia,
    address: factory({
    address: [
        baseSepoliaConfig.addresses.v4.v4Initializer,
        baseSepoliaConfig.addresses.v4.v4Initializer2,
        baseSepoliaConfig.addresses.v4.v4InitializerSelfCorrecting,
    ],
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    }),
  },
  lockableUniswapV3Initializer: {
    startBlock: LOCKABLE_V3_INITIALIZER_START_BLOCKS.baseSepolia,
    address: baseSepoliaConfig.addresses.v3.lockableV3Initializer,
  }
};