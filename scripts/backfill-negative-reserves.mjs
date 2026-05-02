#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import JSBI from "jsbi";
import { SqrtPriceMath, TickMath } from "@uniswap/v3-sdk";
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
} from "viem";
import { base, mainnet } from "viem/chains";

const CHAINS = {
  8453: base,
  1: mainnet,
};

const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";

const STATE_VIEW_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
];

const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const V3_POOL_SLOT0_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
];

const DHOOK_GET_POSITIONS_ABI = [
  {
    type: "function",
    name: "getPositions",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "liquidity", type: "uint128" },
          { name: "salt", type: "bytes32" },
        ],
      },
    ],
  },
];

const REHYPE_GET_POSITION_ABI = [
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "salt", type: "bytes32" },
    ],
  },
];

const DHOOK_GET_STATE_ABI = [
  {
    type: "function",
    name: "getState",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "numeraire", type: "address" },
      { name: "totalTokensOnBondingCurve", type: "uint256" },
      { name: "dopplerHook", type: "address" },
      { name: "graduationDopplerHookCalldata", type: "bytes" },
      { name: "status", type: "uint8" },
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "farTick", type: "int24" },
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
    all: false,
    applyBatchSize: 25,
    chainId: DEFAULT_CHAIN_ID,
    concurrency: 2,
    rpcBatchSize: 50,
    retries: 2,
    verify: true,
    verbose: false,
    stateView: DEFAULT_STATE_VIEW,
    limit: undefined,
    types: undefined,
    schema: undefined,
    table: undefined,
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    blockNumber: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--all") {
      args.all = true;
    } else if (arg === "--skip-verify") {
      args.verify = false;
    } else if (arg === "--verbose") {
      args.verbose = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      if (key === "chain-id") args.chainId = Number(value);
      else if (key === "state-view") args.stateView = normalizeHex(value);
      else if (key === "database-url") args.databaseUrl = value;
      else if (key === "rpc-url") args.rpcUrl = value;
      else if (key === "block-number") args.blockNumber = BigInt(value);
      else if (key === "apply-batch-size") args.applyBatchSize = Number(value);
      else if (key === "concurrency") args.concurrency = Number(value);
      else if (key === "rpc-batch-size") args.rpcBatchSize = Number(value);
      else if (key === "retries") args.retries = Number(value);
      else if (key === "schema") args.schema = value;
      else if (key === "table") args.table = value;
      else if (key === "types") args.types = value.split(",").map((t) => t.trim());
      else if (key === "limit") args.limit = Number(value);
      else throw new Error(`Unknown argument ${arg}`);
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }

  if (!args.rpcUrl) {
    args.rpcUrl =
      process.env[`PONDER_RPC_URL_${args.chainId}`] ?? process.env.BASE_RPC;
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-negative-reserves.mjs [options]

Backfills correct reserves for pools with negative reserve values.
Supports dhook, rehype, v3, and v4-migrated pool types.

Options:
  --database-url <url>     Postgres URL. Defaults to DATABASE_URL.
  --schema <schema>        Ponder schema containing the pool table.
  --table <table>          Pool table name. Auto-detected when possible.
  --rpc-url <url>          RPC URL. Defaults to PONDER_RPC_URL_{chainId}.
  --chain-id <id>          Chain ID. Defaults to 8453 (Base).
  --state-view <address>   V4 StateView address. Defaults to Base StateView.
  --block-number <n>       Pin eth_calls to this block. Defaults to latest.
  --types <list>           Comma-separated pool types to fix (dhook,rehype,v3,v4).
                           Defaults to all types with negative reserves.
  --all                    Backfill all matching pools, not just negative reserves.
  --limit <n>              Limit selected rows.
  --rpc-batch-size <n>     Pools per multicall batch. Defaults to 50.
  --concurrency <n>        Concurrent RPC batches. Defaults to 2.
  --retries <n>            Retry failed batches by splitting. Defaults to 2.
  --apply-batch-size <n>   Updates per DB transaction. Defaults to 25.
  --skip-verify            Skip post-apply DB verification.
  --verbose                Print one line per pool.
  --apply                  Write updates. Without this flag, dry-run only.

Examples:
  node scripts/backfill-negative-reserves.mjs --schema public --types dhook,rehype
  node scripts/backfill-negative-reserves.mjs --schema public --apply
`);
}

// ── DB helpers ──

function psqlJson(databaseUrl, sql) {
  const stdout = execFileSync(
    "psql",
    [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
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

function numericColumnType(column) {
  if (column.type === "bigint") return "bigint";
  if (column.type === "integer") return "integer";
  return "numeric";
}

function normalizeHex(value) {
  const lower = String(value).toLowerCase();
  return lower.startsWith("0x") ? lower : `0x${lower}`;
}

function hexNoPrefix(value) {
  return normalizeHex(value).slice(2);
}

function pickColumn(columns, candidates, required = true) {
  for (const candidate of candidates) {
    const column = columns.find(
      (item) => item.name.toLowerCase() === candidate.toLowerCase(),
    );
    if (column) return column;
  }
  if (!required) return undefined;
  throw new Error(`Missing required column; tried ${candidates.join(", ")}`);
}

function normalizeAddressExpr(column, tableAlias) {
  const columnRef = tableAlias
    ? `${qi(tableAlias)}.${qi(column.name)}`
    : qi(column.name);
  if (column.type === "bytea") {
    return `lower(encode(${columnRef}, 'hex'))`;
  }
  return `lower(regexp_replace(${columnRef}::text, '^0x', ''))`;
}

function selectHexAddress(column, alias, tableAlias) {
  const columnRef = tableAlias
    ? `${qi(tableAlias)}.${qi(column.name)}`
    : qi(column.name);
  if (column.type === "bytea") {
    return `concat('0x', lower(encode(${columnRef}, 'hex'))) as ${qi(alias)}`;
  }
  return `case
    when lower(${columnRef}::text) like '0x%' then lower(${columnRef}::text)
    else concat('0x', lower(${columnRef}::text))
  end as ${qi(alias)}`;
}

// ── Table discovery ──

function loadTableCandidates(databaseUrl, schemaName) {
  const schemaFilter = schemaName
    ? `and table_schema = ${ql(schemaName)}`
    : "and table_schema not in ('pg_catalog', 'information_schema')";
  const rows = psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json)
     from (
       select table_schema, table_name, column_name, data_type
       from information_schema.columns
       where true ${schemaFilter}
       order by table_schema, table_name, ordinal_position
     ) q`,
  );
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        schema: row.table_schema,
        table: row.table_name,
        columns: [],
      });
    }
    grouped.get(key).columns.push({ name: row.column_name, type: row.data_type });
  }
  return [...grouped.values()].filter((candidate) => {
    const names = candidate.columns.map((c) => c.name.toLowerCase());
    return (
      names.includes("type") &&
      (names.includes("reserves0") || names.includes("reserves_0")) &&
      (names.includes("reserves1") || names.includes("reserves_1"))
    );
  });
}

