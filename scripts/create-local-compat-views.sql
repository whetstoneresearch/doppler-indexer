CREATE OR REPLACE VIEW public.mv_pool_day_agg_2 AS
WITH latest_ohlc AS (
  SELECT DISTINCT ON (pool, chain_id)
    pool,
    chain_id,
    open,
    close,
    volume_usd
  FROM public.fifteen_minute_bucket_usd
  ORDER BY pool, chain_id, minute_id DESC
), latest_volume AS (
  SELECT DISTINCT ON (pool_address, chain_id)
    pool_address,
    chain_id,
    volume_usd
  FROM public.volume_bucket_24h
  ORDER BY pool_address, chain_id, timestamp DESC
)
SELECT
  p.address AS pool,
  p.chain_id,
  COALESCE(latest_volume.volume_usd, latest_ohlc.volume_usd, p.volume_usd) AS volume,
  p.percent_day_change,
  COALESCE(latest_ohlc.open, p.price) AS open,
  COALESCE(latest_ohlc.close, p.price) AS close
FROM public.pool AS p
LEFT JOIN latest_ohlc
  ON latest_ohlc.pool = p.address
  AND latest_ohlc.chain_id = p.chain_id
LEFT JOIN latest_volume
  ON latest_volume.pool_address = p.address
  AND latest_volume.chain_id = p.chain_id;
