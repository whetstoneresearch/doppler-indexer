import { BlockName } from "@app/config/types";
import { BlockConfig as PonderBlockConfig } from "ponder";

const baseBlocks: Partial<
  Record<
    keyof typeof BlockName,
    Exclude<PonderBlockConfig["chain"], string>[string]
  >
> = {
  // [BlockName.ChainlinkEthPriceFeed]: {
  //   startBlock: 21781000,
  //   interval: 25,
  // },

  [BlockName.MetricRefresher]: {
    startBlock: 28415520,
    interval: 1000,
  },
  [BlockName.PendingTokenImages]: {
    startBlock: 28415520,
    interval: 50,
  },
} as const;

export default baseBlocks;
