# Stock Tokens as Quote Tokens (Robinhood Chain)

## Scope

Support Robinhood-chain tokenized equities/ETFs (Robinhood Stock Tokens:
AAPL, TSLA, NVDA, SPY, ...) as pool quote tokens, pricing them in USD via
their Chainlink `<SYMBOL> / USD` feeds — the same snapshot-table +
walk-back + RPC-fallback pattern used for ETH and the other quote tokens.

Non-scope:

- Stock tokens as launched *assets* (they are only numeraires here).
- Stock tokens without a Chainlink feed (e.g. NFLX, QCOM as of 2026-07);
  those fall through to unknown-quote-token handling ($1e-21 placeholder).
- Robinhood-chain ETH/USDG feeds (ETH still sources from Base; USDG is
  hardcoded to $1).

## Data / control flow

1. `RobinhoodStockPriceFeed` block source (ponder.config.ts) fires every
   ~5 minutes on robinhood (`BLOCK_INTERVALS.FIVE_MINUTES_ROBINHOOD` = 3000
   blocks at ~10 blk/s), starting at `robinhood.startBlock` (367349; the
   Chainlink stock feeds were deployed around block 97950, so all ticks have
   live feeds).
2. The handler (src/indexer/blockHandlers.ts) reads `latestAnswer` (8-dec
   USD) from every feed in `chainConfigs.robinhood.addresses.stockTokens`
   in parallel and inserts one `stock_usd_price` row per token keyed by
   `(address, roundedTimestamp + 300, chainId)`. Per-feed read failures are
   logged and skipped so a feed added after startBlock cannot fail the batch.
3. During swap indexing, `getQuoteInfo` (src/utils/getQuoteInfo.ts) calls
   `getStockTokenConfig(chain, quoteAddress)`; a hit classifies the quote as
   `QuoteToken.Stock` (18 token decimals, 8 price decimals) and prices it via
   `fetchStockPrice` (src/indexer/shared/oracle.ts): exact-bucket memo →
   5-min bucket walk-back (max 72 buckets) → 30s-cached `latestAnswer` RPC
   fallback.

Feeds update 24/5 (equity market hours); on weekends `latestAnswer` returns
the Friday close, which is the correct mark for USD metrics.

## Related files

- `src/types/config-types.ts` — `StockTokenConfig` { symbol, address,
  chainlinkOracle }; `ChainAddresses.stockTokens?`.
- `src/config/chains/robinhood.ts` — the token → feed map (34 entries).
  Token addresses are the canonical Robinhood Stock Tokens (BeaconProxies
  deployed by `0x4783C67b...C046`, implementation `0xb35490d6...5aE2`);
  feed proxies from Chainlink's Robinhood feed directory.
- `src/config/chains/index.ts` — `getStockTokenConfig` lazy lowercase-map
  lookup (O(1); getQuoteInfo runs per swap).
- `src/config/chains/constants.ts` — `FIVE_MINUTES_ROBINHOOD`.
- `ponder.schema.ts` — `stockUsdPrice` ("stock_usd_price") table.
- `ponder.config.ts` — `RobinhoodStockPriceFeed` block source.
- `src/indexer/blockHandlers.ts` — snapshot handler.
- `src/indexer/shared/oracle.ts` — `fetchStockPrice`.
- `src/utils/getQuoteInfo.ts` — `QuoteToken.Stock` classification/pricing.
- `src/config/chains/__tests__/stockTokens.test.ts` — config-integrity and
  lookup tests.

## Invariants and constraints

- `stockTokens[].address` MUST be the canonical Robinhood Stock Token —
  lookalike ERC20s with identical symbols exist on the chain; verify the
  BeaconProxy deployer before adding an entry.
- Config addresses are lowercase; `stock_usd_price.address` rows and lookups
  are lowercased so the PK matches regardless of caller casing.
- All current stock tokens have 18 decimals and all feeds 8 decimals; a
  future entry deviating from that requires extending `getQuoteInfo`'s
  decimals logic.
- Token, oracle, and symbol values must be unique and must not collide with
  other configured quote tokens (enforced by tests).
