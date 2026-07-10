# Swap indexing

## Scope

How a swap on any Doppler pool flavor becomes (a) a row in the `swap` table and
(b) per-swap updates to `pool`, `asset`, and the 15-minute USD buckets. Covers
bonding-phase pools (v2, v3, v4 dynamic auction, multicurve, dhook/rehype,
zora) and post-migration v4 pools.

Non-scope: pool creation/graduation mechanics, position-ledger reserve
computation, price oracles (referenced only as inputs).

## Two write paths

Every swap handler ends in exactly one of these:

1. **`handleOptimizedSwap`** (`src/indexer/shared/swap-optimizer.ts`) — the
   consolidated fast path. One `Promise.all` performs: pool update (merged
   swap fields + reserves/sqrtPrice), 15-minute bucket update, asset
   update-or-insert, and `insertSwapIfNotExists`. Used by the multicurve
   family (plain: `indexer-v4.ts`, scheduled: `indexer-v4-scheduled.ts`,
   decay: `indexer-v4-decay.ts`) and zora (`indexer-zora.ts`).

2. **`SwapOrchestrator.performSwapUpdates`** (`src/core/swaps/SwapOrchestrator.ts`)
   — the shared orchestrator. Same four writes (pool via caller-supplied
   `updatePool` with optional `extraPoolUpdate` merge, bucket, asset,
   `insertSwapIfNotExists`). Used by v2 (`indexer-v2.ts`), v3
   (`indexer-v3.ts`), v4 dynamic auctions (`UniswapV4Pool:Swap`),
   dhook/rehype bonding pools (`DopplerHookInitializer:Swap`), and migrated
   v4 pools (`PoolManager:Swap`).

`insertSwapIfNotExists` (`src/indexer/shared/entities/swap.ts`) dedupes on the
`(txHash, chainId)` primary key, so transactions emitting multiple swap events
(e.g. rehype buyback swaps, multi-hop routes) produce one row.

## Event sources per pool flavor

- **dhook / rehype bonding pools**: the `DopplerHookInitializer` contract is
  the v4 hook for its pools and re-emits a `Swap(sender, poolKey, poolId,
  params, amount0, amount1, hookData)` event alongside the canonical
  `PoolManager.Swap`. The handler (`indexer-dhook.ts`) looks the pool up by
  `poolId`, reads slot0 via StateView, recomputes reserves from the position
  ledger, and dispatches to `performSwapUpdates`. Rehype pools differ from
  plain dhook only by their per-pool hook module (`poolConfig.dopplerHook`
  matching `RehypeDopplerHookInitializer` in chain config ⇒ `pool.type =
  'rehype'`); the swap path is identical. The rehype module contracts emit
  only fee events (`FeeUpdated`/`FeeScheduleSet`), never `Swap` — do not add
  them as swap sources.
- **migrated v4 pools**: only `PoolManager:Swap` fires (the
  `DopplerHookMigrator` handlers are intentionally not registered). The
  handler gates on, in order: `isKnownV4MigrationPool` (in-memory
  `v4MigrationPoolCache`), `v4Pool.migratedFromPool` being set (written by
  `Airlock:Migrate` → `linkAssetTo{V4,DHook}MigrationPool`), and
  `isV4MigratorHook` (v4MigratorHook ∪ DopplerHookMigrator ∪ RehypeHook per
  chain config). Swap rows attach to the *parent* (bonding) pool address.
- **v4 dynamic auctions**: the Doppler hook emits `UniswapV4Pool:Swap`;
  amounts are derived from proceeds/tokens-sold deltas.
- **multicurve / zora**: hook contracts emit dhook-style `Swap` events,
  handled via `handleOptimizedSwap`.

## Invariants and constraints

- Every swap handler must end in `handleOptimizedSwap` or
  `performSwapUpdates`; both write the `swap` row. A handler that updates
  pool metrics without one of these silently produces pools with charts but
  no trade history (this was the rehype/dhook bug fixed on
  `feat/rehype-swaps`).
- The same on-chain swap must reach only one handler that writes. Bonding
  dhook/rehype and dynamic-auction swaps also emit `PoolManager.Swap`, but
  the `PoolManager:Swap` handler early-returns for pools not in the
  migration-pool cache, so there is no double write. The `(txHash, chainId)`
  PK is the backstop.
- `v4MigrationPoolCache` is seeded from the DB (rows with
  `migratedFromPool != null`) only at startup. Any code that links a
  migration pool during live indexing must call `addToV4MigrationPoolCache`
  itself, or swaps are dropped until the next restart.
  `linkAssetToDHookMigrationPool` does this; `UniswapV4Migrator:Migrate`
  covers the plain-v4 path.
- `RehypeDopplerHookMigrator` deployments are hook modules, not full
  migrators: they have **no `getAssetData`** (reverts on-chain) and expose
  the underlying `DopplerHookMigrator` via `MIGRATOR()`.
  `linkAssetToDHookMigrationPool` must resolve asset data through
  `MIGRATOR()` when `isRehypeMigrator` matches.
- `performSwapUpdates`/`handleOptimizedSwap` assume the pool row and base
  token row already exist (created by the flavor's `Create` handler); the
  dhook handler warns and skips otherwise.
- `insertSwapIfNotExists` requires `swapValueUsd`; callers compute it from
  the quote-side delta and the oracle price (`getQuoteInfo`), which falls
  back to a live Chainlink RPC read on chains without a local price table
  (e.g. robinhood sources ETH price from base).

## Backfill

`scripts/backfill-swaps.mjs` reconstructs swap rows missed while
`performSwapUpdates` did not write them. It scans
`DopplerHookInitializer.Swap` logs (dhook/rehype bonding) and
`PoolManager.Swap` logs for migrated `v4_pools` ids, rebuilds each row with
the same amount/type/volume math as the handlers (pricing from the
`eth_price` / `monad_usdc_price` tables at the swap's 5-minute bucket), and
inserts with `ON CONFLICT (tx_hash, chain_id) DO NOTHING` — idempotent and
safe to run after the fixed indexer is live. Dry-run by default; `--apply`
to write. It does not cover v2/v3/v4-dynamic-auction pools.

## Related files

- `src/core/swaps/SwapOrchestrator.ts` — `createSwapData`,
  `performSwapUpdates` (pool/bucket/asset/swap writes).
- `src/core/swaps/SwapService.ts` — `SwapData` shape, swap-type
  determination, `formatPoolUpdate`.
- `src/indexer/shared/swap-optimizer.ts` — `handleOptimizedSwap` fast path.
- `src/indexer/shared/entities/swap.ts` — `insertSwapIfNotExists`.
- `src/indexer/indexer-dhook.ts` — dhook/rehype Create/Swap/ModifyLiquidity
  handlers.
- `src/indexer/indexer-v4.ts` — dynamic auction swap, `PoolManager:Swap`
  (migrated pools), `PoolManager:Initialize` (v4pools row creation).
- `src/indexer/shared/entities/v4pools.ts` — migration-pool linking
  (`linkAssetToV4MigrationPool`, `linkAssetToDHookMigrationPool`).
- `src/indexer/shared/v4MigrationPoolCache.ts`,
  `src/indexer/shared/dhookPoolCache.ts` — hot-path gates.
- `src/utils/v4-utils/getV4MigrationPoolData.ts` — `isV4MigratorHook`,
  `isRehypeMigrator`, `getDHookMigratorForAsset`.
