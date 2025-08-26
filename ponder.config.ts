import { createConfig } from "ponder";
import settings, { NetworkEnum } from "./src/settings";
import { BlockName, ContractName } from "./src/config/types";
import fs from "fs";
import stringify from "json-stable-stringify";
import { AirlockABI, DERC20ABI, DopplerABI, LockableUniswapV3InitializerABI, PoolManagerABI, UniswapV2PairABI, UniswapV3InitializerABI, UniswapV3PoolABI, UniswapV4InitializerABI, V4MigratorABI, ZoraCoinABI, ZoraCreatorCoinABI, ZoraFactoryABI, ZoraV4HookABI } from "./src/abis";
import { generateBlocks, generateContractChains } from "./src/utils";

const cfg = {
  ordering: "multichain" as const,
  chains: {
    base: {
      id: settings.base.chainId,
      rpc: settings.base.rpc,
    },
    unichain: {
      id: settings.unichain.chainId,
      rpc: settings.unichain.rpc,
    },
    ink: {
      id: settings.ink.chainId,
      rpc: settings.ink.rpc,
    },
  },
  blocks: {
    // mainnet required
    [BlockName.ChainlinkEthPriceFeed]: generateBlocks({
      blockName: BlockName.ChainlinkEthPriceFeed,
      networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
    }),
    [BlockName.MetricRefresher]: generateBlocks({
      blockName: BlockName.MetricRefresher,
      networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
    }),
  },
  contracts: {
    [ContractName.Airlock]: {
      abi: AirlockABI,
      chain: generateContractChains({
        contractName: ContractName.Airlock,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },

    [ContractName.UniswapV2Pair]: {
      abi: UniswapV2PairABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV2Pair,
        networks: [NetworkEnum.base, NetworkEnum.ink],
      }),
    },

    [ContractName.UniswapV3Initializer]: {
      abi: UniswapV3InitializerABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV3Initializer,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },
    [ContractName.LockableUniswapV3Initializer]: {
      abi: LockableUniswapV3InitializerABI,
      chain: generateContractChains({
        contractName: ContractName.LockableUniswapV3Initializer,
        networks: [NetworkEnum.base],
      }),
    },
    // [ContractName.UniswapV3MigrationPool]: {
    //   abi: UniswapV3PoolABI,
    //   chain: generateContractChains({
    //     contractName: ContractName.UniswapV3MigrationPool,
    //   }),
    // },
    [ContractName.DERC20]: {
      abi: DERC20ABI,
      chain: generateContractChains({
        contractName: ContractName.DERC20,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },

    [ContractName.PoolManager]: {
      abi: PoolManagerABI,
      chain: generateContractChains({
        contractName: ContractName.PoolManager,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },

    [ContractName.UniswapV2PairUnichain]: {
      abi: UniswapV2PairABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV2PairUnichain,
        networks: [NetworkEnum.unichain],
      }),
    },
    
    [ContractName.UniswapV3Pool]: {
      abi: UniswapV3PoolABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV3Pool,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },
    
    [ContractName.UniswapV4Initializer]: {
      abi: UniswapV4InitializerABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV4Initializer,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },
    
    [ContractName.UniswapV4Pool]: {
      abi: DopplerABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV4Pool,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },

    [ContractName.UniswapV4Initializer2]: {
      abi: UniswapV4InitializerABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV4Initializer2,
        networks: [NetworkEnum.base, NetworkEnum.ink],
      }),
    },

    [ContractName.UniswapV4Pool2]: {
      abi: DopplerABI,
      chain: generateContractChains({
        contractName: ContractName.UniswapV4Pool2,
        networks: [NetworkEnum.base, NetworkEnum.ink],
      }),
    },

    [ContractName.V4DERC20]: {
      abi: DERC20ABI,
      chain: generateContractChains({
        contractName: ContractName.V4DERC20,
        networks: [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain],
      }),
    },

    [ContractName.V4DERC20_2]: {
      abi: DERC20ABI,
      chain: generateContractChains({
        contractName: ContractName.V4DERC20_2,
        networks: [NetworkEnum.base, NetworkEnum.ink],
      }),
    },

    [ContractName.V4Migrator]: {
      abi: V4MigratorABI,
      chain: generateContractChains({
        contractName: ContractName.V4Migrator,
        networks: [NetworkEnum.base],
      }),
    },
    [ContractName.ZoraFactory]: {
      abi: ZoraFactoryABI,
      chain: generateContractChains({
        contractName: ContractName.ZoraFactory,
        networks: [NetworkEnum.base],
      }),
    },
    [ContractName.ZoraContentCoin]: {
      abi: ZoraCoinABI,
      chain: generateContractChains({
        contractName: ContractName.ZoraContentCoin,
        networks: [NetworkEnum.base],
      }),
    },
    [ContractName.ZoraCreatorCoin]: {
      abi: ZoraCreatorCoinABI,
      chain: generateContractChains({
        contractName: ContractName.ZoraCreatorCoin,
        networks: [NetworkEnum.base],
      }),
    },
    [ContractName.ZoraCreatorCoinHook]: {
      abi: ZoraV4HookABI,
      chain: generateContractChains({
        contractName: ContractName.ZoraCreatorCoinHook,
        networks: [NetworkEnum.base],
      }),
    },
    [ContractName.ZoraContentCoinHook]: {
      abi: ZoraV4HookABI,
      chain: generateContractChains({
        contractName: ContractName.ZoraContentCoinHook,
        networks: [NetworkEnum.base],
      }),
    },
  },
};

const cleanedCfg = JSON.parse(JSON.stringify(cfg, (key, value) => {
  if (key === 'rpc') return undefined;
  return value;
}));
fs.writeFileSync("ponder.config.json", stringify(cleanedCfg, { space: 2 }) as string);

export default createConfig(cfg);
