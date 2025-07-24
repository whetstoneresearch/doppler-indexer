import { factory } from "ponder";
import { getAbiItem } from "viem";
import { AirlockABI, UniswapV3InitializerABI, UniswapV4InitializerABI } from "@app/abis";
import { ContractName, ContractInfo } from "@app/config/types";

const inkContracts = {
  [ContractName.Airlock]: {
    address: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
    startBlock: 9500879,
  },
  [ContractName.DERC20]: factory({
    startBlock: 9500879,
    address: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
    event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
    parameter: "asset",
  }),
  [ContractName.UniswapV3Initializer]: {
    address: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
    startBlock: 9500879,
  },
  [ContractName.UniswapV3Pool]: factory({
    address: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
    event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    startBlock: 9500879,
  }),
  [ContractName.PoolManager]: {
    address: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
    startBlock: 14937170,
  },
  [ContractName.UniswapV2Pair]: factory({
    address: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
    event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
    parameter: "pool",
    startBlock: 9500879,
  }),
  [ContractName.UniswapV4Initializer]: {
    address: "0xC99b485499f78995C6F1640dbB1413c57f8BA684",
    startBlock: 14937170,
  },
  [ContractName.UniswapV4Initializer2]: {
    address: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056",
    startBlock: 14937170,
  },
  [ContractName.UniswapV4Pool]: factory({
    address: "0xC99b485499f78995C6F1640dbB1413c57f8BA684",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    startBlock: 14937170,
  }),
  [ContractName.UniswapV4Pool2]: {
    address: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056",
    startBlock: 14937170,
  },
  [ContractName.V4DERC20]: factory({
    address: "0xC99b485499f78995C6F1640dbB1413c57f8BA684",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "asset",
    startBlock: 14937170,
  }),
  [ContractName.V4DERC20_2]: factory({
    address: "0x014E1c0bd34f3B10546E554CB33B3293fECDD056",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "asset",
  }),
} as const satisfies Partial<Record<keyof typeof ContractName, ContractInfo>>;

export default inkContracts;