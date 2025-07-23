import { zeroAddress } from "viem";
import settings from "../settings";
import {
  BLOCK_INTERVALS,
  START_BLOCKS,
} from "./const";
import { NetworkAddresses, NetworkConfig } from "./types";

export const addresses: NetworkAddresses = {
  v2Factory: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e",
  v2Migrator: zeroAddress,
  v3Initializer: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47",
  v4PoolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  v4DopplerDeployer: "0x4bf819dfa4066bd7c9f21ea3db911bd8c10cb3ca",
  v4Initializer2: "0x0000000000000000000000000000000000000000",
  v4DopplerLens: "0x4a8d81db741248a36d9eb3bc6ef648bf798b47a7",
  v4StateView: "0x571291b572ed32ce6751a2cb2486ebee8defb9b4",
  v4Initializer: "0xca2079706a4c2a4a1aa637dfb47d7f27fe58653f",
  v4Migrator: "0xb2ec6559704467306d04322a5dc082b2af4562dd",
  v4MigratorHook: "0x1cb2230a3b228014532dd491b0ba385e53b7a000",
  v3Migrator: zeroAddress,
} as const;

export const networkConfig: NetworkConfig<NetworkAddresses> = {
  chainId: settings.base.chainId,
  rpc: settings.base.rpc,
  addresses,
  blocks: {
    PendingTokenImagesBase: {
      chain: {
        base: {
          startBlock: START_BLOCKS.base,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // Check every 50 blocks
        },
      },
    },
  },
} as const;
