CREATE MATERIALIZED VIEW ${schema_name}.mv_pool_day_agg_2
TABLESPACE pg_default
AS WITH bounds AS (
         SELECT EXTRACT(epoch FROM now() - '24:00:00'::interval)::bigint AS start_epoch,
            EXTRACT(epoch FROM now())::bigint AS end_epoch
        ), recent AS (
         SELECT f.pool,
            f.minute_id,
            f.volume_usd,
            f.open,
            f.close,
            f.high,
            f.low
           FROM ${schema_name}.fifteen_minute_bucket_usd f
             CROSS JOIN bounds b
          WHERE f.minute_id >= b.start_epoch AND f.minute_id < b.end_epoch
        ), per_pool AS (
         SELECT r.pool,
            sum(r.volume_usd) AS volume,
            max(r.high) AS high,
            min(r.low) AS low
           FROM recent r
          GROUP BY r.pool
        ), fo AS (
         SELECT DISTINCT ON (r.pool) r.pool,
            r.open AS first_open
           FROM recent r
          ORDER BY r.pool, r.minute_id
        ), lc AS (
         SELECT DISTINCT ON (r.pool) r.pool,
            r.close AS last_close
           FROM recent r
          ORDER BY r.pool, r.minute_id DESC
        ), combined AS (
         SELECT p.pool,
            COALESCE(per_pool.volume, 0::numeric) AS volume,
            fo.first_open,
            lc.last_close,
            per_pool.high,
            per_pool.low
           FROM ( SELECT pool.address AS pool
                   FROM ${schema_name}.pool) p
             LEFT JOIN per_pool ON p.pool = per_pool.pool
             LEFT JOIN fo ON p.pool = fo.pool
             LEFT JOIN lc ON p.pool = lc.pool
        )
 SELECT pool,
    volume,
    first_open AS open,
    last_close AS close,
    high,
    low,
        CASE
            WHEN first_open IS NOT NULL AND last_close IS NOT NULL THEN (last_close - first_open) / NULLIF(first_open, 0::numeric)::numeric * 100.0
            ELSE NULL::numeric
        END AS percent_day_change
   FROM combined c
  ORDER BY pool
WITH DATA;
