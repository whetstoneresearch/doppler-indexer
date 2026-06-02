#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

const SUPPORTED_POOL_TYPES = ["multicurve", "scheduled-multicurve", "decay-multicurve", "dhook", "rehype"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const RPC_ENV_BY_CHAIN = {
  1: ["PONDER_RPC_URL_1", "MAINNET_RPC"],
  130: ["PONDER_RPC_URL_130", "UNICHAIN_RPC"],
  143: ["PONDER_RPC_URL_143", "MONAD_RPC"],
  8453: ["PONDER_RPC_URL_8453", "BASE_RPC"],
  57073: ["PONDER_RPC_URL_57073", "INK_RPC"],
};

const GET_BENEFICIARIES_ABI = [
  {
    type: "function",
    name: "getBeneficiaries",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "beneficiary", type: "address" },
          { name: "shares", type: "uint96" },
        ],
      },
    ],
  },
];

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));
loadDotEnv(resolve(process.cwd(), ".env.local"));

function parseArgs(argv) {
  const args = {
    apply: false,
    schema: undefined,
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    chainId: undefined,
    limit: undefined,
    blockNumber: undefined,
    concurrency: 4,
    applyBatchSize: 500,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      if (key === "database-url") args.databaseUrl = value;
      else if (key === "rpc-url") args.rpcUrl = value;
      else if (key === "chain-id") args.chainId = Number(value);
      else if (key === "schema") args.schema = value;
      else if (key === "limit") args.limit = Number(value);
      else if (key === "block-number") args.blockNumber = BigInt(value);
      else if (key === "concurrency") args.concurrency = Number(value);
      else if (key === "apply-batch-size") args.applyBatchSize = Number(value);
      else throw new Error(`Unknown argument ${arg}`);
    } else throw new Error(`Unknown argument ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-pool-beneficiaries.mjs [options]

Backfills pool_beneficiary from current on-chain getBeneficiaries() state.
Use this after deploying the pool_beneficiary table into a database that already
contains indexed multicurve, scheduled multicurve, decay multicurve, dhook, or rehype pools.

The script replaces pool_beneficiary rows for the selected pools and refreshes
pool.beneficiaries with the same current on-chain snapshot. Rehype hook-local
beneficiary fee accounting is separate from this base beneficiary backfill.

Options:
  --database-url <url>       Postgres URL. Defaults to DATABASE_URL.
  --rpc-url <url>            RPC URL for a single-chain run. Without this,
                             each chain uses PONDER_RPC_URL_<chainId>.
  --chain-id <id>            Limit selected pools to one chain. Defaults to all
                             chains represented by selected indexed pools.
  --schema <schema>          Ponder schema containing pool and pool_beneficiary.
  --limit <n>                Limit selected pool rows.
  --block-number <n>         Pin eth_call reads to a block. Defaults to one
                             auto-pinned block per selected chain.
  --concurrency <n>          Concurrent getBeneficiaries calls. Defaults to 4.
  --apply-batch-size <n>     Pools per DB transaction. Defaults to 500.
  --apply                   Write rows. Without this flag, dry-run only.

Examples:
  node scripts/backfill-pool-beneficiaries.mjs --schema public
  node scripts/backfill-pool-beneficiaries.mjs --schema public --apply
  node scripts/backfill-pool-beneficiaries.mjs --schema public --chain-id 8453 --apply
`);
}

function psqlJson(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
  ).trim();
  return JSON.parse(stdout || "[]");
}

