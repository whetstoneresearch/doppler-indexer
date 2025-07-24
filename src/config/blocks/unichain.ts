import { BlockName } from "@app/config/types";
import { BlockConfig as PonderBlockConfig } from "ponder";

const unichainBlocks: Partial<
  Record<keyof typeof BlockName, Exclude<PonderBlockConfig["chain"], string>[string]>
> = {
  [BlockName.MetricRefresher]: {
    interval: 1000,
    startBlock: 8536880,
  },
};

export default unichainBlocks;