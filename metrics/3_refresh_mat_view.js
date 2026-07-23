import 'dotenv/config';
import * as pg from 'pg';


const client = new pg.Client({
  connectionString: `postgres://${process.env.POSTGRES_USERNAME}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}?sslmode=require`,
})

// Schema needs to be set to the schema targeting the correct deployment
export async function refreshViews() {
  try {
    await client.connect();
    await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${process.env.POSTGRES_SCHEMA}".mv_pool_day_agg_2;`);
  } catch (error) {
    await client.end();
    console.error("Error refreshing views:", error);
    return
  } finally {
    await client.end();
  }
}