function psqlExec(databaseUrl, sql) {
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function qi(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizeHex(value) {
  const lower = String(value).toLowerCase();
  return lower.startsWith("0x") ? lower : `0x${lower}`;
}

function normalizeAddress(value, label) {
  const address = normalizeHex(value);
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error(`Invalid ${label} address ${value}`);
  }
  return address;
}

function hexNoPrefix(value) {
  return normalizeHex(value).slice(2);
}

function sqlHex(value, columnType) {
  const hex = hexNoPrefix(value);
  return columnType === "bytea" ? `decode(${ql(hex)}, 'hex')` : ql(`0x${hex}`);
}

function sqlJson(value, columnType) {
  const type = columnType === "json" ? "json" : "jsonb";
  return `${ql(JSON.stringify(value))}::${type}`;
}

function selectHex(columnName, columnType, alias) {
  const column = qi(columnName);
  if (columnType === "bytea") {
    return `concat('0x', lower(encode(${column}, 'hex'))) as ${qi(alias)}`;
  }
  return `case when lower(${column}::text) like '0x%' then lower(${column}::text) else concat('0x', lower(${column}::text)) end as ${qi(alias)}`;
}

function resolveTable(databaseUrl, schemaName, tableName) {
  const filter = schemaName
    ? `and table_schema = ${ql(schemaName)}`
    : "and table_schema not in ('pg_catalog', 'information_schema')";
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select table_schema, table_name from information_schema.tables
       where table_name = ${ql(tableName)} ${filter}
       order by table_schema limit 2
     ) q`,
  );
  if (rows.length === 0) {
    throw new Error(`Table ${tableName} not found${schemaName ? ` in schema ${schemaName}` : ""}`);
  }
  if (rows.length > 1) {
    throw new Error(`Multiple ${tableName} tables found; pass --schema explicitly.`);
  }
  return rows[0];
}

function loadColumns(databaseUrl, table) {
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select column_name, data_type from information_schema.columns
       where table_schema = ${ql(table.table_schema)}
         and table_name = ${ql(table.table_name)}
       order by ordinal_position
     ) q`,
  );
  const columns = new Map();
  for (const row of rows) columns.set(row.column_name, row.data_type);
  return columns;
}

function requireColumn(columns, name) {
  const type = columns.get(name);
  if (!type) throw new Error(`Missing required column ${name}`);
  return type;
}