function resolvePoolTable(databaseUrl, schemaName, tableName) {
  const candidates = loadTableCandidates(databaseUrl, schemaName).filter(
    (c) => !tableName || c.table === tableName,
  );
  if (candidates.length === 0) {
    throw new Error(
      `Could not find a pool table with type and reserves columns${schemaName ? ` in schema ${schemaName}` : ""}. Pass --schema and --table explicitly.`,
    );
  }
  if (candidates.length > 1) {
    const list = candidates.map((c) => `${c.schema}.${c.table}`).slice(0, 20).join(", ");
    throw new Error(`Found multiple candidate pool tables: ${list}. Pass --schema and --table.`);
  }
  return candidates[0];
}

function buildColumnMap(columns) {
  return {
    address: pickColumn(columns, ["address"]),
    chainId: pickColumn(columns, ["chain_id", "chainId", "chainid"]),
    reserves0: pickColumn(columns, ["reserves0", "reserves_0"]),
    reserves1: pickColumn(columns, ["reserves1", "reserves_1"]),
    tick: pickColumn(columns, ["tick"]),
    sqrtPrice: pickColumn(columns, ["sqrt_price", "sqrtPrice"]),
    liquidity: pickColumn(columns, ["liquidity"]),
    type: pickColumn(columns, ["type"]),
    migrationType: pickColumn(columns, ["migration_type", "migrationType"], false),
    isToken0: pickColumn(columns, ["is_token0", "isToken0"], false),
    baseToken: pickColumn(columns, ["base_token", "baseToken"], false),
    quoteToken: pickColumn(columns, ["quote_token", "quoteToken"], false),
    poolKey: pickColumn(columns, ["pool_key", "poolKey"], false),
    initializer: pickColumn(columns, ["initializer"], false),
  };
}

