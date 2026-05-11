import { Hono } from "hono";
import { client, graphql, replaceBigInts, sql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";
import { parseChainIdsParam, parseClaimableFeesPagination, parseRequiredIntegerParam } from "./queryParams";

const app = new Hono();
const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/;
const BYTES32_REGEX = /^0x[a-f0-9]{64}$/;

app.use("/graphql", graphql({ db, schema }));
app.use("/", graphql({ db, schema }));
app.use("/sql/*", client({ db, schema }));

// Debug endpoint to view current database locks and blocking queries
app.get("/debug/locks", async (c) => {
  try {
    const locks = await db.execute(sql`
      SELECT
        blocked.pid AS blocked_pid,
        blocked.query AS blocked_query,
        blocked.wait_event_type,
        blocked.wait_event,
        blocked.state AS blocked_state,
        age(now(), blocked.query_start) AS blocked_duration,
        blocking.pid AS blocking_pid,
        blocking.query AS blocking_query,
        blocking.state AS blocking_state,
        age(now(), blocking.query_start) AS blocking_duration
      FROM pg_stat_activity blocked
      JOIN pg_locks blocked_locks ON blocked.pid = blocked_locks.pid
      JOIN pg_locks blocking_locks ON blocked_locks.locktype = blocking_locks.locktype
        AND blocked_locks.database IS NOT DISTINCT FROM blocking_locks.database
        AND blocked_locks.relation IS NOT DISTINCT FROM blocking_locks.relation
        AND blocked_locks.page IS NOT DISTINCT FROM blocking_locks.page
        AND blocked_locks.tuple IS NOT DISTINCT FROM blocking_locks.tuple
        AND blocked_locks.virtualxid IS NOT DISTINCT FROM blocking_locks.virtualxid
        AND blocked_locks.transactionid IS NOT DISTINCT FROM blocking_locks.transactionid
        AND blocked_locks.classid IS NOT DISTINCT FROM blocking_locks.classid
        AND blocked_locks.objid IS NOT DISTINCT FROM blocking_locks.objid
        AND blocked_locks.objsubid IS NOT DISTINCT FROM blocking_locks.objsubid
        AND blocked_locks.pid != blocking_locks.pid
      JOIN pg_stat_activity blocking ON blocking_locks.pid = blocking.pid
      WHERE NOT blocked_locks.granted
      ORDER BY blocked.query_start
    `);
    return c.json(replaceBigInts(locks, (v) => String(v)));
  } catch (error) {
    console.error("Error in /debug/locks", error);
    return c.json({ error: "Failed to fetch locks" }, 500);
  }
});

// Debug endpoint to view active queries
app.get("/debug/activity", async (c) => {
  try {
    const activity = await db.execute(sql`
      SELECT
        pid,
        state,
        wait_event_type,
        wait_event,
        query,
        age(now(), query_start) AS duration,
        age(now(), xact_start) AS transaction_duration,
        application_name
      FROM pg_stat_activity
      WHERE state != 'idle'
        AND pid != pg_backend_pid()
      ORDER BY query_start
    `);
    return c.json(replaceBigInts(activity, (v) => String(v)));
  } catch (error) {
    console.error("Error in /debug/activity", error);
    return c.json({ error: "Failed to fetch activity" }, 500);
  }
});

app.get("/search/:query", async (c) => {
  try {
    const query = c.req.param("query");

    const chainIds = c.req
      .query("chain_ids")
      ?.split(",")
      .map((id) => Number(id));

    // Normalize address queries to lowercase for case-insensitive matching
    const normalizedQuery =
      query.startsWith("0x") && query.length === 42
        ? query.toLowerCase()
        : query;

    if (!chainIds) return c.json([]);
    // First search tokens directly
    const tokenResults = await db.execute(sql`
      SELECT
       t.address,
       t.chain_id,
       t.symbol,
       t.name,
       p.market_cap_usd,
       ohlc.percent_day_change
      FROM token t
      LEFT JOIN pool p ON p.address = t.pool
      LEFT JOIN pool_day_agg_2 ohlc ohlc ON ohlc.pool = t.pool
      WHERE
        t.chain_id in (${chainIds.join(",")})
      AND 
        (t.name ILIKE ${`${normalizedQuery}%`} 
        OR t.address ILIKE ${`${normalizedQuery}%`} 
        OR t.symbol ILIKE ${`${normalizedQuery}%`})
      `);
    return c.json(replaceBigInts(tokenResults, (v) => String(v)));
  } catch (error) {
    console.error("Error in /search/:query", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

app.get("/fees/recipients/:poolId", async (c) => {
  try {
    const poolId = c.req.param("poolId").toLowerCase();
    const chainId = parseRequiredIntegerParam(c.req.query("chain_id"));

    if (!BYTES32_REGEX.test(poolId) || chainId === null) {
      return c.json({ error: "poolId and chain_id are required" }, 400);
    }

    const recipients = await db.execute(sql`
      WITH normalized_recipients AS (
        SELECT pool_id, chain_id, beneficiary, shares, initializer
        FROM fee_recipient
        WHERE pool_id = ${poolId}
          AND chain_id = ${chainId}
      ),
      normalized_status AS (
        SELECT COALESCE(SUM(shares), 0) = 1000000000000000000::numeric AS complete
        FROM normalized_recipients
      ),
      legacy_recipients AS (
        SELECT
          p.address AS pool_id,
          p.chain_id,
          (recipient.value->>'beneficiary')::text AS beneficiary,
          (recipient.value->>'shares')::numeric AS shares,
          p.initializer
        FROM pool p,
          jsonb_array_elements(p.beneficiaries) AS recipient(value)
        WHERE p.address = ${poolId}
          AND p.chain_id = ${chainId}
          AND p.beneficiaries IS NOT NULL
          AND NOT (SELECT complete FROM normalized_status)
      ),
      all_recipients AS (
        SELECT * FROM normalized_recipients WHERE (SELECT complete FROM normalized_status)
        UNION ALL
        SELECT * FROM legacy_recipients
      )
      SELECT
        fr.pool_id,
        fr.chain_id,
        fr.beneficiary,
        fr.shares,
        fr.initializer,
        COALESCE(cf.token0_fees, 0) AS token0_fees,
        COALESCE(cf.token1_fees, 0) AS token1_fees,
        COALESCE(cf.total_fees_usd, 0) AS total_fees_usd
      FROM all_recipients fr
      LEFT JOIN cumulated_fees cf
        ON cf.pool_id = fr.pool_id
        AND cf.chain_id = fr.chain_id
        AND cf.beneficiary = fr.beneficiary
      ORDER BY fr.beneficiary
    `);

    return c.json(replaceBigInts(recipients, (v) => String(v)));
  } catch (error) {
    console.error("Error in /fees/recipients/:poolId", error);
    return c.json({ error: "Failed to fetch fee recipients" }, 500);
  }
});

app.get("/fees/claimable/:beneficiary", async (c) => {
  try {
    const beneficiary = c.req.param("beneficiary").toLowerCase();
    const poolId = c.req.query("pool_id")?.toLowerCase();
    const chainIds = parseChainIdsParam(c.req.query("chain_ids"));
    const pagination = parseClaimableFeesPagination({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });

    if (!ADDRESS_REGEX.test(beneficiary)) {
      return c.json({ error: "valid beneficiary address is required" }, 400);
    }
    if (poolId && !BYTES32_REGEX.test(poolId)) {
      return c.json({ error: "valid pool_id is required" }, 400);
    }
    if (chainIds === null) {
      return c.json({ error: "chain_ids must be comma-separated integers" }, 400);
    }
    if (pagination === null) {
      return c.json({ error: "limit and offset must be valid pagination integers" }, 400);
    }

    const poolFilter = poolId ? sql`AND cf.pool_id = ${poolId}` : sql``;
    const chainFilter = chainIds && chainIds.length > 0
      ? sql`AND cf.chain_id = ANY(string_to_array(${chainIds.join(",")}, ',')::int[])`
      : sql``;

    const selectClaimableFees = sql`
      WITH claimable_fees AS (
        SELECT
          cf.pool_id,
          cf.chain_id,
          cf.beneficiary,
          cf.token0_fees,
          cf.token1_fees,
          cf.total_fees_usd
        FROM cumulated_fees cf
        WHERE cf.beneficiary = ${beneficiary}
          ${poolFilter}
          ${chainFilter}
      ),
      candidate_pools AS (
        SELECT DISTINCT pool_id, chain_id
        FROM claimable_fees
      ),
      normalized_status AS (
        SELECT
          fr.pool_id,
          fr.chain_id,
          COALESCE(SUM(fr.shares), 0) = 1000000000000000000::numeric AS complete
        FROM fee_recipient fr
        JOIN candidate_pools cp
          ON cp.pool_id = fr.pool_id
          AND cp.chain_id = fr.chain_id
        GROUP BY fr.pool_id, fr.chain_id
      ),
      normalized_recipients AS (
        SELECT fr.pool_id, fr.chain_id, fr.beneficiary, fr.shares, fr.initializer
        FROM fee_recipient fr
        JOIN candidate_pools cp
          ON cp.pool_id = fr.pool_id
          AND cp.chain_id = fr.chain_id
        JOIN normalized_status ns
          ON ns.pool_id = fr.pool_id
          AND ns.chain_id = fr.chain_id
        WHERE ns.complete
          AND fr.beneficiary = ${beneficiary}
      ),
      legacy_recipients AS (
        SELECT
          p.address AS pool_id,
          p.chain_id,
          (recipient.value->>'beneficiary')::text AS beneficiary,
          (recipient.value->>'shares')::numeric AS shares,
          p.initializer
        FROM pool p
        JOIN candidate_pools cp
          ON cp.pool_id = p.address
          AND cp.chain_id = p.chain_id
        CROSS JOIN LATERAL jsonb_array_elements(p.beneficiaries) AS recipient(value)
        LEFT JOIN normalized_status ns
          ON ns.pool_id = p.address
          AND ns.chain_id = p.chain_id
        WHERE p.beneficiaries IS NOT NULL
          AND p.initializer IS NOT NULL
          AND COALESCE(ns.complete, false) = false
          AND (recipient.value->>'beneficiary')::text = ${beneficiary}
      ),
      recipient_rows AS (
        SELECT * FROM normalized_recipients
        UNION ALL
        SELECT * FROM legacy_recipients
      )
      SELECT
        cf.pool_id,
        cf.chain_id,
        cf.beneficiary,
        cf.token0_fees,
        cf.token1_fees,
        cf.total_fees_usd,
        COALESCE(rr.shares, 0) AS shares,
        rr.initializer,
        COALESCE(p.asset, v4.asset, v4.base_token) AS asset,
        COALESCE(p.base_token, v4.base_token) AS base_token,
        COALESCE(p.quote_token, v4.quote_token) AS quote_token,
        COALESCE(p.type, v4.migrator_version) AS pool_type,
        COALESCE(p.price, v4.price) AS price,
        COALESCE(p.market_cap_usd, 0) AS market_cap_usd,
        t.name,
        t.symbol,
        t.image
      FROM claimable_fees cf
      LEFT JOIN recipient_rows rr
        ON rr.pool_id = cf.pool_id
        AND rr.chain_id = cf.chain_id
        AND rr.beneficiary = cf.beneficiary
      LEFT JOIN pool p
        ON p.address = cf.pool_id
        AND p.chain_id = cf.chain_id
      LEFT JOIN v4_pools v4
        ON v4.pool_id = cf.pool_id
        AND v4.chain_id = cf.chain_id
      LEFT JOIN token t
        ON t.address = COALESCE(p.asset, v4.asset, v4.base_token)
        AND t.chain_id = cf.chain_id
      WHERE (cf.token0_fees > 0 OR cf.token1_fees > 0)
        AND (p.address IS NOT NULL OR v4.pool_id IS NOT NULL)
    `;

    const rows = await db.execute(sql`
      ${selectClaimableFees}
      ORDER BY cf.total_fees_usd DESC
      LIMIT ${pagination.limit}
      OFFSET ${pagination.offset}
    `);

    return c.json(replaceBigInts(rows, (v) => String(v)));
  } catch (error) {
    console.error("Error in /fees/claimable/:beneficiary", error);
    return c.json({ error: "Failed to fetch claimable fees" }, 500);
  }
});

export default app;
