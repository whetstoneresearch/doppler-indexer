import { ContractConfigMap } from "./types";
import { chainConfigs, COMMON_ADDRESSES } from "../chains";
import { AirlockABI } from "../../abis";

export const generateSharedContracts = (): ContractConfigMap => {
  const contracts: ContractConfigMap = {};

  // Airlock contract - available on most chains
  const airlockChains = Object.entries(chainConfigs).filter(
    ([_, config]) => config.addresses.shared.airlock !== COMMON_ADDRESSES.ZERO_ADDRESS
  );

  if (airlockChains.length > 0) {
    contracts.Airlock = {
      abi: AirlockABI,
      chain: Object.fromEntries(
        airlockChains.map(([name, config]) => [
          name,
          {
            startBlock: config.startBlock,
            address: config.addresses.shared.airlock,
          },
        ])
      ),
    };
  }

  return contracts;
};