// ── Pool loading ──

function loadPools({ databaseUrl, table, columns, chainId, types, all, limit }) {
  const qualifiedTable = `${qi(table.schema)}.${qi(table.table)}`;
  const filters = [`${qi(columns.chainId.name)}::numeric = ${Number(chainId)}`];

  if (!all) {
    filters.push(
      `(${qi(columns.reserves0.name)}::numeric < 0 or ${qi(columns.reserves1.name)}::numeric < 0)`,
    );
  }

  const poolTypes = types ?? ["dhook", "rehype", "v3", "v4"];
  filters.push(
    `lower(${qi(columns.type.name)}::text) in (${poolTypes.map((t) => ql(t)).join(", ")})`,
  );

  const selectCols = [
    selectHexAddress(columns.address, "address"),
    `${qi(columns.chainId.name)}::text as chain_id`,
    `${qi(columns.reserves0.name)}::text as reserves0`,
    `${qi(columns.reserves1.name)}::text as reserves1`,
    `${qi(columns.tick.name)}::text as tick`,
    `${qi(columns.sqrtPrice.name)}::text as sqrt_price`,
    `${qi(columns.liquidity.name)}::text as liquidity`,
    `lower(${qi(columns.type.name)}::text) as type`,
  ];

  if (columns.migrationType) {
    selectCols.push(`lower(${qi(columns.migrationType.name)}::text) as migration_type`);
  }
  if (columns.isToken0) {
    selectCols.push(`${qi(columns.isToken0.name)} as is_token0`);
  }
  if (columns.baseToken) {
    selectCols.push(selectHexAddress(columns.baseToken, "base_token"));
  }
  if (columns.quoteToken) {
    selectCols.push(selectHexAddress(columns.quoteToken, "quote_token"));
  }
  if (columns.poolKey) {
    selectCols.push(`${qi(columns.poolKey.name)} as pool_key`);
  }
  if (columns.initializer) {
    selectCols.push(selectHexAddress(columns.initializer, "initializer"));
  }

  const limitSql = limit ? `limit ${Number(limit)}` : "";
  return psqlJson(
    databaseUrl,
    `select coalesce(json_agg(q), '[]'::json)
     from (
       select ${selectCols.join(",\n         ")}
       from ${qualifiedTable}
       where ${filters.join(" and ")}
       order by ${qi(columns.type.name)}, ${qi(columns.address.name)}
       ${limitSql}
     ) q`,
  );
}

// ── Math ──

function getAmount0Delta({ tickLower, tickUpper, liquidity, roundUp }) {
  const sqrtPriceA = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtPriceB = TickMath.getSqrtRatioAtTick(tickUpper);
  return BigInt(
    SqrtPriceMath.getAmount0Delta(
      sqrtPriceA,
      sqrtPriceB,
      JSBI.BigInt(liquidity.toString()),
      roundUp,
    ).toString(),
  );
}

