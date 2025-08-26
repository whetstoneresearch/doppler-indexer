import { Network } from "@app/settings";
import { zeroAddress } from "viem";

export const SECONDS_IN_DAY = 86400;

export const secondsIn30Minutes = 1800;
export const secondsIn15Minutes = 900;
export const secondsInHour = 3600;
export const secondsInDay = 86400;

export const Q192 = BigInt(2) ** BigInt(192);
export const WAD = BigInt(10) ** BigInt(18);
export const CHAINLINK_ETH_DECIMALS = BigInt(10) ** BigInt(8);

export enum DopplerRequiredBlocks {
  V4PoolCheckpoints = "V4PoolCheckpoints",
}

export enum DopplerRequiredContracts {
  Airlock = "Airlock",
  DERC20 = "DERC20",
  UniswapV3Initializer = "UniswapV3Initializer",
  UniswapV4Initializer = "UniswapV4Initializer",
  UniswapV3Pool = "UniswapV3Pool",
  UniswapV4Pool = "UniswapV4Pool",
  PoolManager = "PoolManager",
}

export const BLOCK_INTERVALS = {
  FIVE_MINUTES: (60 * 5) / 12, // every 5 minutes
  FIFTY_BLOCKS: 50, // every 50 blocks
  THOUSAND_BLOCKS: 1000, // every 1000 blocks
} as const;

export const NETWORK_BLOCK_INTERVALS = {
  mainnet: BLOCK_INTERVALS.FIVE_MINUTES,
  unichain: BLOCK_INTERVALS.FIFTY_BLOCKS,
  ink: BLOCK_INTERVALS.FIFTY_BLOCKS,
  base: BLOCK_INTERVALS.FIFTY_BLOCKS,
} as const;

// Block numbers organized by purpose
export const START_BLOCKS: Record<Network, number> = {
  unichain: 8536880,
  ink: 9500879,
  base: 28415520,
} as const;

export const V4_START_BLOCKS: Record<Network, number> = {
  unichain: 17686805,
  ink: 14937170,
  base: 30822164,
} as const;

// Special contract addresses used across chains
export const COMMON_ADDRESSES = {
  WETH_BASE: "0x4200000000000000000000000000000000000006",
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
} as const;

// Oracle addresses (mainnet-based)
export const ORACLE_ADDRESSES = {
  mainnetEthUsdc: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  chainlinkEth: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
} as const;

export const SHARED_ADDRESSES = {
  airlock: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
  tokenFactory: "0xc69ba223c617f7d936b3cf2012aa644815dbe9ff",
  universalRouter: "0x492e6456d9528771018deb9e87ef7750ef184104",
  governanceFactory: "0x9dbfaadc8c0cb2c34ba698dd9426555336992e20",
  migrator: "0xb2ec6559704467306d04322a5dc082b2af4562dd",
  weth: COMMON_ADDRESSES.WETH_BASE,
} as const;

export const STATE_VIEWS = {
  unichain: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2",
  base: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
  ink: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990"
} as const;

export const DOPPLER_LENSES = {
  unichain: "0x82ac010c67f70bacf7655cd8948a4ad92a173cac",
  base: "0x43d0d97ec9241a8f05a264f94b82a1d2e600f2b3",
  ink: "0x8af018e28c273826e6b2d5a99e81c8fb63729b07"
} as const;

export const LOCKABLE_V3_INITIALIZERS = {
  unichain: "0xa3c847eab58eaa9cbc215c785c9cfbc19cdabd5f",
  base: "0xe0dc4012ac9c868f09c6e4b20d66ed46d6f258d0",
  ink: zeroAddress
} as const;

export const V3_INITIALIZERS = {
  unichain: "0x9f4e56be80f08ba1a2445645efa6d231e27b43ec",
  base: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
  ink: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5"
} as const;