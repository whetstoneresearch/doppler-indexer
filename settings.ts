import { DatabaseConfig } from "ponder";

export type Network =
    "baseSepolia" |
    // "unichain" |
    // "ink" |
    // "base" |
    "mainnet";
interface ISettings {
    dbSettings: DatabaseConfig;
    enabledChains: Network[]
}

export default {
    dbSettings: {
        kind: "postgres",
        connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/default",
        poolConfig: {
            max: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX) : 100,
        },
    },
    enabledChains: process.env.ENABLED_CHAINS?.split(",") as Network[],
} satisfies ISettings;