function getAmount1Delta({ tickLower, tickUpper, liquidity, roundUp }) {
  const sqrtPriceA = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtPriceB = TickMath.getSqrtRatioAtTick(tickUpper);
  return BigInt(
    SqrtPriceMath.getAmount1Delta(
      sqrtPriceA,
      sqrtPriceB,
      JSBI.BigInt(liquidity.toString()),
      roundUp,
    ).toString(),
  );
}

function computeReservesFromPositions(positions, tick) {
  let reserves0 = 0n;
  let reserves1 = 0n;
  let totalLiquidity = 0n;

  for (const pos of positions) {
    const tickLower = Number(pos.tickLower);
    const tickUpper = Number(pos.tickUpper);
    const liquidity = BigInt(pos.liquidity);
    if (liquidity <= 0n) continue;

    totalLiquidity += liquidity;

    if (tick < tickLower) {
      reserves0 += getAmount0Delta({ tickLower, tickUpper, liquidity, roundUp: false });
    } else if (tick < tickUpper) {
      reserves0 += getAmount0Delta({ tickLower: tick, tickUpper, liquidity, roundUp: false });
      reserves1 += getAmount1Delta({ tickLower, tickUpper: tick, liquidity, roundUp: false });
    } else {
      reserves1 += getAmount1Delta({ tickLower, tickUpper, liquidity, roundUp: false });
    }
  }

  return { reserves0, reserves1, liquidity: totalLiquidity };
}

function normalizePoolKey(poolKey) {
  const parsed = typeof poolKey === "string" ? JSON.parse(poolKey) : poolKey;
  return {
    currency0: normalizeHex(parsed.currency0),
    currency1: normalizeHex(parsed.currency1),
    fee: Number(parsed.fee),
    tickSpacing: Number(parsed.tickSpacing),
    hooks: normalizeHex(parsed.hooks),
  };
}

function getPoolId(poolKey) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
    ),
  );
}

// ── DHook/Rehype repair ──