function loadPoolRows({ databaseUrl, poolTable, poolColumns, limit, chainId }) {
  const qualified = `${qi(poolTable.table_schema)}.${qi(poolTable.table_name)}`;
  const addressType = requireColumn(poolColumns, "address");
  const baseTokenType = requireColumn(poolColumns, "base_token");
  const initializerType = requireColumn(poolColumns, "initializer");
  const chainFilter = chainId ? `and chain_id = ${Number(chainId)}` : "";
  const limitSql = limit ? `limit ${Number(limit)}` : "";

  return psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json) from (
       select
         ${selectHex("address", addressType, "pool_id")},
         ${selectHex("base_token", baseTokenType, "asset_id")},
         ${selectHex("initializer", initializerType, "initializer")},
         lower(type::text) as type,
         chain_id::text as chain_id,
         created_at::text as created_at
       from ${qualified}
       where lower(type::text) in (${SUPPORTED_POOL_TYPES.map(ql).join(", ")})
         and initializer is not null
         ${chainFilter}
       order by chain_id, address
       ${limitSql}
     ) q`,
  );
}

function normalizeBeneficiaries(beneficiaries) {
  const sharesByBeneficiary = new Map();
  if (!Array.isArray(beneficiaries)) return [];

  for (const entry of beneficiaries) {
    if (!entry || typeof entry !== "object") continue;
    const beneficiary = normalizeAddress(entry.beneficiary, "beneficiary");
    let shares;
    try {
      shares = BigInt(entry.shares ?? 0);
    } catch {
      continue;
    }
    if (beneficiary === ZERO_ADDRESS || shares <= 0n) continue;
    sharesByBeneficiary.set(beneficiary, (sharesByBeneficiary.get(beneficiary) ?? 0n) + shares);
  }

  return [...sharesByBeneficiary.entries()].map(([beneficiary, shares]) => ({
    beneficiary,
    shares: shares.toString(),
  }));
}

function resolveRpcUrl({ chainId, rpcUrl }) {
  if (rpcUrl) return rpcUrl;
  const envVars = RPC_ENV_BY_CHAIN[chainId] ?? [`PONDER_RPC_URL_${chainId}`];
  for (const envVar of envVars) {
    if (process.env[envVar]) return process.env[envVar];
  }
  throw new Error(`Missing RPC URL for chain ${chainId}. Set PONDER_RPC_URL_${chainId} or pass --rpc-url.`);
}

function createClient(rpcUrl) {
  return createPublicClient({ transport: http(rpcUrl) });
}

async function verifyClientChain({ client, chainId }) {
  const actualChainId = await client.getChainId();
  if (actualChainId !== Number(chainId)) {
    throw new Error(`RPC chain mismatch: expected ${chainId}, got ${actualChainId}`);
  }
}

async function pinSnapshotBlock({ client, blockNumber }) {
  const pinnedBlockNumber = blockNumber ?? await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber: pinnedBlockNumber });
  return {
    blockNumber: pinnedBlockNumber,
    timestamp: block.timestamp,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadCurrentBeneficiaries({ poolRows, rpcUrl, blockNumber, concurrency }) {
  const chainIds = [...new Set(poolRows.map((pool) => Number(pool.chain_id)))].sort((a, b) => a - b);
  if (rpcUrl && chainIds.length > 1) {
    throw new Error("--rpc-url can only be used with a single selected chain. Pass --chain-id or use per-chain PONDER_RPC_URL_<chainId> env vars.");
  }
  const clientByChain = new Map();
  const snapshotByChain = new Map();
  for (const chainId of chainIds) {
    const client = createClient(resolveRpcUrl({ chainId, rpcUrl }));
    await verifyClientChain({ client, chainId });
    clientByChain.set(chainId, client);
    snapshotByChain.set(chainId, await pinSnapshotBlock({ client, blockNumber }));
  }

  return mapWithConcurrency(poolRows, concurrency, async (poolRow) => {
    const chainId = Number(poolRow.chain_id);
    const client = clientByChain.get(chainId);
    const snapshot = snapshotByChain.get(chainId);
    const initializer = normalizeAddress(poolRow.initializer, "initializer");
    const assetId = normalizeAddress(poolRow.asset_id, "asset");
    const beneficiaries = await client.readContract({
      abi: GET_BENEFICIARIES_ABI,
      address: initializer,
      functionName: "getBeneficiaries",
      args: [assetId],
      blockNumber: snapshot.blockNumber,
    });

    return {
      pool: {
        ...poolRow,
        pool_id: normalizeHex(poolRow.pool_id),
        asset_id: assetId,
        initializer,
        chain_id: String(chainId),
      },
      beneficiaries: normalizeBeneficiaries(beneficiaries),
      snapshot,
    };
  });
}

function buildRows(poolStates) {
  const rows = [];
  for (const { pool, beneficiaries, snapshot } of poolStates) {
    for (const beneficiary of beneficiaries) {
      rows.push({
        poolId: normalizeHex(pool.pool_id),
        chainId: Number(pool.chain_id),
        beneficiary: beneficiary.beneficiary,
        assetId: pool.asset_id,
        shares: BigInt(beneficiary.shares),
        initializer: pool.initializer,
        discoveredAt: BigInt(pool.created_at),
        updatedAt: snapshot.timestamp,
      });
    }
  }
  return rows;
}

function buildInsertSql(rows, beneficiaryColumns, beneficiaryTable) {
  const qualified = `${qi(beneficiaryTable.table_schema)}.${qi(beneficiaryTable.table_name)}`;
  const poolIdType = requireColumn(beneficiaryColumns, "pool_id");
  const beneficiaryType = requireColumn(beneficiaryColumns, "beneficiary");
  const assetIdType = requireColumn(beneficiaryColumns, "asset_id");
  const initializerType = requireColumn(beneficiaryColumns, "initializer");

  const values = rows.map((row) => `(
    ${sqlHex(row.poolId, poolIdType)},
    ${Number(row.chainId)},
    ${sqlHex(row.beneficiary, beneficiaryType)},
    ${sqlHex(row.assetId, assetIdType)},
    ${row.shares.toString()},
    ${sqlHex(row.initializer, initializerType)},
    ${row.discoveredAt.toString()},
    ${row.updatedAt.toString()}
  )`);

  return `insert into ${qualified} as target
    (pool_id, chain_id, beneficiary, asset_id, shares, initializer, discovered_at, updated_at)
    values ${values.join(",\n")}
    on conflict (pool_id, chain_id, beneficiary) do update set
      asset_id = excluded.asset_id,
      shares = excluded.shares,
      initializer = excluded.initializer,
      discovered_at = excluded.discovered_at,
      updated_at = excluded.updated_at;`;
}

function buildReplaceSql({ poolStates, rows, poolColumns, beneficiaryColumns, poolTable, beneficiaryTable }) {
  const poolQualified = `${qi(poolTable.table_schema)}.${qi(poolTable.table_name)}`;
  const beneficiaryQualified = `${qi(beneficiaryTable.table_schema)}.${qi(beneficiaryTable.table_name)}`;
  const poolAddressType = requireColumn(poolColumns, "address");
  const poolBeneficiariesType = requireColumn(poolColumns, "beneficiaries");
  const beneficiaryPoolIdType = requireColumn(beneficiaryColumns, "pool_id");

  const selectedPools = poolStates.map(({ pool }) => `(
    ${sqlHex(pool.pool_id, beneficiaryPoolIdType)},
    ${Number(pool.chain_id)}
  )`);

  const selectedPoolSnapshots = poolStates.map(({ pool, beneficiaries }) => `(
    ${sqlHex(pool.pool_id, poolAddressType)},
    ${Number(pool.chain_id)},
    ${sqlJson(beneficiaries, poolBeneficiariesType)}
  )`);

  const insertSql = rows.length > 0
    ? buildInsertSql(rows, beneficiaryColumns, beneficiaryTable)
    : "";

  return `begin;
