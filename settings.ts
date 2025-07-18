import { DatabaseConfig } from "ponder";

export type DopplerEnv = "dev" | "stage" | "prod";

export type Network =
    "baseSepolia" |
    "unichain" |
    "ink" |
    "base";

interface ISettings {
    dbSettings: DatabaseConfig;
    dopplerEnv: DopplerEnv;
}

export default {
    dbSettings: {
        kind: "postgres",
        connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/default",
        poolConfig: {
            max: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX) : 100,
        },
    },
    dopplerEnv: process.env.DOPPLER_ENV as DopplerEnv,
} satisfies ISettings;
