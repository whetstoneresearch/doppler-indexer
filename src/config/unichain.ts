import {
  COMMON_ADDRESSES,
} from "./const";
import { NetworkAddresses, NetworkConfig } from "./types";
import settings from "../settings";
import { Address } from "viem";

export const addresses: NetworkAddresses = {
  v2Factory: "0x1f98400000000000000000000000000000000002" as Address,
  v2Migrator: "0xf6023127f6E937091D5B605680056A6D27524bad" as Address,
  v3Initializer: "0x9F4e56be80f08ba1A2445645EFa6d231E27b43ec" as Address,
  v4PoolManager: "0x1F98400000000000000000000000000000000004" as Address,
  v4DopplerDeployer: "0xBEd386a1Fc62B6598c9b8d2BF634471B6Fe75EB7" as Address,
  v4Initializer: "0xA7A28cB18F73CDd591fa81ead6ffadf749c0d0a2" as Address,
  v4StateView: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2" as Address,
  v4DopplerLens: "0x166109C4EE7fE69164631Caa937dAA5F5cEbFef0" as Address,
  v4Initializer2: COMMON_ADDRESSES.ZERO_ADDRESS,
  v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
  v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
  v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
} as const;

export const networkConfig: NetworkConfig = {
  chainId: settings.unichain.chainId,
  rpc: settings.unichain.rpc,
  addresses,
  blocks: {},
};