with selected(pool_id, chain_id) as (values ${selectedPools.join(",\n")})
delete from ${beneficiaryQualified} as target
using selected
where target.pool_id = selected.pool_id
  and target.chain_id = selected.chain_id;

with selected(pool_id, chain_id, beneficiaries) as (values ${selectedPoolSnapshots.join(",\n")})
update ${poolQualified} as target
set beneficiaries = selected.beneficiaries
from selected
where target.address = selected.pool_id
  and target.chain_id = selected.chain_id;

${insertSql}
commit;`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");
  if (args.chainId !== undefined && (!Number.isInteger(args.chainId) || args.chainId <= 0)) {
    throw new Error("--chain-id must be a positive integer");
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (!Number.isInteger(args.applyBatchSize) || args.applyBatchSize <= 0) {
    throw new Error("--apply-batch-size must be a positive integer");
  }

  const poolTable = resolveTable(args.databaseUrl, args.schema, "pool");
  const beneficiaryTable = resolveTable(args.databaseUrl, args.schema, "pool_beneficiary");
  const poolColumns = loadColumns(args.databaseUrl, poolTable);
  const beneficiaryColumns = loadColumns(args.databaseUrl, beneficiaryTable);
  const poolRows = loadPoolRows({
    databaseUrl: args.databaseUrl,
    poolTable,
    poolColumns,
    limit: args.limit,
    chainId: args.chainId,
  });
  const poolStates = await loadCurrentBeneficiaries({
    poolRows,
    rpcUrl: args.rpcUrl,
    blockNumber: args.blockNumber,
    concurrency: args.concurrency,
  });
  const rows = buildRows(poolStates);

  console.log(`Resolved pool table: ${poolTable.table_schema}.${poolTable.table_name}`);
  console.log(`Resolved pool_beneficiary table: ${beneficiaryTable.table_schema}.${beneficiaryTable.table_name}`);
  console.log(`Source: current on-chain getBeneficiaries()`);
  console.log(`Pool types: ${SUPPORTED_POOL_TYPES.join(", ")}`);
  console.log(`Chains: ${[...new Set(poolRows.map((pool) => Number(pool.chain_id)))].sort((a, b) => a - b).join(", ") || "none"}`);
  console.log(`Snapshot blocks: ${[...new Map(poolStates.map(({ pool, snapshot }) => [Number(pool.chain_id), snapshot])).entries()].map(([chainId, snapshot]) => `${chainId}:${snapshot.blockNumber}`).join(", ") || "none"}`);
  console.log(`Selected pools: ${poolRows.length}`);
  console.log(`Backfill rows: ${rows.length}`);

  if (!args.apply) {
    console.log("Dry run only. Pass --apply to write rows.");
    return;
  }

  for (let i = 0; i < poolStates.length; i += args.applyBatchSize) {
    const poolBatch = poolStates.slice(i, i + args.applyBatchSize);
    if (poolBatch.length === 0) continue;
    const poolKeys = new Set(poolBatch.map(({ pool }) => `${Number(pool.chain_id)}:${normalizeHex(pool.pool_id)}`));
    const rowBatch = rows.filter((row) => poolKeys.has(`${Number(row.chainId)}:${normalizeHex(row.poolId)}`));
    psqlExec(args.databaseUrl, buildReplaceSql({
      poolStates: poolBatch,
      rows: rowBatch,
      poolColumns,
      beneficiaryColumns,
      poolTable,
      beneficiaryTable,
    }));
    console.log(`Applied ${Math.min(i + poolBatch.length, poolStates.length)}/${poolStates.length} pools`);
  }
}

main();
