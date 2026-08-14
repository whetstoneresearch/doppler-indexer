#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createPublicClient, http } from "viem";

// DN404Created(address indexed token, address indexed collection,
//              address indexed owner, uint256 initialSupply)
const DN404_CREATED_SELECTOR =
  "0x3f41001eff6716d26b46bbb6869ed625cc64fded25d99f9f381bbe8fa89872a9";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Kept in sync with src/config/chains/*.ts (addresses.shared.dn404Factory) and
// DN404_FACTORY_START_BLOCKS in src/config/chains/constants.ts.
const FACTORY_BY_CHAIN = {
  8453: {
    address: "0x37a9fa204a4d3a429fded7e3469ab076c854bc9d",
    deployBlock: 49199335,
  },
  84532: {
    address: "0x98b0aa2e0f134dbb3eb157b5646d387e6d55243a",
    deployBlock: 41118945,
  },
  4663: {
    address: "0x37a9fa204a4d3a429fded7e3469ab076c854bc9d",
    deployBlock: 646846,
  },
};

const RPC_ENV_BY_CHAIN = {
  8453: ["PONDER_RPC_URL_8453", "BASE_RPC", "BASE_RPC_URL"],
  84532: ["PONDER_RPC_URL_84532", "BASE_SEPOLIA_RPC"],
  4663: ["PONDER_RPC_URL_4663", "ROBINHOOD_RPC"],
};

const DN404_ABI = [
  { type: "function", name: "unit", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "baseURI", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "mirrorERC721", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "totalNFTSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

const MIRROR_ABI = [
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));
loadDotEnv(resolve(process.cwd(), ".env.local"));

function parseArgs(argv) {
  const args = {
    apply: false,
    chainId: 4663,
    schema: "prod_2",
    pondersyncSchema: "ponder_sync",
    databaseUrl: process.env.DATABASE_URL,
    rpcUrl: undefined,
    factory: undefined,
    concurrency: 8,
    batchSize: 200,
    fromBlock: undefined,
    toBlock: undefined,
    limit: undefined,
    token: undefined,
    atTip: false,
    onlyUnclassified: false,
    verbose: false,
    failuresPath: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--at-tip") args.atTip = true;
    else if (a === "--only-unclassified") args.onlyUnclassified = true;
    else if (a === "--verbose") args.verbose = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`Missing value for ${a}`);
      if (key === "database-url") args.databaseUrl = v;
      else if (key === "rpc-url") args.rpcUrl = v;
      else if (key === "chain-id") args.chainId = Number(v);
      else if (key === "schema") args.schema = v;
      else if (key === "ponder-sync-schema") args.pondersyncSchema = v;
      else if (key === "factory") args.factory = v.toLowerCase();
      else if (key === "concurrency") args.concurrency = Number(v);
      else if (key === "batch-size") args.batchSize = Number(v);
      else if (key === "from-block") args.fromBlock = Number(v);
      else if (key === "to-block") args.toBlock = Number(v);
      else if (key === "limit") args.limit = Number(v);
      else if (key === "token") args.token = v.toLowerCase();
      else if (key === "failures") args.failuresPath = v;
      else throw new Error(`Unknown argument ${a}`);
    } else throw new Error(`Unknown argument ${a}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/repair-dn404-classification.mjs [options]

Repairs DN404 tokens that were indexed as plain ERC20s while the
DN404Factory:DN404Created handler was missing from the indexer. For each
DN404Created log emitted by the factory, this script:

  1. Reads the factory's DN404Created logs over a single address+topic0
     filtered eth_getLogs, bisecting only if the provider refuses the range.
  2. Re-runs exactly the reads the live handler performs (readDN404TokenData):
     unit(), baseURI(), mirrorERC721() and totalNFTSupply() on the token, then
     totalSupply() on the mirror. The mirror from the log ('collection') wins
     over the on-chain read, matching the handler.
  3. UPDATEs token_variant plus the five dn404_* columns on <schema>.token.

Reads are pinned to each token's creation block by default, so a repaired row
is identical to what the handler would have written had it been registered.
dn404_nft_supply is a creation-time snapshot in the live handler too — it is
never refreshed afterwards. Pass --at-tip to read current state instead.

Rows are only UPDATEd, never inserted. A DN404Created log whose token has no
row in <schema>.token means the indexer has not reached that block yet in this
schema; those are reported and skipped rather than inserted ahead of it.

toBlock defaults to the chain's safe_checkpoint block from
<schema>._ponder_checkpoint, NOT the chain tip, for the same reason.

Preflight: dn404_mirror_address must be 'text'. Ponder's t.hex() maps to text
(node_modules/ponder/dist/esm/drizzle/hex.js), and Postgres coerces a '0x...'
string into a bytea column as escape-format ASCII without erroring — 42 junk
bytes instead of the 20-byte address. The script aborts with the remediation
SQL rather than writing into a bytea column.

Writes suppress Ponder's reorg log via SET LOCAL ponder.suppress_reorg_log,
which needs no DDL and so takes no ACCESS EXCLUSIVE lock on the live tables.

Options:
  --chain-id <id>            EVM chain id. Default 4663 (robinhood).
  --schema <name>            Materialized indexer schema. Default prod_2.
  --ponder-sync-schema <s>   Sync schema name. Default ponder_sync.
  --factory <0x...>          DN404Factory. Default: the chain's known factory.
  --rpc-url <url>            RPC URL. Default \$PONDER_RPC_URL_<chain> etc.
  --database-url <url>       Postgres URL. Default \$DATABASE_URL.
  --concurrency <n>          Tokens read in flight. Default 8.
  --batch-size <n>           Tokens per write transaction. Default 200.
  --from-block <n>           First block to scan. Default: factory deploy block.
  --to-block <n>             Last block to scan. Default: safe checkpoint.
  --limit <n>                Process at most N tokens.
  --token <0x...>            Process exactly one token (must still have a log).
  --at-tip                   Read token state at latest, not creation block.
  --only-unclassified        Skip rows already at token_variant='doppler404'.
  --failures <path>          Append tokens that errored to this file.
  --verbose                  Log every token, not just drift and summary.
  --apply                    Actually write. Default is dry-run.

Dry-run prints the values that would be written next to what is stored, so the
drift is visible before anything changes.
`);
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function qlOrNull(value) {
  return value === null || value === undefined ? "null" : ql(value);
}

function topicToAddress(topic) {
  const hex = topic.startsWith("0x") ? topic.slice(2) : topic;
  return `0x${hex.slice(24).toLowerCase()}`;
}

function resolveRpcUrl(chainId, override) {
  if (override) return override;
  for (const name of RPC_ENV_BY_CHAIN[chainId] ?? []) {
    if (process.env[name]) return process.env[name];
  }
  throw new Error(
    `No RPC URL found for chain ${chainId}. Set --rpc-url or one of ${(RPC_ENV_BY_CHAIN[chainId] ?? []).join(", ")}.`,
  );
}

function resolveFactory(chainId, override) {
  if (override) return override;
  const known = FACTORY_BY_CHAIN[chainId];
  if (!known)
    throw new Error(
      `No known DN404Factory for chain ${chainId}. Pass --factory.`,
    );
  return known.address;
}

function resolveFromBlock(chainId, override) {
  if (override !== undefined) return override;
  return FACTORY_BY_CHAIN[chainId]?.deployBlock ?? 0;
}

/**
 * SQL goes over stdin rather than `-c`: Linux caps a single argv entry at
 * MAX_ARG_STRLEN (128KB), and a batched UPDATE ... FROM (values ...) for a few
 * hundred tokens blows past that as `spawn E2BIG`.
 */
