# Doppler V3 Indexer — Configs & Usage

## Multicurve Quickstart

- Prereqs: Bun installed and Postgres reachable; copy `.env.local.example` to `.env.local` and set required RPC URLs and DB connection.
- Dev run: `bun run dev --config ./ponder.config.multicurve.ts`
- Prod run: `bun run start --config ./ponder.config.multicurve.ts`

This uses the `ponder.config.multicurve.ts` file to index the Multicurve setup. Logs will show chains and contracts being synced according to that config.

This package ships with multiple Ponder configs so you can index different networks or a Zora‑only subset. You can select a config at runtime via `--config` when using `ponder dev` or `ponder start`.

## Configs

- `ponder.config.ts`: Multichain (Base, Unichain, Ink) + Zora listeners on Base.
- `ponder.config.multichain.ts`: Multichain (same scope as above).
- `ponder.config.multicurve.ts`: Multicurve indexing setup.
- `ponder.confg.zora.ts`: Zora‑only on Base (limits chains/contracts to Zora needs).

## Run

From this package directory:

- Dev (hot reload): `ponder dev --config ./ponder.config.ts`
- Prod: `ponder start --config ./ponder.config.ts`

Swap the config path to target a different setup, for example:

- Multichain: `ponder dev --config ./ponder.config.multichain.ts`
- Zora‑only: `ponder dev --config ./ponder.config.zora.ts`

## Notes

- RPC env vars live in `.env.local` (see `.env.local.example`). Common ones:
  - Base: `PONDER_RPC_URL_8453`
  - Unichain: `PONDER_RPC_URL_130`
  - Ink: `PONDER_RPC_URL_57073`
- The database connection defaults to Postgres at `postgresql://postgres:postgres@localhost:5432/default` (see `docker-compose.yml`).
