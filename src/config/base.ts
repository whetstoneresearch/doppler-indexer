import settings from "@app/settings";
import {
  BLOCK_INTERVALS,
  START_BLOCKS,
} from "./const";
import { NetworkAddresses, NetworkConfig } from "./types";

export const addresses: NetworkAddresses = {
  v2Factory: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e",
  v2Migrator: "0x0000000000000000000000000000000000000000",
  v3Initializer: "0x4c3062b9ccfdbcb10353f57c1b59a29d4c5cfa47",
  v4PoolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  v4DopplerDeployer: "0x4bf819dfa4066bd7c9f21ea3db911bd8c10cb3ca",
  v4Initializer2: "0x0000000000000000000000000000000000000000",
  v4DopplerLens: "0x4a8d81db741248a36d9eb3bc6ef648bf798b47a7",
  v4StateView: "0x571291b572ed32ce6751a2cb2486ebee8defb9b4",
  v4Initializer: "0xca2079706a4c2a4a1aa637dfb47d7f27fe58653f",
  v4Migrator: "0xb2ec6559704467306d04322a5dc082b2af4562dd",
  v4MigratorHook: "0x1cb2230a3b228014532dd491b0ba385e53b7a000",
} as const;

export const zoraAddresses = {
  zoraFactory: "0x777777751622c0d3258f214F9DF38E35BF45baF3",
  zoraTokenPool: "0xedc625b74537ee3a10874f53d170e9c17a906b9c",
  zoraToken: "0x1111111111166b7FE7bd91427724B487980aFc69",
  creatorCoinHook: "0xd61A675F8a0c67A73DC3B54FB7318B4D91409040",
  contentCoinHook: "0x9ea932730A7787000042e34390B8E435dD839040",
};

export const networkConfig: NetworkConfig<NetworkAddresses> = {
  chainId: settings.base.chainId,
  rpc: settings.base.rpc,
  addresses,
  blocks: {
    ChainlinkEthPriceFeed: {
      chain: {
        base: {
          startBlock: START_BLOCKS.base,
          interval: BLOCK_INTERVALS.FIFTY_BLOCKS, // Check every 50 blocks
        },
      },
    },
    ZoraUsdPriceFeed: {
      chain: {
        base: {
          startBlock: 26602741,
          interval: BLOCK_INTERVALS.FIVE_MINUTES,
        },
      },
    },
  },
} as const;