function psqlStdin(databaseUrl, sql, extraArgs = ["-q"]) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "psql",
      [databaseUrl, "-X", ...extraArgs, "-v", "ON_ERROR_STOP=1"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.trim() || `psql exited with code ${code}`));
    });
    child.stdin.on("error", reject);
    child.stdin.end(sql);
  });
}

async function psqlRowsTsv(databaseUrl, sql, minColumns) {
  const stdout = await psqlStdin(databaseUrl, sql, ["-A", "-t"]);
  const rows = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < minColumns) continue;
    rows.push(parts);
  }
  return rows;
}

/**
 * Runs one write transaction. Reorg logging is gated off with a transaction
 * local GUC the reorg trigger already checks, so no DDL and no table lock.
 * lock_timeout keeps a wedged batch from queueing behind the live indexer.
 */
async function psqlWriteTx(databaseUrl, statements, attempts = 5) {
  const sql = [
    "begin;",
    "set local ponder.suppress_reorg_log = '1';",
    "set local lock_timeout = '15s';",
    "set local statement_timeout = '180s';",
    ...statements,
    "commit;",
  ].join("\n");

  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await psqlStdin(databaseUrl, sql);
      return;
    } catch (err) {
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error(
    `write transaction failed after ${attempts} attempts: ${lastErr?.message || lastErr}`,
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ponder packs its checkpoint as fixed-width decimal fields; the first three are
 * blockTimestamp(10), chainId(16), blockNumber(16). chainId is re-checked so a
 * layout change surfaces here rather than as a silently wrong toBlock.
 */
function parseCheckpointBlock(checkpoint, expectedChainId) {
  const s = String(checkpoint).trim();
  const chainId = Number(s.slice(10, 26));
  const blockNumber = Number(s.slice(26, 42));
  if (chainId !== expectedChainId || !Number.isSafeInteger(blockNumber)) {
    throw new Error(
      `Could not parse checkpoint ${s}: got chainId=${chainId} block=${blockNumber}, expected chainId=${expectedChainId}`,
    );
  }
  return blockNumber;
}

/**
 * t.hex() is text in Ponder, but these columns were added to some schemas by
 * hand as bytea. Postgres does not reject a '0x...' string there — it stores
 * the ASCII of the string — so the mismatch has to be caught before writing.
 */
async function assertWritableColumns(args) {
  const rows = await psqlRowsTsv(
    args.databaseUrl,
    `select column_name || E'\\t' || data_type
     from information_schema.columns
     where table_schema = ${ql(args.schema)}
       and table_name = 'token'
       and (column_name like 'dn404%' or column_name = 'token_variant')
     order by column_name;`,
    2,
  );

  const types = new Map(rows.map(([name, type]) => [name, type]));
  const required = [
    ["token_variant", "text"],
    ["dn404_unit", "numeric"],
    ["dn404_nft_supply", "numeric"],
    ["dn404_base_uri", "text"],
    ["dn404_mirror_address", "text"],
    ["dn404_read_status", "text"],
  ];

  const problems = [];
  for (const [name, expected] of required) {
    const actual = types.get(name);
    if (actual === undefined) problems.push(`${name} is missing`);
    else if (actual !== expected)
      problems.push(`${name} is ${actual}, expected ${expected}`);
  }
  if (problems.length === 0) return;

  const remediation = types.get("dn404_mirror_address") === "bytea"
    ? `\nAll dn404 columns are still NULL, so the type can be corrected without a
table rewrite — DROP + ADD is metadata-only in PG11+, unlike ALTER TYPE:

  begin;
  set local lock_timeout = '15s';
  alter table ${args.schema}.token
    drop column dn404_mirror_address,
    add column dn404_mirror_address text;
  commit;

Verify first that nothing has been written yet:

  select count(*) from ${args.schema}.token where dn404_mirror_address is not null;
`
    : "";

  throw new Error(
    `${args.schema}.token has unwritable dn404 columns:\n  - ${problems.join("\n  - ")}\n${remediation}`,
  );
}

function makeClient(args) {
  return createPublicClient({
    transport: http(resolveRpcUrl(args.chainId, args.rpcUrl), {
      timeout: 30_000,
      retryCount: 3,
    }),
  });
}

function isRangeTooLargeError(err) {
  // viem wraps provider errors, so the provider's own wording can sit in
  // details/shortMessage rather than message.
  const msg = [err?.message, err?.details, err?.shortMessage, err?.cause?.message]
    .filter(Boolean)
    .join(" | ");
  return (
    /more than \d+ results/i.test(msg) ||
    /query returned more than/i.test(msg) ||
    /response size exceeded/i.test(msg) ||
    /log response size/i.test(msg) ||
    /block range/i.test(msg)
  );
}

/**
 * One filtered eth_getLogs covers the factory's whole history in practice; the
 * bisect only kicks in when a provider refuses the result size.
 */
async function getCreatedLogs(client, factory, fromBlock, toBlock) {
  try {
    return await client.request({
      method: "eth_getLogs",
      params: [
        {
          address: factory,
          topics: [DN404_CREATED_SELECTOR],
          fromBlock: `0x${BigInt(fromBlock).toString(16)}`,
          toBlock: `0x${BigInt(toBlock).toString(16)}`,
        },
      ],
    });
  } catch (err) {
    if (!isRangeTooLargeError(err) || fromBlock >= toBlock) throw err;
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const left = await getCreatedLogs(client, factory, fromBlock, mid);
    const right = await getCreatedLogs(client, factory, mid + 1, toBlock);
    return [...left, ...right];
  }
}

async function readOrNull(client, params) {
  try {
    return await client.readContract(params);
  } catch {
    return null;
  }
}

/**
 * Mirrors src/indexer/shared/entities/dn404.ts. Individual eth_calls rather
 * than multicall: the volume is tiny and it drops the dependency on a
 * Multicall3 deployment being present at the pinned historical block.
 */
async function readDN404TokenData(client, tokenAddress, mirrorFromLog, blockNumber) {
  const at = blockNumber === undefined ? {} : { blockNumber: BigInt(blockNumber) };
  const address = tokenAddress.toLowerCase();
  const normalizedMirror =
    mirrorFromLog && mirrorFromLog !== ZERO_ADDRESS
      ? mirrorFromLog.toLowerCase()
      : null;

  const [unit, baseUri, readMirror, tokenNftSupply] = await Promise.all([
    readOrNull(client, { abi: DN404_ABI, address, functionName: "unit", ...at }),
    readOrNull(client, { abi: DN404_ABI, address, functionName: "baseURI", ...at }),
    readOrNull(client, { abi: DN404_ABI, address, functionName: "mirrorERC721", ...at }),
    readOrNull(client, { abi: DN404_ABI, address, functionName: "totalNFTSupply", ...at }),
  ]);

  const mirrorAddress = normalizedMirror ?? (readMirror ? readMirror.toLowerCase() : null);

  let nftSupply = tokenNftSupply;
  if (mirrorAddress && mirrorAddress !== ZERO_ADDRESS) {
    const mirrorSupply = await readOrNull(client, {
      abi: MIRROR_ABI,
      address: mirrorAddress,
      functionName: "totalSupply",
      ...at,
    });
    if (mirrorSupply !== null) nftSupply = mirrorSupply;
  }

  const hasRequiredReads =
    unit !== null && baseUri !== null && mirrorAddress !== null && nftSupply !== null;

  return {
    tokenVariant: "doppler404",
    dn404Unit: unit === null ? null : unit.toString(),
    dn404NftSupply: nftSupply === null ? null : nftSupply.toString(),
    dn404BaseUri: baseUri,
    dn404MirrorAddress: mirrorAddress,
    dn404ReadStatus: hasRequiredReads ? "ok" : "retry",
  };
}

function updateBatchSql(args, rows) {
  const values = rows
    .map(
      (r) =>
        `(${ql(r.address)}, ${ql(r.data.tokenVariant)}, ${qlOrNull(r.data.dn404Unit)}::numeric, ` +
        `${qlOrNull(r.data.dn404NftSupply)}::numeric, ${qlOrNull(r.data.dn404BaseUri)}::text, ` +
        `${qlOrNull(r.data.dn404MirrorAddress)}::text, ${ql(r.data.dn404ReadStatus)})`,
    )
    .join(",\n    ");

  return `
update ${args.schema}.token as t set
  token_variant = v.token_variant,
  dn404_unit = v.dn404_unit,
  dn404_nft_supply = v.dn404_nft_supply,
  dn404_base_uri = v.dn404_base_uri,
  dn404_mirror_address = v.dn404_mirror_address,
  dn404_read_status = v.dn404_read_status
from (values
    ${values}
  ) as v(address, token_variant, dn404_unit, dn404_nft_supply, dn404_base_uri,
         dn404_mirror_address, dn404_read_status)
where lower(t.address) = v.address
  and t.chain_id = ${Number(args.chainId)};`;
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.databaseUrl)
    throw new Error("No database URL. Set DATABASE_URL or --database-url.");

  const factory = resolveFactory(args.chainId, args.factory);
  const fromBlock = resolveFromBlock(args.chainId, args.fromBlock);
  const client = makeClient(args);

  await assertWritableColumns(args);

  let toBlock = args.toBlock;
  if (toBlock === undefined) {
    const rows = await psqlRowsTsv(
      args.databaseUrl,
      `select safe_checkpoint::text from ${args.schema}._ponder_checkpoint where chain_id = ${Number(args.chainId)};`,
      1,
    );
    if (rows.length === 0)
      throw new Error(
        `No _ponder_checkpoint row for chain ${args.chainId} in ${args.schema}. Pass --to-block.`,
      );
    toBlock = parseCheckpointBlock(rows[0][0], args.chainId);
  }

  console.log(
    `chain=${args.chainId} schema=${args.schema} factory=${factory} blocks=${fromBlock}..${toBlock} ` +
      `mode=${args.apply ? "APPLY" : "dry-run"} reads=${args.atTip ? "tip" : "creation-block"}`,
  );

  const logs = await getCreatedLogs(client, factory, fromBlock, toBlock);

  let created = logs.map((log) => ({
    address: topicToAddress(log.topics[1]),
    mirror: topicToAddress(log.topics[2]),
    blockNumber: Number(BigInt(log.blockNumber)),
  }));
  // A reorg-safe toBlock still needs the filter: providers may return logs past
  // it if the range was widened by the bisect.
  created = created.filter((c) => c.blockNumber <= toBlock);
  created.sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));

  if (args.token) created = created.filter((c) => c.address === args.token);
  console.log(`Found ${created.length} DN404Created log(s).`);
  if (created.length === 0) return;

  const addressList = created.map((c) => ql(c.address)).join(",");
  const storedRows = await psqlRowsTsv(
    args.databaseUrl,
    `select lower(address) || E'\\t' || token_variant || E'\\t' || coalesce(dn404_mirror_address, '')
     from ${args.schema}.token
     where chain_id = ${Number(args.chainId)}
       and lower(address) in (${addressList});`,
    3,
  );
  const stored = new Map(storedRows.map(([addr, variant, mirror]) => [addr, { variant, mirror }]));

  const missing = created.filter((c) => !stored.has(c.address));
  if (missing.length > 0) {
    console.log(
      `Skipping ${missing.length} token(s) with no row in ${args.schema}.token ` +
        `(indexer has not reached them): ${missing.slice(0, 5).map((m) => m.address).join(", ")}` +
        `${missing.length > 5 ? ", ..." : ""}`,
    );
    if (args.failuresPath)
      appendFileSync(args.failuresPath, missing.map((m) => `${m.address}\tmissing-row\n`).join(""));
  }

  let work = created.filter((c) => stored.has(c.address));
  if (args.onlyUnclassified)
    work = work.filter((c) => stored.get(c.address).variant !== "doppler404");
  if (args.limit) work = work.slice(0, args.limit);

  console.log(`Processing ${work.length} token(s).`);
  if (work.length === 0) return;

  let failed = 0;
  const results = await mapWithConcurrency(work, args.concurrency, async (item) => {
    try {
      const data = await readDN404TokenData(
        client,
        item.address,
        item.mirror,
        args.atTip ? undefined : item.blockNumber,
      );
      const before = stored.get(item.address);
      if (args.verbose || before.variant !== "doppler404" || before.mirror !== data.dn404MirrorAddress) {
        console.log(
          `  ${item.address} variant ${before.variant} -> ${data.tokenVariant} ` +
            `mirror ${before.mirror || "(null)"} -> ${data.dn404MirrorAddress ?? "(null)"} ` +
            `unit=${data.dn404Unit ?? "null"} nftSupply=${data.dn404NftSupply ?? "null"} ` +
            `status=${data.dn404ReadStatus}`,
        );
      }
      return { address: item.address, data };
    } catch (err) {
      failed++;
      console.error(`  ${item.address} FAILED: ${err?.message || err}`);
      if (args.failuresPath)
        appendFileSync(args.failuresPath, `${item.address}\t${err?.message || err}\n`);
      return null;
    }
  });

  const writable = results.filter(Boolean);
  const retrying = writable.filter((r) => r.data.dn404ReadStatus === "retry").length;

  if (!args.apply) {
    console.log(
      `\nDry run: would update ${writable.length} row(s) ` +
        `(${retrying} with dn404_read_status='retry', ${failed} read failure(s), ${missing.length} missing).` +
        `\nRe-run with --apply to write.`,
    );
    return;
  }

  let written = 0;
  for (let i = 0; i < writable.length; i += args.batchSize) {
    const batch = writable.slice(i, i + args.batchSize);
    await psqlWriteTx(args.databaseUrl, [updateBatchSql(args, batch)]);
    written += batch.length;
    console.log(`  wrote ${written}/${writable.length}`);
  }

  console.log(
    `\nUpdated ${written} row(s) ` +
      `(${retrying} with dn404_read_status='retry', ${failed} read failure(s), ${missing.length} missing).`,
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
