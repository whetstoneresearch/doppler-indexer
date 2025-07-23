import { factory } from "ponder";
import { getAbiItem } from "viem";
import { UniswapV3InitializerABI, UniswapV4InitializerABI } from "../../../abis";
import { UniswapV2FactoryABI } from "../../../abis/UniswapV2Factory";
import { ContractName } from "../types";
import { ContractInfo } from "../types";

const unichainContracts = {
  [ContractName.Airlock]: {
    address: "0x77EbfBAE15AD200758E9E2E61597c0B07d731254",
    startBlock: 8536880,
  },
  [ContractName.DERC20]: factory({
    address: "0x9F4e56be80f08ba1A2445645EFa6d231E27b43ec",
    event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
    parameter: "asset",
    startBlock: 8536880,
  }),
  [ContractName.UniswapV3Initializer]: {
    address: "0x9F4e56be80f08ba1A2445645EFa6d231E27b43ec",
    startBlock: 8536880,
  },
  [ContractName.UniswapV3Pool]: factory({
    address: "0x9F4e56be80f08ba1A2445645EFa6d231E27b43ec",
    event: getAbiItem({ abi: UniswapV3InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    startBlock: 8536880,
  }),
  [ContractName.PoolManager]: {
    address: "0x1F98400000000000000000000000000000000004",
    startBlock: 17686805,
  },
  [ContractName.UniswapV2PairUnichain]: factory({
    address: "0x1f98400000000000000000000000000000000002",
    event: getAbiItem({ abi: UniswapV2FactoryABI, name: "PairCreated" }),
    parameter: "pair",
    startBlock: 8536880,
  }),
  [ContractName.UniswapV4Initializer]: {
    address: "0xA7A28cB18F73CDd591fa81ead6ffadf749c0d0a2",
    startBlock: 17686805,
  },
  [ContractName.UniswapV4Pool]: factory({
    address: "0xA7A28cB18F73CDd591fa81ead6ffadf749c0d0a2",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "poolOrHook",
    startBlock: 17686805,
  }),
  [ContractName.V4DERC20]: factory({
    address: "0xA7A28cB18F73CDd591fa81ead6ffadf749c0d0a2",
    event: getAbiItem({ abi: UniswapV4InitializerABI, name: "Create" }),
    parameter: "asset",
    startBlock: 17686805,
  }),
} as const satisfies Partial<Record<keyof typeof ContractName, ContractInfo>>;

export default unichainContracts;