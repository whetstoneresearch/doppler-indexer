# Overview

```yaml
Overview:
  description: >
    Ponder-based multichain indexer for the Doppler protocol. Indexes token
    launches (Airlock creates), bonding-curve and migrated pools across
    Uniswap V2/V3/V4 (plus Zora and Doppler-hook variants), swaps, fees, and
    market metrics into Postgres, and serves them via the Ponder API.
  subsystems:
    config: >
      src/config — per-chain ChainConfig objects (addresses, start blocks,
      RPC env vars) merged into `chainConfigs`; ponder.config.ts builds the
      Ponder contracts/blocks/chains config from them.
    schema: >
      ponder.schema.ts — Postgres tables (onchainTable): tokens, pools,
      swaps, positions, per-asset metrics, and per-quote-token price series
      (eth_price, zora_usdc_price, ..., stock_usd_price).
    indexer: >
      src/indexer — event handlers per protocol version (indexer-v2/v3/v4,
      -dhook, -zora, -multicurve) plus block-interval handlers
      (blockHandlers.ts) that snapshot oracle/pool prices every ~5 minutes.
    pricing: >
      src/indexer/shared/oracle.ts fetch<X>Price helpers read the snapshot
      tables (walk-back over 5-min buckets, RPC fallback);
      src/utils/getQuoteInfo.ts classifies a pool's quote token and returns
      its USD price + decimals for swap/metric computation.
    core: >
      src/core — pure services (PriceService, MarketDataService,
      SwapService/SwapOrchestrator) used by handlers.
    api: >
      src/api — read endpoints over the indexed tables.
  data_flow: >
    Block handlers write per-quote-token USD price rows keyed by rounded
    5-minute timestamp. Swap/pool event handlers call getQuoteInfo(quote
    address) -> QuoteToken kind + quotePrice (from the price tables, with
    cached RPC fallback) -> SwapService/MarketDataService compute USD
    volumes, liquidity, and market cap stored on pool/asset/metric tables.

Features Index:
  stock_quote_tokens:
    description: >
      Robinhood-chain tokenized equities/ETFs (AAPL, TSLA, ...) supported as
      quote tokens, priced in USD via their Chainlink feeds.
    entry_points:
      - "RobinhoodStockPriceFeed:block (src/indexer/blockHandlers.ts)"
      - "getQuoteInfo (src/utils/getQuoteInfo.ts)"
    depends_on: [quote_token_pricing]
    doc: docs/features/stock-quote-tokens.md
  quote_token_pricing:
    description: >
      Per-quote-token USD price snapshots (ETH, ZORA, FXH, NOICE, MON, EURC,
      BANKR, stables, stocks) written on block intervals and read back by
      getQuoteInfo during swap indexing.
    entry_points:
      - "src/indexer/blockHandlers.ts"
      - "src/indexer/shared/oracle.ts"
      - "src/utils/getQuoteInfo.ts"
    depends_on: []
    doc: docs/features/stock-quote-tokens.md
```
