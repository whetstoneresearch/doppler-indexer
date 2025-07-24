import { Abi } from "viem";
import { Network } from "@app/settings";
import { factory, ContractConfig as PonderContractConfig } from "ponder";

// YOU MUST USE THESE TYPES
// OTHERWISE CONFIGS GO POOF
// TYPESCRIPT WILL GET MAD
// DATA WILL DISAPPEAR
// ITS A WHOLE BIG THING

// PLEASE,
// THESE ARE...
// ORGANIC
// GRASS FED
// NON GMO
// FREE RANGE
// SLOP-FREE TYPES
// THANK YOU FOR YOUR TIME
// - RUSTY

export enum BlockName {
  ChainlinkEthPriceFeed = "ChainlinkEthPriceFeed",
  MetricRefresher = "MetricRefresher",
  PendingTokenImages = "PendingTokenImages",
}

export enum ContractName {
  Airlock = "Airlock",
  DERC20 = "DERC20",
  UniswapV3Initializer = "UniswapV3Initializer",
  UniswapV3Pool = "UniswapV3Pool",
  UniswapV3MigrationPool = "UniswapV3MigrationPool",
  PoolManager = "PoolManager",
  UniswapV2Pair = "UniswapV2Pair",
  UniswapV2PairUnichain = "UniswapV2PairUnichain",
  UniswapV4Initializer = "UniswapV4Initializer",
  UniswapV4Initializer2 = "UniswapV4Initializer2",
  UniswapV4Pool = "UniswapV4Pool",
  UniswapV4Pool2 = "UniswapV4Pool2",
  V4DERC20 = "V4DERC20",
  V4DERC20_2 = "V4DERC20_2",
  V4Migrator = "V4Migrator",
}

export type DopplerAddresses =
  | "v2Migrator"
  | "v2Factory"
  | "v3Initializer"
  | "v4PoolManager"
  | "v4DopplerDeployer"
  | "v4Initializer2"
  | "v4DopplerLens"
  | "v4StateView"
  | "v4Initializer"
  | "v4Migrator"
  | "v4MigratorHook"

type Address = PonderContractConfig["address"];
export type NetworkAddresses = Record<DopplerAddresses, Address>;

export type RequiredBlocks = "V4PoolCheckpoints" | "MetricRefresher";
type BlockMap = { chain: { [key in Network]?: { startBlock: number; interval: number } } };
export type Blocks<RequiredBlocks extends string = string> = Record<RequiredBlocks, BlockMap>;

export type ContractInfo = { address: PonderContractConfig["address"], startBlock?: number } | ReturnType<typeof factory>;

export type MergedContracts<Config extends PonderContractConfig["chain"] = PonderContractConfig["chain"]> = {
  [key in ContractName]: {
    abi: Abi;
    chain: {
      [key in Network]: Config
    };
  };
};

export type  NetworkConfig<
  A extends NetworkAddresses = NetworkAddresses,
> = {
  chainId: number;
  rpc: string;
  addresses: A;
  blocks: Blocks;
};
