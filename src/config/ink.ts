import {
  COMMON_ADDRESSES,
} from "./const";
import { NetworkAddresses, NetworkConfig } from "./types";
import settings from "../settings";

export const addresses: NetworkAddresses  = {
  v2Factory: "0xfe57A6BA1951F69aE2Ed4abe23e0f095DF500C04",
  v2Migrator: "0x5F3bA43D44375286296Cb85F1EA2EBfa25dde731",
  v3Initializer: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
  v4PoolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  v4DopplerDeployer: "0x8b4C7DB9121FC885689C0A50D5a1429F15AEc2a0",
  v4Initializer: "0xC99b485499f78995C6F1640dbB1413c57f8BA684",
  v4Initializer2: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056",
  v4StateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
  v4DopplerLens: "0xCe3099B2F07029b086E5e92a1573C5f5A3071783",
  v4Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
  v4MigratorHook: COMMON_ADDRESSES.ZERO_ADDRESS,
  v3Migrator: COMMON_ADDRESSES.ZERO_ADDRESS,
} as const;

export const networkConfig: NetworkConfig = {
  chainId: settings.ink.chainId,
  rpc: settings.ink.rpc,
  addresses,
  blocks: {},
};