async function repairDHookBatch({ client, stateView, blockNumber, pools }) {
  // Pass 1: getSlot0 + getPositions + getState for every pool.
  // getPositions may revert (internal on some deployments) — that's fine,
  // we use getState to discover the dopplerHook and call getPosition as fallback.
  const pass1Contracts = [];
  for (const pool of pools) {
    pass1Contracts.push(
      { abi: STATE_VIEW_ABI, address: stateView, functionName: "getSlot0", args: [pool.address], blockNumber },
      { abi: DHOOK_GET_POSITIONS_ABI, address: pool.initializer ?? stateView, functionName: pool.initializer ? "getPositions" : "getSlot0", args: [pool.initializer ? pool.base_token : pool.address], blockNumber },
      { abi: DHOOK_GET_STATE_ABI, address: pool.initializer ?? stateView, functionName: pool.initializer ? "getState" : "getSlot0", args: [pool.initializer ? pool.base_token : pool.address], blockNumber },
    );
  }
  const pass1 = await client.multicall({ allowFailure: true, contracts: pass1Contracts });

  const results = [];
  const needPass2 = []; // pools where getPositions failed but getState succeeded

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const slot0R = pass1[i * 3];
    const posR = pass1[i * 3 + 1];
    const stateR = pass1[i * 3 + 2];

    if (slot0R?.status !== "success") {
      results.push({ pool, error: new Error(`getSlot0 failed: ${slot0R?.error?.shortMessage ?? "unknown"}`) });
      continue;
    }

    const tick = Number(slot0R.result[1]);
    const sqrtPriceX96 = slot0R.result[0];

    // Happy path: getPositions worked
    if (posR?.status === "success" && Array.isArray(posR.result)) {
      const reserves = computeReservesFromPositions(posR.result, tick);
      results.push({ update: makeUpdate(pool, reserves, tick, sqrtPriceX96, posR.result.length) });
      continue;
    }

    // Fallback: use dopplerHook from getState → getPosition
    if (stateR?.status === "success" && stateR.result[2]) {
      const dopplerHook = normalizeHex(stateR.result[2]);
      if (dopplerHook !== "0x0000000000000000000000000000000000000000") {
        needPass2.push({ pool, tick, sqrtPriceX96, dopplerHook });
        continue;
      }
    }

    // Last resort: clamp negative reserves to 0
    const r0 = BigInt(pool.reserves0);
    const r1 = BigInt(pool.reserves1);
    results.push({
      update: {
        address: pool.address,
        chainId: Number(pool.chain_id),
        type: pool.type,
        oldReserves0: r0,
        oldReserves1: r1,
        reserves0: r0 > 0n ? r0 : 0n,
        reserves1: r1 > 0n ? r1 : 0n,
        oldTick: Number(pool.tick),
        tick,
        sqrtPriceX96,
        liquidity: BigInt(pool.liquidity),
        positionCount: -1,
      },
    });
  }

  // Pass 2: getPosition on the dopplerHook for pools where getPositions failed
  if (needPass2.length > 0) {
    const pass2Contracts = needPass2.map(({ pool, dopplerHook }) => ({
      abi: REHYPE_GET_POSITION_ABI,
      address: dopplerHook,
      functionName: "getPosition",
      args: [pool.address],
      blockNumber,
    }));
    const pass2 = await client.multicall({ allowFailure: true, contracts: pass2Contracts });

    for (let i = 0; i < needPass2.length; i++) {
      const { pool, tick, sqrtPriceX96 } = needPass2[i];
      const posR = pass2[i];

      if (posR?.status === "success") {
        const [tickLower, tickUpper, liquidity] = posR.result;
        const positions = liquidity > 0n ? [{ tickLower, tickUpper, liquidity }] : [];
        const reserves = computeReservesFromPositions(positions, tick);
        results.push({ update: makeUpdate(pool, reserves, tick, sqrtPriceX96, positions.length) });
      } else {
        // getPosition also failed — clamp to 0
        const r0 = BigInt(pool.reserves0);
        const r1 = BigInt(pool.reserves1);
        results.push({
          update: {
            address: pool.address,
            chainId: Number(pool.chain_id),
            type: pool.type,
            oldReserves0: r0,
            oldReserves1: r1,
            reserves0: r0 > 0n ? r0 : 0n,
            reserves1: r1 > 0n ? r1 : 0n,
            oldTick: Number(pool.tick),
            tick,
            sqrtPriceX96,
            liquidity: BigInt(pool.liquidity),
            positionCount: -1,
          },
        });
      }
    }
  }

  return results;
}

function makeUpdate(pool, reserves, tick, sqrtPriceX96, positionCount) {
  return {
    address: pool.address,
    chainId: Number(pool.chain_id),
    type: pool.type,
    oldReserves0: BigInt(pool.reserves0),
    oldReserves1: BigInt(pool.reserves1),
    reserves0: reserves.reserves0,
    reserves1: reserves.reserves1,
    oldTick: Number(pool.tick),
    tick,
    sqrtPriceX96,
    liquidity: reserves.liquidity,
    positionCount,
  };
}

// ── V3 repair ──

