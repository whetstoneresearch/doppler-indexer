CREATE INDEX pdc_idx ON ${schema_name}.mv_pool_day_agg_2 (percent_day_change);
CREATE UNIQUE INDEX u_pool_idx ON ${schema_name}.mv_pool_day_agg_2 (pool);
CREATE INDEX volume ON ${schema_name}.mv_pool_day_agg_2 (volume);
CREATE INDEX symbol_idx ON ${schema_name}.token (symbol);
