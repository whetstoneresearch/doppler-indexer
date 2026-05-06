# Doppler V3 Indexer — Configs & Usage

## Multicurve Quickstart

- Prereqs: pnpm installed and Postgres reachable; copy `.env.local.example` to `.env.local` and set required RPC URLs and DB connection.
- Dev run: `pnpm run dev --config ./ponder.config.multicurve.ts`
- Prod run: `pnpm run start --config ./ponder.config.multicurve.ts`

This uses the `ponder.config.multicurve.ts` file to index the Multicurve setup. Logs will show chains and contracts being synced according to that config.

This package ships with multiple Ponder configs so you can index different networks or a Zora‑only subset. You can select a config at runtime via `--config` when using `ponder dev` or `ponder start`.

## Configs

- `ponder.config.ts`: Multichain (Base, Unichain, Ink) + Zora listeners on Base.
- `ponder.config.multichain.ts`: Multichain (same scope as above).
- `ponder.config.multicurve.ts`: Multicurve indexing setup.
- `ponder.config.zora.ts`: Zora-only on Base (limits chains/contracts to Zora needs).

## Run

From this package directory:

- Dev (hot reload): `ponder dev --config ./ponder.config.ts`
- Prod: `ponder start --config ./ponder.config.ts`

Swap the config path to target a different setup, for example:

- Multichain: `ponder dev --config ./ponder.config.multichain.ts`
- Zora-only: `ponder dev --config ./ponder.config.zora.ts`

## Local Base/Ethereum Frontend Testing

Use `ponder.config.local.ts` when testing the frontend against a small local indexer for the Ethereum rollout. This config is intentionally ignored by git and should stay local to your machine. Copy `ponder.config.local.ts.example` as a reference point.

From this package directory:

```bash
docker compose up -d
pnpm run dev --config ./ponder.config.local.ts
```

The local config expects the usual local database and RPC environment variables:

- `DATABASE_URL`
- `PONDER_RPC_URL_*` entry for each utilized chain ID

If you need a clean local database, reset the Docker volume and let Ponder recreate the schema:

```bash
docker compose down -v
docker compose up -d
pnpm run dev --config ./ponder.config.local.ts
```

### Config-Driven Handler Registration

The local config also controls which indexer handlers are registered. This was necessary because Ponder loads the indexer files and validates every registered `ponder.on(...)` source against the active config. When we were only trying to test limited frontend behavior, unrelated handlers for other chains still got loaded and caused Ponder to look for sources that were not part of the local config.

To keep local runs focused, handlers now register through `onIndexerEvent(...)` from `src/indexer/entrypoint.ts` instead of calling `ponder.on(...)` directly. `ponder.config.local.ts` calls `configureIndexerEntrypoint(...)` with the source names from its own `blocks` and `contracts` objects. During local runs, only handlers whose event source appears in that configured source list are registered. Without that configuration, the default behavior is unchanged and all handlers register normally.

In practice, this means the Ponder config now defines both what gets indexed and which handler sources are eligible to run. For local limited-chain testing, that keeps other unrelated paths out of the run unless the local config explicitly includes them.

### Local SQL Compatibility View

The frontend expects a production database relation named `mv_pool_day_agg_2` for Explore/search/trending-style SQL queries. A local Ponder run creates the underlying source tables, such as `pool`, `fifteen_minute_bucket_usd`, and `volume_bucket_24h`, but Ponder does not create that custom production relation from `ponder.schema.ts`.

After the local indexer has created the schema, run:

```bash
pnpm run db:local-compat
```

This applies `scripts/create-local-compat-views.sql` to the Docker Compose Postgres service and creates or replaces `public.mv_pool_day_agg_2` as a normal Postgres view. The view exposes the frontend-required columns `pool`, `volume`, `percent_day_change`, `open`, and `close` using local indexed data.

Run `pnpm run db:local-compat` again any time you reset the local database with `docker compose down -v`. You do not need to rerun it for every indexer restart unless the database volume was recreated or the view was dropped.

## Notes

- RPC env vars live in `.env.local` (see `.env.local.example`). Common ones:
  - Base: `PONDER_RPC_URL_8453`
  - Unichain: `PONDER_RPC_URL_130`
  - Ink: `PONDER_RPC_URL_57073`
  - Monad: `PONDER_RPC_URL_143`
- The database connection defaults to Postgres at `postgresql://postgres:postgres@localhost:5432/default` (see `docker-compose.yml`).