async function repairV3Batch({ client, blockNumber, pools }) {
  const poolInputs = [];
  const contracts = [];

  for (const pool of pools) {
    const isToken0 = pool.is_token0;
    const token0 = isToken0 ? pool.base_token : pool.quote_token;
    const token1 = isToken0 ? pool.quote_token : pool.base_token;

    poolInputs.push({ pool, token0, token1 });

    contracts.push(
      {
        abi: V3_POOL_SLOT0_ABI,
        address: pool.address,
        functionName: "slot0",
        blockNumber,
      },
      {
        abi: ERC20_BALANCE_OF_ABI,
        address: token0,
        functionName: "balanceOf",
        args: [pool.address],
        blockNumber,
      },
      {
        abi: ERC20_BALANCE_OF_ABI,
        address: token1,
        functionName: "balanceOf",
        args: [pool.address],
        blockNumber,
      },
    );
  }

  const results = await client.multicall({ allowFailure: true, contracts });

  return poolInputs.map(({ pool }, index) => {
    const slot0Result = results[index * 3];
    const bal0Result = results[index * 3 + 1];
    const bal1Result = results[index * 3 + 2];

    if (slot0Result?.status !== "success") {
      return { pool, error: new Error(`V3 slot0 failed: ${slot0Result?.error?.shortMessage ?? "unknown"}`) };
    }
    if (bal0Result?.status !== "success") {
      return { pool, error: new Error(`token0 balanceOf failed: ${bal0Result?.error?.shortMessage ?? "unknown"}`) };
    }
    if (bal1Result?.status !== "success") {
      return { pool, error: new Error(`token1 balanceOf failed: ${bal1Result?.error?.shortMessage ?? "unknown"}`) };
    }

    const sqrtPriceX96 = slot0Result.result[0];
    const tick = Number(slot0Result.result[1]);
    const reserves0 = bal0Result.result;
    const reserves1 = bal1Result.result;

    return {
      update: {
        address: pool.address,
        chainId: Number(pool.chain_id),
        type: pool.type,
        oldReserves0: BigInt(pool.reserves0),
        oldReserves1: BigInt(pool.reserves1),
        reserves0,
        reserves1,
        oldTick: Number(pool.tick),
        tick,
        sqrtPriceX96,
        liquidity: BigInt(pool.liquidity),
        positionCount: -1,
      },
    };
  });
}

// ── V4 migrated repair (clamp only) ──

function repairV4Clamped(pools) {
  return pools.map((pool) => {
    const r0 = BigInt(pool.reserves0);
    const r1 = BigInt(pool.reserves1);
    if (r0 >= 0n && r1 >= 0n) return null;

    return {
      update: {
        address: pool.address,
        chainId: Number(pool.chain_id),
        type: pool.type,
        oldReserves0: r0,
        oldReserves1: r1,
        reserves0: r0 > 0n ? r0 : 0n,
        reserves1: r1 > 0n ? r1 : 0n,
        oldTick: Number(pool.tick),
        tick: Number(pool.tick),
        sqrtPriceX96: BigInt(pool.sqrt_price),
        liquidity: BigInt(pool.liquidity),
        positionCount: -1,
      },
    };
  }).filter(Boolean);
}

// ── Batch with retry ──

async function repairBatchWithRetry({ repairFn, pools, retries }) {
  const results = await repairFn(pools).catch((error) =>
    pools.map((pool) => ({ pool, error })),
  );

  const failedResults = results.filter((r) => r.error);
  if (failedResults.length === 0 || retries <= 0 || pools.length <= 1) {
    return results;
  }

  const failedPools = failedResults.map((r) => r.pool);
  const failedAddrs = new Set(failedPools.map((p) => p.address));
  const successResults = results.filter((r) => !failedAddrs.has(r.pool?.address));
  const splitSize = Math.max(1, Math.ceil(failedPools.length / 2));
  const retriedResults = [];

  for (let i = 0; i < failedPools.length; i += splitSize) {
    retriedResults.push(
      ...(await repairBatchWithRetry({
        repairFn,
        pools: failedPools.slice(i, i + splitSize),
        retries: retries - 1,
      })),
    );
  }

  return [...successResults, ...retriedResults];
}

// ── SQL generation ──

