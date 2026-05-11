# Analytics API Documentation

The Doppler V3 Indexer provides several analytics endpoints that leverage the pre-aggregated bucket data for efficient querying.

## Base URL
```
http://localhost:42069
```

## Endpoints

### 1. Top Tokens by 24h Volume
Get the top tokens ranked by 24-hour trading volume for a specific chain.

```
GET /analytics/top-volume/:chainId
```

**Parameters:**
- `chainId` (path) - The chain ID (e.g., 1 for Ethereum, 8453 for Base)
- `limit` (query, optional) - Number of results to return (default: 100)

**Example:**
```bash
curl http://localhost:42069/analytics/top-volume/8453?limit=10
```

**Response:**
```json
[
  {
    "poolAddress": "0x...",
    "assetAddress": "0x...",
    "volumeUsd": "1234567890",
    "txCount": 150,
    "marketCapUsd": "98765432100",
    "high": "2500000000000000000",
    "low": "2400000000000000000", 
    "close": "2450000000000000000",
    "token": {
      "address": "0x...",
      "name": "Example Token",
      "symbol": "EXT",
      "decimals": 18
    }
  }
]
```

### 2. Pool Historical Volume
Get historical daily volume data for a specific pool.

```
GET /analytics/pool-history/:poolAddress
```

**Parameters:**
- `poolAddress` (path) - The pool address
- `chainId` (query) - The chain ID (default: 1)
- `days` (query, optional) - Number of days of history (default: 30)

**Example:**
```bash
curl "http://localhost:42069/analytics/pool-history/0x123...abc?chainId=8453&days=7"
```

**Response:**
```json
[
  {
    "poolAddress": "0x...",
    "timestamp": "1704067200",
    "volumeUsd": "500000000",
    "txCount": 75,
    "open": "2400000000000000000",
    "high": "2500000000000000000",
    "low": "2350000000000000000",
    "close": "2450000000000000000",
    "marketCapUsd": "100000000000"
  }
]
```

### 3. Market Overview
Get aggregated market statistics for a chain.

```
GET /analytics/market-overview/:chainId
```

**Parameters:**
- `chainId` (path) - The chain ID

**Example:**
```bash
curl http://localhost:42069/analytics/market-overview/8453
```

**Response:**
```json
{
  "totalVolumeUsd": "50000000000",
  "totalTransactions": 5000,
  "activePools": 250,
  "volumeChange24h": 15.5,
  "timestamp": "1704067200"
}
```

### 4. Top Movers
Get top gainers or losers by market cap change.

```
GET /analytics/top-movers/:chainId
```

**Parameters:**
- `chainId` (path) - The chain ID
- `type` (query, optional) - "gainers" or "losers" (default: "gainers")
- `limit` (query, optional) - Number of results (default: 20)

**Example:**
```bash
curl "http://localhost:42069/analytics/top-movers/8453?type=gainers&limit=10"
```

**Response:**
```json
[
  {
    "poolAddress": "0x...",
    "assetAddress": "0x...",
    "currentMarketCap": "1000000000",
    "previousMarketCap": "800000000",
    "changePercent": 25.0,
    "volumeUsd": "5000000",
    "price": "2500000000000000000",
    "token": {
      "address": "0x...",
      "name": "Example Token",
      "symbol": "EXT",
      "decimals": 18
    }
  }
]
```

### 5. Pool Fee Recipients
Get normalized Multicurve fee recipients for a pool, including current claimable fees when available.

Use this endpoint when displaying the complete fee-recipient list for a token. It returns every recipient's raw `shares` value for the pool, so the frontend can derive each percentage as `recipient.shares / sum(all recipient shares)`. The API does not return a separate percentage field.

```
GET /fees/recipients/:poolId?chain_id=:chainId
```

**Parameters:**
- `poolId` (path) - V4 pool ID
- `chain_id` (query) - Integer chain ID

**Example:**
```bash
curl "http://localhost:42069/fees/recipients/0xabc...?chain_id=8453"
```

