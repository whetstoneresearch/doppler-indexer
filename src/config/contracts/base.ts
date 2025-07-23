import { factory } from "ponder";
import {
  AirlockABI,
  UniswapV3InitializerABI,
  UniswapV4InitializerABI,
} from "../../abis";
import { getAbiItem } from "viem";
import { ContractName, ContractInfo } from "../types";

const baseContracts = {
  [ContractName.Airlock]: {
    address: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
    startBlock: 28415520,
  },
  [ContractName.DERC20]: factory({
    address: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
    startBlock: 28415520,
    event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
    parameter: "asset",
  }),
  [ContractName.UniswapV3Initializer]:
    {
      address: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
      startBlock: 28415520,
    },
  [ContractName.UniswapV3Pool]: factory({
    address: "0xaA47D2977d622DBdFD33eeF6a8276727c52EB4e5",
    event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    startBlock: 28415520,
  }),
  [ContractName.PoolManager]: {
    address: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    startBlock: 30822164,
  },
  [ContractName.UniswapV2Pair]: factory({
    address: "0x660eAaEdEBc968f8f3694354FA8EC0b4c5Ba8D12",
    event: getAbiItem({ abi: AirlockABI, name: "Migrate" }),
    parameter: "pool",
    startBlock: 28415520,
  }),
  [ContractName.UniswapV4Initializer]:
    {
      address: "0x8AF018e28c273826e6b2d5a99e81c8fB63729b07",
      startBlock: 30822164,
    },
  [ContractName.UniswapV4Initializer2]: {
    address: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254",
    startBlock: 30822164,
  },
  [ContractName.UniswapV4Pool]: factory({
    address: "0x8AF018e28c273826e6b2d5a99e81c8fB63729b07",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    startBlock: 30822164,
  }),
  [ContractName.UniswapV4Pool2]: {
    address: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254",
    startBlock: 30822164,
  },
  [ContractName.V4DERC20]: factory({
    address: "0x8AF018e28c273826e6b2d5a99e81c8fB63729b07",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "asset",
    startBlock: 30822164,
  }),
  [ContractName.V4DERC20_2]: factory({
    address: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "asset",
  }),
  [ContractName.V4Migrator]: {
    address: "0x82Cc0DAAea3c9Ee022bC61dbC7Bf6dB6460b6000",
    startBlock: 30822164,
  },
} as const satisfies Partial<Record<keyof typeof ContractName, ContractInfo>>;

export default baseContracts;
