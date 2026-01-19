# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development with hot reload
pnpm dev --config ./ponder.config.multicurve.ts

# Production
pnpm start --config ./ponder.config.multicurve.ts

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run all tests
pnpm test

# Run tests once (CI mode)
pnpm test:run

# Run single test file
pnpm test src/core/market/__tests__/MarketDataService.test.ts

# Codegen (regenerate Ponder types after schema changes)
pnpm codegen
```

## Configuration

Multiple Ponder configs exist for different deployment targets:
- `ponder.config.multicurve.ts` - Multicurve protocol (primary)
- `ponder.config.ts` - Multichain + Zora (Base, Unichain, Ink)
- `ponder.config.zora.ts` - Zora-only on Base

Environment variables: Copy `.env.local.example` to `.env.local`. RPC URLs follow pattern `PONDER_RPC_URL_{chainId}`.

## Architecture Overview

This is a **Ponder-based blockchain indexer** for Doppler protocol, indexing Uniswap V2/V3/V4 pools across multiple chains.

### Core Layers

```
src/
├── indexer/           # Ponder event handlers (entry points)
│   ├── indexer-v3.ts       # V3 pool creation & swap handlers
│   ├── indexer-v4.ts       # V4 pool handlers
│   ├── indexer-v4-scheduled.ts  # Multicurve scheduled pools
│   ├── indexer-shared.ts   # Migrations, transfers
│   ├── blockHandlers.ts    # Price feed updates (Chainlink)
│   └── shared/entities/    # Database entity insert/update logic
├── core/              # Business logic (protocol-agnostic)
│   ├── pricing/PriceService.ts    # Price from sqrtPriceX96/reserves
│   ├── market/MarketDataService.ts # Market cap, liquidity, volume
│   └── swaps/SwapOrchestrator.ts  # Coordinates swap-related updates
├── config/chains/     # Per-chain contract addresses & start blocks
├── utils/             # Protocol-specific utilities (v2/v3/v4-utils/)
├── types/             # TypeScript type definitions
└── abis/              # Contract ABIs (v3-abis/, v4-abis/, multicurve-abis/)
```

### Data Flow Pattern

```
Blockchain Event → Handler (indexer/*.ts)
  → isPrecompileAddress() (skip invalid/precompile pools)
  → insertTokenIfNotExists() / insertPoolIfNotExists()
  → PriceService.computePriceFromSqrtPriceX96()
  → MarketDataService.calculateMarketCap()
  → SwapOrchestrator.performSwapUpdates()
  → Database upserts (pool, asset, swap, time buckets)
```

### Key Patterns

**Pool Validation**: `src/indexer/shared/validatePool.ts` checks if pool currencies are precompiles (invalid). Invalid pools are cached in-memory and persisted to `invalidPools` table to skip on future events.

**Quote Token Resolution**: Different chains use different quote tokens (ETH, USDC, Zora, Monad). `getQuoteInfo` utility determines quote type and fetches appropriate price feeds.

**Price Precision**: All prices use WAD (18 decimals). Services handle conversion from Chainlink (8 decimals) and token-specific decimals.

**Time Buckets**: OHLC aggregation at 15-minute (`fifteenMinuteBucketUsd`), hourly (`hourBucket`), and daily (`volumeBucket24h`) intervals.

### Schema

Defined in `ponder.schema.ts` using Ponder's `onchainTable`. Key tables:
- `pool` / `v4pools` - Pool state and metrics
- `asset` - Token metadata with market data
- `token` - ERC20 token info
- `swap` - Transaction-level swap records
- `ethPrice` / `usdcPrice` / etc. - Quote price feeds

### Adding New Contracts

1. Add ABI to `src/abis/`
2. Add contract config in `ponder.config.*.ts`
3. Create handler in `src/indexer/`
4. Run `pnpm codegen` to regenerate types

### Path Aliases

`@app` and `@app/*` map to `src/` directory.
