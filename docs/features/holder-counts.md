# Holder counts

How many distinct wallets hold a token, maintained incrementally as transfers
are indexed.

## Scope

- `token.holderCount` — the authoritative count for an asset.
- `pool.holderCount` — a mirror of the token's count, denormalized onto the pool
  row so explore/integrator queries can filter and sort (`pool_holder_count_idx`,
  `pool_chain_quote_holders_idx`) without joining `token`.
- Maintained by the two ERC20-style transfer handlers: `DERC20:Transfer` and
  `ZoraCreatorCoinV4:CoinTransfer`.

Not in scope:

- `asset.holderCount` — present in the schema, initialized to `0`, and never
  written by any handler. Do not read it.
- `poolHourBucket.holderCount` / other bucket snapshots.
- Content coins (`ZoraCoinV4`) — those handlers are commented out.

## Invariants

1. **`token.holderCount` is authoritative; `pool.holderCount` mirrors it.**
   Every write sets both rows to the same value. The pool count is never derived
   from its own previous value.
2. A wallet is a holder when its balance is `> 0`. The zero address is never a
   holder, so mints only add and burns only remove.
3. The count includes contract addresses (pool manager, hook, the coin itself) —
   whatever holds a positive balance. The backfill counts the same way, so live
   and backfilled rows agree.
4. Counts never go negative.

Invariant 1 is the one that matters. A pool row is created *after* its token's
first transfers: a Zora creator coin mints its supply inside its initializer,
and the factory emits `CreatorCoinCreated` (which inserts the pool row) later in
the same transaction. A pool counter that accumulated its own deltas would start
life already behind the token and could never catch up — that is the bug this
design exists to prevent.

## Control flow

### `ZoraCreatorCoinV4:CoinTransfer` (`src/indexer/indexer-zora.ts`)

1. `db.find(token, ...)`. On a miss — which is the normal case for the mint
   transfers in the creation transaction, since they precede
   `CreatorCoinCreated` — the token is created by `upsertTokenWithPool` with
   `poolAddress: null`.
2. `batchUpsertUsersAndAssets` (`shared/entities/user-optimized.ts`) reads the
   previous `userAsset` balances, writes the new absolute balances carried by
   the event, and returns a `holderCountDelta` from
   `computeHolderCountDelta` (`shared/entities/holder-count.ts`).
3. When the delta is non-zero, `batchUpdateHolderCounts` writes
   `nextHolderCount(tokenHolderCount, delta)` to `token`, then the same value to
   `pool` when the token has a pool row. When `token.pool` is still `null`
   (step 1), only the token is written — the pool picks the count up at creation.

### `ZoraFactory:CreatorCoinCreated` (`src/indexer/indexer-zora.ts`)

`insertZoraPoolV4Optimized` (`shared/entities/zora/pool.ts`) seeds the new pool's
`holderCount` from the token row rather than starting at `0`, so a coin that is
created and never traded still reports its mint holders.

`ZoraCreatorCoinV4:LiquidityMigrated` carries the count across to the new pool
row by spreading the old pool entity into the update.

### `DERC20:Transfer` (`src/indexer/indexer-shared.ts`)

Computes the delta from the `userAsset` balances it already loaded and writes
`tokenData.holderCount + delta` to both `token` and `pool` — the same
token-authoritative rule, inlined.

## Files

| File | Role |
| --- | --- |
| `src/indexer/shared/entities/holder-count.ts` | `computeHolderCountDelta`, `nextHolderCount` — the pure rules, unit tested |
| `src/indexer/shared/entities/user-optimized.ts` | `batchUpsertUsersAndAssets` (balances + delta), `batchUpdateHolderCounts` (token + pool writes) |
| `src/indexer/shared/entities/zora/pool.ts` | `insertZoraPoolV4Optimized` — seeds `holderCount` from the token at pool creation |
| `src/indexer/indexer-zora.ts` | `ZoraCreatorCoinV4:CoinTransfer`, `ZoraFactory:CreatorCoinCreated` |
| `src/indexer/indexer-shared.ts` | `DERC20:Transfer` |
| `ponder.schema.ts` | `token.holderCount`, `pool.holderCount` and their indices |
| `scripts/backfill-zora-creator-holders.mjs` | Recomputes creator coin counts from indexed `CoinTransfer` logs |

## Backfill

`scripts/backfill-zora-creator-holders.mjs` recomputes counts for existing rows.
It reads `CoinTransfer` logs from `ponder_sync.logs` — no re-sync needed — and
derives balances from the absolute post-transfer balances the event carries, so
it does not depend on seeing every log.

```bash
# dry run: prints stored vs computed per coin
node scripts/backfill-zora-creator-holders.mjs --schema prod_1

# write holder_count on token + pool
node scripts/backfill-zora-creator-holders.mjs --schema prod_1 --apply

# also repair user / user_asset so future deltas start from correct balances
node scripts/backfill-zora-creator-holders.mjs --schema prod_1 --with-balances --apply
```

Verify afterwards:

```sql
SELECT t.address, t.holder_count AS token_hc, p.holder_count AS pool_hc
FROM token t JOIN pool p ON p.address = t.pool AND p.chain_id = t.chain_id
WHERE t.is_creator_coin AND t.holder_count <> p.holder_count;
```
