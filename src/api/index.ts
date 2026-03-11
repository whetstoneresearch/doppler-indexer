import { Hono } from "hono";
import { client, graphql, replaceBigInts, sql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";

const app = new Hono();

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

export default app;
