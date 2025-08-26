import { BlockName } from "@app/config/types";
import { BlockConfig as PonderBlockConfig } from "ponder";
import { BLOCK_INTERVALS } from "../const";

const baseBlocks: Partial<
  Record<
    keyof typeof BlockName,
    Exclude<PonderBlockConfig["chain"], string>[string]
  >
> = {
  [BlockName.ChainlinkEthPriceFeed]: {
    startBlock: 21781000,
    interval: BLOCK_INTERVALS.FIVE_MINUTES,
  },
  [BlockName.MetricRefresher]: {
    startBlock: 28415520,
    interval: 1000,
  },
} as const;

export default baseBlocks;
