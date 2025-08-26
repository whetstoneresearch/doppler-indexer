import { BlockName } from "@app/config/types";
import { BlockConfig as PonderBlockConfig } from "ponder";
import { BLOCK_INTERVALS } from "../const";

const inkBlocks: Partial<
  Record<keyof typeof BlockName, Exclude<PonderBlockConfig["chain"], string>[string]>
> = {
  [BlockName.ChainlinkEthPriceFeed]: {
    startBlock: 9508011,
    interval: BLOCK_INTERVALS.FIVE_MINUTES,
  },
  [BlockName.MetricRefresher]: {
    interval: 1000,
    startBlock: 9500879,
  },
};

export default inkBlocks;
