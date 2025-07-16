import { DatabaseConfig } from "ponder";

interface ISettings {
    dbSettings: DatabaseConfig;
    enabledChains: ("baseSepolia" |  "unichain" | "ink" | "base")[]
}

export default {
    dbSettings: {
        kind: "postgres",
        connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/default",
        poolConfig: {
            max: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX) : 100,
        },
    },
    enabledChains: ["baseSepolia"] as const,
} satisfies ISettings;
