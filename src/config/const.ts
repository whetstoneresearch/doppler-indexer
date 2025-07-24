import { Network } from "../settings";

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
  MetricRefresher = "MetricRefresher",
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
  mainnet: 21781000,
  unichain: 8536880,
  ink: 9500879,
  base: 28415520,
} as const;

export const V4_START_BLOCKS: Record<Network, number> = {
  // Satisfy typescript
  // TODO: fix
  mainnet: 0,
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