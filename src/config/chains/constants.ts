import { Address } from "viem";
import { OracleAddresses } from "./types";

export const CHAIN_IDS = {
  unichain: 130,
  mainnet: 1,
  baseSepolia: 84532,
  ink: 57073,
  base: 8453,
  monad: 143,
  sepolia: 11155111
} as const;

// Block numbers organized by purpose
export const START_BLOCKS = {
  mainnet: 21781000,
  unichain: 8536880,
  baseSepolia: 28109000,
  ink: 9508011,
  base: 28415520,
  monad: 34746370,
  sepolia: 10134362
} as const;

export const V4_START_BLOCKS = {
  mainnet: 24326115,
  unichain: 17686805,
  baseSepolia: 26638492,
  ink: 14937170,
  base: 30822164,
  monad: 34746371
} as const;

export const LOCKABLE_V3_INITIALIZER_START_BLOCKS = {
  baseSepolia: 28150553,
  base: 32640102,
  monad: 34746370
} as const;

export const SELF_CORRECTING_V4_INITIALIZER_START_BLOCKS = {
  base: 32424227,
  baseSepolia: 27934624,
} as const;

export const V4_MULTICURVE_INITIALIZER_START_BLOCKS: Record<string, number> = {
  // baseSepolia
  "0x359b5952a254baaa0105381825daedb8986bb55c": 31004617,
  "0x1718405e58c61425cdc0083262bc9f72198f5232": 31564169,
} as const;

// Special contract addresses used across chains
export const COMMON_ADDRESSES = {
  WETH_BASE: "0x4200000000000000000000000000000000000006" as Address,
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000" as Address,
} as const;

// Oracle addresses (mainnet-based)
export const ORACLE_ADDRESSES: OracleAddresses = {
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  chainlinkEth: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address,
  chainlinkBaseEth: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as Address,
};

// RPC environment variable mapping
export const RPC_ENV_VARS = {
  mainnet: "PONDER_RPC_URL_1",
  unichain: "PONDER_RPC_URL_130",
  baseSepolia: "PONDER_RPC_URL_84532",
  ink: "PONDER_RPC_URL_57073",
  base: "PONDER_RPC_URL_8453",
  monad: "PONDER_RPC_URL_143",
  sepolia: "PONDER_RPC_URL_11155111"
} as const;

export const BLOCK_INTERVALS = {
  FIVE_MINUTES: (60 * 5) / 12, // every 5 minutes
  FIVE_MINUTES_MONAD: (60 * 5) / 0.5,
  FIFTY_BLOCKS: 50, // every 50 blocks
  THOUSAND_BLOCKS: 1000, // every 1000 blocks
  FIVE_THOUSAND_BLOCKS: 5000,
} as const;
