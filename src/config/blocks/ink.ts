import { BlockName } from "@app/config/types";
import { BlockConfig as PonderBlockConfig } from "ponder";

const inkBlocks: Partial<
  Record<keyof typeof BlockName, Exclude<PonderBlockConfig["chain"], string>[string]>
> = {
  [BlockName.ChainlinkEthPriceFeed]: {
    startBlock: 21781000,
    interval: 25,
  },

  [BlockName.MetricRefresher]: {
    interval: 1000,
    startBlock: 9500879,
  },
};

export default inkBlocks;