**Response:**
```json
[
  {
    "pool_id": "0x...",
    "chain_id": 8453,
    "beneficiary": "0x...",
    "shares": "500000000000000000",
    "initializer": "0x...",
    "token0_fees": "1000000000000000000",
    "token1_fees": "2500000",
    "total_fees_usd": "123456"
  }
]
```

### 6. Wallet Claimable Fees
Get all pools where a wallet is a normalized fee recipient or tracked Rehype airlock owner and currently has claimable fees.

Use this endpoint for the token-page Claim Fees button and portfolio claimable-fees list. Row presence means the wallet has nonzero current claimable fees for that pool; no separate `can_claim` field is needed. Recipient percentages are not needed for claim UI state and are intentionally not included here. Rehype airlock-owner fee rows are included without fake fee-recipient rows; those rows return `shares` as `0` and may have a nullable `initializer`.

```
GET /fees/claimable/:beneficiary
```

**Parameters:**
- `beneficiary` (path) - Wallet address
- `pool_id` (query, optional) - Restrict to a single pool
- `chain_ids` (query, optional) - Comma-separated PostgreSQL integer-range chain IDs
- `limit` (query, optional) - Number of results to return (default: 100, maximum: 100)
- `offset` (query, optional) - Number of results to skip (default: 0, maximum: 10000)

**Example:**
```bash
curl "http://localhost:42069/fees/claimable/0x123...?chain_ids=8453,84532&limit=100&offset=0"
```

**Response:**
```json
[
  {
    "pool_id": "0x...",
    "chain_id": 8453,
    "beneficiary": "0x...",
    "token0_fees": "1000000000000000000",
    "token1_fees": "2500000",
    "total_fees_usd": "123456",
    "shares": "500000000000000000",
    "initializer": "0x...",
    "asset": "0x...",
    "base_token": "0x...",
    "quote_token": "0x...",
    "pool_type": "multicurve",
    "price": "1000000000000000000",
    "market_cap_usd": "1000000000",
    "name": "Example Token",
    "symbol": "EXT",
    "image": "https://..."
  }
]
```

Token metadata fields (`name`, `symbol`, `image`) may be `null` if claimable fee state is indexed before token metadata is available.

## GraphQL Queries

The bucket data is also available through GraphQL queries:

Fee recipient and current claimable-fee state is available through the `feeRecipient` and `cumulatedFees` tables. `cumulatedFees` stores current claimable amounts only; it is not a claim-history table.

### Query single bucket
```graphql
query GetBucket($poolAddress: String!, $timestamp: BigInt!, $chainId: BigInt!) {
  volumeBucket24h(
    poolAddress: $poolAddress, 
    timestamp: $timestamp, 
    chainId: $chainId
  ) {
    volumeUsd
    txCount
    high
    low
    close
    marketCapUsd
  }
}
```

### Query multiple buckets with filters
```graphql
query GetTopVolume($chainId: BigInt!, $timestamp: BigInt!) {
  volumeBucket24hs(
    where: {
      chainId: $chainId,
      timestamp: $timestamp
    },
    orderBy: "volumeUsd",
    orderDirection: "desc",
    limit: 100
  ) {
    items {
      poolAddress
      assetAddress
      volumeUsd
      marketCapUsd
      txCount
      pool {
        address
        type
      }
      asset {
        address
      }
    }
  }
}
```

### Query with time range
```graphql
query GetVolumeHistory($poolAddress: String!, $chainId: BigInt!, $startTime: BigInt!) {
  volumeBucket24hs(
    where: {
      poolAddress: $poolAddress,
      chainId: $chainId,
      timestamp_gte: $startTime
    },
    orderBy: "timestamp",
    orderDirection: "desc"
  ) {
    items {
      timestamp
      volumeUsd
      high
      low
      close
      txCount
    }
  }
}
```

## Notes

- All timestamps are in Unix seconds
- All USD values are stored as bigints (multiply by 10^18 for precision)
- Price values are in the base token's decimal precision
- The bucket data is updated in real-time as swaps occur
- Daily buckets are aligned to UTC midnight (00:00:00)
