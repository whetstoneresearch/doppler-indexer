import { BLOCK_INTERVALS } from "./config/const";

export enum NetworkEnum {
    mainnet = "mainnet",
    base = "base",
    unichain = "unichain",
    ink = "ink",
}

export type L2Network = Exclude<Network, "mainnet">;
export type Network = keyof typeof NetworkEnum;

export type NetworkSettings = {
    chainId: number;
    rpc: string;
};

const defaultNetworks: L2Network[] = [NetworkEnum.base, NetworkEnum.ink, NetworkEnum.unichain] as const;

export default {
    interval: BLOCK_INTERVALS.FIVE_MINUTES,
    enabledNetworks: process.env.ENABLED_NETWORKS ? process.env.ENABLED_NETWORKS.split(",") as L2Network[] : defaultNetworks,
    mainnet: {
        chainId: process.env.MAINNET_CHAIN_ID ? parseInt(process.env.MAINNET_CHAIN_ID) : 1,
        rpc: process.env.MAINNET_RPC!,
    },
    base: {
        chainId: process.env.BASE_CHAIN_ID ? parseInt(process.env.BASE_CHAIN_ID) : 8453,
        rpc: process.env.BASE_RPC!,
    },
    unichain: {
        chainId: process.env.UNICHAIN_CHAIN_ID ? parseInt(process.env.UNICHAIN_CHAIN_ID) : 130,
        rpc: process.env.UNICHAIN_RPC!,
    },
    ink: {
        chainId: process.env.INK_CHAIN_ID ? parseInt(process.env.INK_CHAIN_ID) : 57073,
        rpc: process.env.INK_RPC!,
    },
} as const satisfies Record<Network, NetworkSettings> & { interval: number, enabledNetworks: L2Network[] };