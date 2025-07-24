import settings from "@app/settings";
import { START_BLOCKS } from "./const";
import { Address } from "viem";

export const networkConfig = {
  chainId: settings.mainnet.chainId,
  rpc: settings.mainnet.rpc,
  addresses: {
    chainlinkEth: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as Address,
  },
  blocks: {
    ChainlinkEthPriceFeed: {
      chain: {
        mainnet: {
          startBlock: START_BLOCKS.mainnet,
          interval: settings.interval,
        },
      },
    },
  } as const,
  contracts: {},
};