function buildUpdateSql({ table, columns, updates }) {
  const qualifiedTable = `${qi(table.schema)}.${qi(table.table)}`;
  const addressPredicate =
    columns.address.type === "bytea"
      ? `${qi("p")}.${qi(columns.address.name)} = decode(${qi("v")}.address_hex, 'hex')`
      : `${normalizeAddressExpr(columns.address, "p")} = ${qi("v")}.address_hex`;

  const values = updates
    .map(
      (u) =>
        `(${[
          ql(hexNoPrefix(u.address)),
          Number(u.chainId),
          ql(u.reserves0.toString()),
          ql(u.reserves1.toString()),
          Number(u.tick),
          ql(u.sqrtPriceX96.toString()),
          ql(u.liquidity.toString()),
        ].join(", ")})`,
    )
    .join(",\n");

  return `begin;
set local search_path = ${qi(table.schema)}, public;
create temporary table if not exists live_query_tables (
  table_name text primary key
) on commit drop;
update ${qualifiedTable} as ${qi("p")}
set
  ${qi(columns.reserves0.name)} = ${qi("v")}.reserves0::${numericColumnType(columns.reserves0)},
  ${qi(columns.reserves1.name)} = ${qi("v")}.reserves1::${numericColumnType(columns.reserves1)},
  ${qi(columns.tick.name)} = ${qi("v")}.tick::${numericColumnType(columns.tick)},
  ${qi(columns.sqrtPrice.name)} = ${qi("v")}.sqrt_price::${numericColumnType(columns.sqrtPrice)},
  ${qi(columns.liquidity.name)} = ${qi("v")}.liquidity::${numericColumnType(columns.liquidity)}
from (
  values ${values}
) as ${qi("v")}(address_hex, chain_id, reserves0, reserves1, tick, sqrt_price, liquidity)
where ${addressPredicate}
  and ${qi("p")}.${qi(columns.chainId.name)}::numeric = ${qi("v")}.chain_id;
commit;
`;
}

function verifyUpdates({ databaseUrl, table, columns, updates }) {
  if (updates.length === 0) return [];
  const qualifiedTable = `${qi(table.schema)}.${qi(table.table)}`;
  const values = updates
    .map((u) => `(${ql(hexNoPrefix(u.address))}, ${Number(u.chainId)})`)
    .join(",\n");

  return psqlJson(
    databaseUrl,
    `with target(address_hex, chain_id) as (
       values ${values}
     )
     select coalesce(json_agg(q), '[]'::json)
     from (
       select
         ${selectHexAddress(columns.address, "address", "p")},
         ${qi("p")}.${qi(columns.reserves0.name)}::text as reserves0,
         ${qi("p")}.${qi(columns.reserves1.name)}::text as reserves1
       from ${qualifiedTable} ${qi("p")}
       join target on ${normalizeAddressExpr(columns.address, "p")} = target.address_hex
         and ${qi("p")}.${qi(columns.chainId.name)}::numeric = target.chain_id
     ) q`,
  );
}

