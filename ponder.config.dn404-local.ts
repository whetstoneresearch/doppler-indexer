import { createConfig } from "ponder";
import { DN404FactoryABI } from "./src/abis";
import { UniswapV4ScheduledMulticurveInitializerABI } from "./src/abis/multicurve-abis/UniswapV4ScheduledMulticurveInitializerABI";
import { chainConfigs, CHAIN_IDS } from "./src/config/chains";
import { configureIndexerEntrypoint } from "./src/indexer/entrypointConfig";

const { baseSepolia } = chainConfigs;

const contracts = {
  DN404Factory: {
    abi: DN404FactoryABI,
    chain: {
      baseSepolia: {
        startBlock: 41118945,
        address: baseSepolia.addresses.shared.dn404Factory!,
      },
    },
  },
  UniswapV4ScheduledMulticurveInitializer: {
    abi: UniswapV4ScheduledMulticurveInitializerABI,
    chain: {
      baseSepolia: {
        startBlock: 41118945,
        address: baseSepolia.addresses.v4.v4ScheduledMulticurveInitializer,
      },
    },
  },
} as const;

configureIndexerEntrypoint({
  sources: Object.keys(contracts),
});

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.DATABASE_URL,
    poolConfig: {
      max: 100,
    },
  },
  ordering: "multichain",
  chains: {
    baseSepolia: {
      id: CHAIN_IDS.baseSepolia,
      rpc: process.env.PONDER_RPC_URL_84532,
    },
  },
  contracts,
});
