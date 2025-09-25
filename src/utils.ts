// TODO: fix these
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { L2Network } from "./settings";
import { BlockName, ContractInfo, ContractName } from "./config/types";
import contractAddresses from "./config/contracts";
import blocksConfig from "./config/blocks";
import { BlockConfig as PonderBlockConfig } from "ponder";
import settings from "./settings";

// TODO: this is a mess
export const generateContractChains = ({
  contractName,
  networks,
}: {
  contractName: keyof typeof ContractName;
  networks: L2Network[];
}) => {
  const result: Partial<Record<L2Network, ContractInfo>> = {};

  for (const network of networks) {
    if (!settings.enabledNetworks.includes(network)) continue;
    const n = network;
    const contract =
      contractAddresses[n][
        contractName as keyof (typeof contractAddresses)[L2Network]
      ];

    if (!contract) {
      throw new Error(`Contract ${contractName} not found for network ${n}`);
    }

    // Transform factory-style config to nested structure
    if (
      typeof contract === "object" &&
      "address" in contract &&
      ("event" in contract || "parameter" in contract)
    ) {
      // Factory-style config - reshape it
      const { address, startBlock, event, parameter, ...rest } =
        contract as any;
      result[n] = {
        address: {
          address,
          ...(event && { event }),
          ...(parameter && { parameter }),
          ...rest,
        },
        startBlock,
      } as any;
    } else {
      // Regular config - use as-is (simple address + startBlock configs)
      result[n] = contract;
    }
  }

  return result;
};

export const generateBlocks = ({
  blockName,
  networks,
}: {
  blockName: keyof typeof BlockName;
  networks: L2Network[];
}): { chain: Partial<Record<L2Network, PonderBlockConfig>> } => {
  const result: { chain: Partial<Record<L2Network, PonderBlockConfig>> } = {
    chain: {},
  };

  for (const network of networks) {
    if (!settings.enabledNetworks.includes(network)) continue;
    const n = network;
    const block = blocksConfig[n][blockName];

    if (block == null) {
      throw new Error(`Block ${blockName} not found for network ${n}`);
    }

    // TODO: forgive me lord
    // @ts-expect-error - bark bark bark
    result.chain[n] = block;
  }

  return result;
};

// Re-export utils from utils directory
export { getPoolId, getV4PoolData } from "./utils/v4-utils";
export { getAssetData } from "./utils/getAssetData";
export { secondsInHour, Q192 } from "./utils/constants";
export { computeV3Price, getV3PoolData } from "./utils/v3-utils";
export { computeV2Price } from "./utils/v2-utils/computeV2Price";
export { getPairData } from "./utils/v2-utils/getPairData";