// ── Main ──

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.databaseUrl) throw new Error("Missing --database-url or DATABASE_URL");
  if (!args.rpcUrl) throw new Error("Missing --rpc-url or PONDER_RPC_URL_{chainId}");

  const table = resolvePoolTable(args.databaseUrl, args.schema, args.table);
  const columns = buildColumnMap(table.columns);
  const pools = loadPools({
    databaseUrl: args.databaseUrl,
    table,
    columns,
    chainId: args.chainId,
    types: args.types,
    all: args.all,
    limit: args.limit,
  });

  const viemChain = CHAINS[args.chainId] ?? base;
  const client = createPublicClient({
    chain: viemChain,
    transport: http(args.rpcUrl),
  });

  const blockNumber = args.blockNumber ?? (await client.getBlockNumber());

  const dhookPools = pools.filter((p) => p.type === "dhook" || p.type === "rehype");
  const v3Pools = pools.filter((p) => p.type === "v3");
  const v4Pools = pools.filter((p) => p.type === "v4");

  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
  console.log(`Table: ${table.schema}.${table.table}`);
  console.log(`Block: ${blockNumber}`);
  console.log(`Pools: ${pools.length} total (dhook/rehype=${dhookPools.length}, v3=${v3Pools.length}, v4=${v4Pools.length})`);

  const allUpdates = [];
  let failed = 0;

  // ── DHook/Rehype ──
  if (dhookPools.length > 0) {
    console.log(`\nProcessing ${dhookPools.length} dhook/rehype pools...`);
    const batchSize = args.rpcBatchSize;

    for (let i = 0; i < dhookPools.length; i += batchSize) {
      const batch = dhookPools.slice(i, i + batchSize);

      const batchResults = await repairDHookBatch({
        client,
        stateView: args.stateView,
        blockNumber,
        pools: batch,
      }).catch((error) => batch.map((pool) => ({ pool, error })));

      for (const result of batchResults) {
        if (result.error) {
          failed++;
          const p = result.pool;
          console.error(
            `  FAIL ${p.address} | type=${p.type} | initializer=${p.initializer ?? "null"} | base_token=${p.base_token ?? "null"} | hooks=${p.pool_key ? normalizePoolKey(p.pool_key).hooks : "null"} | ${result.error.message}`,
          );
        } else {
          allUpdates.push(result.update);
        }
      }

      console.log(
        `  dhook/rehype: ${Math.min(i + batchSize, dhookPools.length)}/${dhookPools.length} processed, ${allUpdates.length} repairs, ${failed} failed`,
      );
    }
  }

  // ── V3 ──
  if (v3Pools.length > 0) {
    console.log(`\nProcessing ${v3Pools.length} v3 pools...`);
    const prevUpdates = allUpdates.length;
    const batchSize = args.rpcBatchSize;

    for (let i = 0; i < v3Pools.length; i += batchSize * args.concurrency) {
      const window = v3Pools.slice(i, i + batchSize * args.concurrency);
      const batches = [];
      for (let j = 0; j < window.length; j += batchSize) {
        batches.push(window.slice(j, j + batchSize));
      }

      const batchResults = (
        await Promise.all(
          batches.map((batch) =>
            repairBatchWithRetry({
              repairFn: (p) => repairV3Batch({ client, blockNumber, pools: p }),
              pools: batch,
              retries: args.retries,
            }),
          ),
        )
      ).flat();

      for (const result of batchResults) {
        if (result.error) {
          failed++;
          if (args.verbose) console.error(`  FAIL ${result.pool.address}: ${result.error.message}`);
        } else {
          allUpdates.push(result.update);
        }
      }

      console.log(
        `  v3: ${Math.min(i + batchSize * args.concurrency, v3Pools.length)}/${v3Pools.length} processed, ${allUpdates.length - prevUpdates} repairs`,
      );
    }
  }

  // ── V4 migrated (clamp only) ──
  if (v4Pools.length > 0) {
    console.log(`\nProcessing ${v4Pools.length} v4-migrated pools (clamp to 0)...`);
    const v4Updates = repairV4Clamped(v4Pools);
    allUpdates.push(...v4Updates.map((r) => r.update));
    console.log(`  v4: clamped ${v4Updates.length} pools`);
  }

  // ── Summary ──
  if (args.verbose) {
    for (const u of allUpdates) {
      console.log(
        `  ${u.type} ${u.address} | r0: ${u.oldReserves0}->${u.reserves0} | r1: ${u.oldReserves1}->${u.reserves1} | tick: ${u.oldTick}->${u.tick}`,
      );
    }
  }

  console.log(`\nTotal: ${allUpdates.length} repairs, ${failed} failed`);

  // ── Apply ──
  if (args.apply && allUpdates.length > 0) {
    let applied = 0;
    for (let i = 0; i < allUpdates.length; i += args.applyBatchSize) {
      const batch = allUpdates.slice(i, i + args.applyBatchSize);
      psqlExec(args.databaseUrl, buildUpdateSql({ table, columns, updates: batch }));
      applied += batch.length;

      if (args.verify) {
        const verified = verifyUpdates({ databaseUrl: args.databaseUrl, table, columns, updates: batch });
        console.log(`Applied batch of ${batch.length} updates; verified ${verified.length} rows.`);
      } else {
        console.log(`Applied batch of ${batch.length} updates.`);
      }
    }
    console.log(`Applied ${applied} total updates.`);
  } else if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to write updates.");
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
