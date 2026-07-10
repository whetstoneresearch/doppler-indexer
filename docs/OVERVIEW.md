# Overview

```yaml
Overview:
  description: >
    Ponder-based multichain indexer for the Doppler protocol. Ingests pool
    lifecycle, swap, liquidity, and price-oracle events across mainnet, base,
    unichain, ink, monad, sepolia/base-sepolia, and robinhood, and materializes
    tokens, assets, pools, swaps, positions, and time-bucketed market data into
    Postgres for the Doppler apps (e.g. app.doppler.lol).
  subsystems:
    config: >
      ponder.config.ts declares chains, contract event sources, and block
      handlers. Per-chain addresses live in src/config/chains/<chain>.ts.
      Contract names in the config map 1:1 to the "<Contract>:<Event>" handler
      names registered via onIndexerEvent (src/indexer/entrypoint.ts), which
      can be scoped with DOPPLER_INDEXER_SOURCES.
    indexers: >
      src/indexer/indexer-*.ts registers event handlers per protocol flavor:
      v2/v3 pools, v4 dynamic auctions (UniswapV4Pool), v4 multicurve
      (plain/scheduled/decay), zora coins, and doppler-hook pools
      (indexer-dhook.ts, covering both plain dhook and rehype variants).
      indexer-shared.ts handles Airlock lifecycle (Create/Migrate) and DERC20
      transfers.
    entities: >
      src/indexer/shared/entities/* owns table upserts (pool, token, asset,
      swap, v4pools, position ledger, beneficiaries). src/core/* holds pure
      services (PriceService, MarketDataService, SwapService, SwapOrchestrator)
      and the swap-optimizer fast path.
    caches: >
      In-memory caches gate hot handlers: dhookPoolCache (dhook/rehype pools +
      liquidity-seeding senders), v4MigrationPoolCache (post-migration v4
      pools consumed by PoolManager:Swap), zora pool cache. All are re-seeded
      from the DB on startup and must be updated at insert/link time to work
      before a restart.
    oracles: >
      Block handlers sample Chainlink/derived prices into eth_price and
      sibling tables; fetchEthPrice falls back to a direct RPC read (base as
      source chain for chains without their own oracle, e.g. robinhood).
  data_flow: >
    Airlock:Create / initializer Create events -> token/asset/pool rows ->
    per-flavor Swap events update pool metrics, buckets, and the swap table ->
    Airlock:Migrate links the bonding pool to its migration pool (v2/v3 pool
    row or v4pools row) -> post-migration swaps arrive via PoolManager:Swap
    gated by v4MigrationPoolCache + isV4MigratorHook. Position ledger rows are
    event-sourced from PoolManager:ModifyLiquidity and drive reserve/liquidity
    computation.

Features Index:
  swap_indexing:
    description: How swap rows and per-swap market updates are produced for
      every pool flavor, including dhook/rehype bonding pools and migrated
      v4 pools.
    entry_points:
      - src/indexer/indexer-dhook.ts (DopplerHookInitializer:Swap)
      - src/indexer/indexer-v4.ts (UniswapV4Pool:Swap, PoolManager:Swap)
      - src/indexer/shared/swap-optimizer.ts (handleOptimizedSwap)
      - src/core/swaps/SwapOrchestrator.ts (performSwapUpdates)
    depends_on: [dhook_pools]
    doc: docs/features/swap-indexing.md
  dhook_pools:
    description: Doppler-hook (dhook) and rehype pool lifecycle — creation via
      DopplerHookInitializer, hook-module classification, graduation via
      DopplerHookMigrator with optional rehype fee module.
    entry_points:
      - src/indexer/indexer-dhook.ts
      - src/indexer/shared/entities/pool.ts (insertPoolIfNotExistsDHook)
      - src/indexer/shared/entities/v4pools.ts (linkAssetToDHookMigrationPool)
    depends_on: []
    doc: docs/features/swap-indexing.md
```
