#!/usr/bin/env node

// Patch Ponder for non-blocking index creation on partitioned tables.
//
// Postgres rejects CREATE INDEX CONCURRENTLY on a partitioned parent. The
// project's local pnpm patch rewrites every CREATE INDEX IF NOT EXISTS to
// CREATE INDEX CONCURRENTLY IF NOT EXISTS unconditionally, which works on
// non-partitioned tables (multichain mode) but fails the moment isolated
// mode turns every user table into a partitioned parent.
//
// This script makes two changes:
//
// (1) dist/esm/database/actions.js — replaces createIndexes() so that for
//     each statement it:
//        a. parses out the index name + target table
//        b. probes pg_class for relkind = 'p'
//        c. if partitioned, builds each child partition's index with
//           CREATE INDEX CONCURRENTLY IF NOT EXISTS (non-blocking), then
//           creates the parent index ON ONLY, then ATTACHes each child —
//           when all are attached, the parent flips to VALID
//        d. if not partitioned, runs the original CONCURRENTLY rewrite
//
// (2) dist/esm/bin/isolatedController.js — drops the await on
//     createIndexes so chains transition to live the instant backfill
//     ends, matching the runtime/multichain.js pattern already in the
//     pnpm patch. The promise is captured and awaited during shutdown so
//     partial CONCURRENTLY builds aren't orphaned as INVALID.
//
// Run:
//   node scripts/patch-ponder-partitioned-indexes.mjs
//
// Defaults to the canonical paths under node_modules/ponder/dist/esm/.
// Idempotent — re-running is safe.
//
// For persistence across pnpm install:
//   pnpm patch ponder@0.16.3
//   node scripts/patch-ponder-partitioned-indexes.mjs \
//     <temp-dir>/dist/esm/database/actions.js \
//     <temp-dir>/dist/esm/bin/isolatedController.js
//   pnpm patch-commit <temp-dir>

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_ACTIONS_PATH =
  "node_modules/ponder/dist/esm/database/actions.js";
const DEFAULT_CONTROLLER_PATH =
  "node_modules/ponder/dist/esm/bin/isolatedController.js";

// ── (1) New createIndexes function for actions.js ──────────────────────

const NEW_CREATE_INDEXES = `export const createIndexes = async (qb, { statements }, context) => {
    // PATCH: per-partition CREATE INDEX CONCURRENTLY + ATTACH for
    // partitioned tables; plain CONCURRENTLY for non-partitioned. Postgres
    // rejects CONCURRENTLY on a partitioned parent, so the partitioned
    // path builds each child concurrently (non-blocking on writes), then
    // creates the parent ON ONLY and ATTACHes each child — when all
    // children are attached, the parent flips to VALID.
    //
    // CONCURRENCY=1 because parallel CREATE INDEX CONCURRENTLY workers
    // can form deadlock cycles via virtual transactions.
    const isPostgres = qb.$dialect === "postgres";
    const CONCURRENCY = isPostgres ? 1 : 4;

    if (!isPostgres) {
        const queue = statements.indexes.sql.slice();
        const runWorker = async () => {
            while (queue.length > 0) {
                const statement = queue.shift();
                if (statement === undefined) return;
                await qb.transaction({ label: "create_indexes" }, async (tx) => {
                    await tx.wrap((tx) => tx.execute("SET statement_timeout = 3600000;"));
                    await tx.wrap((tx) => tx.execute(statement));
                }, undefined, context);
            }
        };
        const workerCount = Math.min(CONCURRENCY, queue.length);
        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
        return;
    }

    // Sweep any INVALID indexes left behind by a previously-killed
    // CREATE INDEX CONCURRENTLY. IF NOT EXISTS does not recreate them,
    // so they would stay broken and queries would not use them.
    if (statements.indexes.sql.length > 0) {
        const sweepClient = await qb.$client.connect();
        try {
            const { rows } = await sweepClient.query(\`
                SELECT n.nspname AS schema, c.relname AS index
                FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE NOT i.indisvalid
            \`);
            for (const row of rows) {
                await sweepClient.query(\`DROP INDEX IF EXISTS "\${row.schema}"."\${row.index}"\`);
            }
        }
        finally {
            sweepClient.release();
        }
    }

    const parseCreateIndex = (statement) => {
        // Matches: CREATE [UNIQUE] INDEX [IF NOT EXISTS] <name> ON
        //          [<schema>.]<table> <tail>
        // Identifiers are either bare or double-quoted.
        const re = /^\\s*CREATE(?:\\s+(UNIQUE))?\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:"([^"]+)"|([\\w$]+))\\s+ON\\s+(?:(?:"([^"]+)"|([\\w$]+))\\s*\\.\\s*)?(?:"([^"]+)"|([\\w$]+))\\s+(.+)$/is;
        const m = statement.match(re);
        if (!m) return null;
        return {
            unique: !!m[1],
            name: m[2] || m[3],
            schema: m[4] || m[5] || null,
            table: m[6] || m[7],
            tail: m[8],
        };
    };

    const runOne = async (sqlStatement) => {
        await qb.wrap({ label: "create_indexes" }, async () => {
            const client = await qb.$client.connect();
            try {
                await client.query("SET statement_timeout = 3600000");
                await client.query(sqlStatement);
            }
            finally {
                client.release();
            }
        }, context);
    };

    const rewriteWithConcurrent = (statement) =>
        statement.replace(/^\\s*CREATE(\\s+UNIQUE)?\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS/i, (_m, unique) => \`CREATE\${unique ?? ""} INDEX CONCURRENTLY IF NOT EXISTS\`);

    const childIndexName = (parentName, partitionName) => {
        const proposed = \`\${parentName}_\${partitionName}\`;
        // Postgres NAMEDATALEN-1 = 63
        return proposed.length > 63 ? proposed.slice(0, 63) : proposed;
    };

    const processStatement = async (statement) => {
        const parsed = parseCreateIndex(statement);
        if (!parsed) {
            // Unrecognized shape — best effort, just apply the original
            // CONCURRENTLY rewrite. If the target happens to be partitioned
            // this will still fail, but the previous behavior would have
            // failed too.
            await runOne(rewriteWithConcurrent(statement));
            return;
        }

        const probeClient = await qb.$client.connect();
        let isPartitioned = false;
        let partitions = [];
        let alreadyAttached = new Set();
        try {
            const schemaName = parsed.schema ?? "public";
            const probe = await probeClient.query("SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2", [schemaName, parsed.table]);
            isPartitioned = probe.rows[0]?.relkind === "p";
            if (isPartitioned) {
                const parts = await probeClient.query("SELECT child.relname AS name FROM pg_inherits i JOIN pg_class parent ON parent.oid = i.inhparent JOIN pg_class child ON child.oid = i.inhrelid JOIN pg_namespace pn ON pn.oid = parent.relnamespace WHERE pn.nspname = $1 AND parent.relname = $2 ORDER BY child.relname", [schemaName, parsed.table]);
                partitions = parts.rows.map((r) => r.name);
                // Find children already attached to the parent INDEX (not
                // the parent TABLE). Skipping these makes re-runs safe —
                // ATTACH PARTITION errors if the child is already attached.
                const attached = await probeClient.query("SELECT child.relname AS name FROM pg_inherits i JOIN pg_class parent ON parent.oid = i.inhparent JOIN pg_class child ON child.oid = i.inhrelid JOIN pg_namespace pn ON pn.oid = parent.relnamespace WHERE pn.nspname = $1 AND parent.relname = $2", [schemaName, parsed.name]);
                alreadyAttached = new Set(attached.rows.map((r) => r.name));
            }
        }
        finally {
            probeClient.release();
        }

        if (!isPartitioned) {
            await runOne(rewriteWithConcurrent(statement));
            return;
        }

        const unique = parsed.unique ? " UNIQUE" : "";
        const schemaName = parsed.schema ?? "public";
        const schemaQ = \`"\${schemaName}".\`;

        // 1. Build each child partition's index concurrently.
        for (const partition of partitions) {
            const cname = childIndexName(parsed.name, partition);
            await runOne(\`CREATE\${unique} INDEX CONCURRENTLY IF NOT EXISTS "\${cname}" ON \${schemaQ}"\${partition}" \${parsed.tail}\`);
        }

        // 2. Create the parent index ON ONLY — INVALID until all children
        //    are attached.
        await runOne(\`CREATE\${unique} INDEX IF NOT EXISTS "\${parsed.name}" ON ONLY \${schemaQ}"\${parsed.table}" \${parsed.tail}\`);

        // 3. ATTACH each child. When all are attached, parent → VALID.
        for (const partition of partitions) {
            const cname = childIndexName(parsed.name, partition);
            if (alreadyAttached.has(cname)) continue;
            await runOne(\`ALTER INDEX \${schemaQ}"\${parsed.name}" ATTACH PARTITION \${schemaQ}"\${cname}"\`);
        }
    };

    const queue = statements.indexes.sql.slice();
    const runWorker = async () => {
        while (queue.length > 0) {
            const statement = queue.shift();
            if (statement === undefined) return;
            await processStatement(statement);
        }
    };
    const workerCount = Math.min(CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
};
`;

// ── (2) isolatedController.js: drop the await on createIndexes ─────────

const OLD_CONTROLLER_BLOCK =
  '            let endClock = startClock();\n' +
  '            // Use userQB instead of adminQB so parallel createIndexes workers\n' +
  '            // get concurrent connections (adminQB pool is capped at 2). The\n' +
  '            // user pool is idle here: backfill is done and live indexing\n' +
  '            // hasn\'t started.\n' +
  '            await createIndexes(database.userQB, {\n' +
  '                statements: schemaBuild.statements,\n' +
  '            });\n' +
  '            if (schemaBuild.statements.indexes.sql.length > 0) {\n' +
  '                common.logger.info({\n' +
  '                    msg: "Created database indexes",\n' +
  '                    count: schemaBuild.statements.indexes.sql.length,\n' +
  '                    duration: endClock(),\n' +
  '                });\n' +
  '            }';

const NEW_CONTROLLER_BLOCK =
  '            let endClock = startClock();\n' +
  '            // PATCH: Kick off index creation in the background so chains\n' +
  '            // transition to live the instant backfill ends instead of\n' +
  '            // blocking 10-15 minutes for index builds. createIndexes uses\n' +
  '            // CREATE INDEX CONCURRENTLY on each partition + ATTACH so\n' +
  '            // builds do not block writes from the live indexer (see\n' +
  '            // database/actions.js::createIndexes).\n' +
  '            const indexCount = schemaBuild.statements.indexes.sql.length;\n' +
  '            const indexBuildPromise = createIndexes(database.userQB, {\n' +
  '                statements: schemaBuild.statements,\n' +
  '            })\n' +
  '                .then(() => {\n' +
  '                if (indexCount > 0) {\n' +
  '                    common.logger.info({\n' +
  '                        msg: "Created database indexes (background)",\n' +
  '                        count: indexCount,\n' +
  '                        duration: endClock(),\n' +
  '                    });\n' +
  '                }\n' +
  '            })\n' +
  '                .catch((err) => {\n' +
  '                common.logger.error({\n' +
  '                    msg: "Background index build failed",\n' +
  '                    error: err?.message ?? String(err),\n' +
  '                });\n' +
  '            });\n' +
  '            // Best-effort: await background index build during shutdown\n' +
  '            // so partially built CONCURRENTLY indexes do not get orphaned\n' +
  '            // as INVALID. IF NOT EXISTS does NOT recreate invalid indexes\n' +
  '            // — they must be dropped manually.\n' +
  '            common.shutdown.add(async () => {\n' +
  '                await indexBuildPromise;\n' +
  '            });';

// ── Apply ──────────────────────────────────────────────────────────────

const PATCH_MARKER_ACTIONS = "PATCH: per-partition CREATE INDEX CONCURRENTLY";
const PATCH_MARKER_CONTROLLER =
  "PATCH: Kick off index creation in the background";

function patchActions(path) {
  const content = readFileSync(path, "utf8");

  if (content.includes(PATCH_MARKER_ACTIONS)) {
    process.stdout.write(`already patched: ${path}\n`);
    return;
  }

  const startMarker =
    "export const createIndexes = async (qb, { statements }, context) => {";
  const endMarker = "\nexport const createTriggers";

  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`createIndexes signature not found in ${path}`);
  }
  const endIdx = content.indexOf(endMarker, startIdx + startMarker.length);
  if (endIdx === -1) {
    throw new Error(
      `createTriggers marker not found after createIndexes in ${path}`,
    );
  }

  // Replace [startIdx, endIdx) with the new function. The newline before
  // export const createTriggers stays in the unchanged tail.
  const patched =
    content.slice(0, startIdx) + NEW_CREATE_INDEXES + content.slice(endIdx + 1);
  writeFileSync(path, patched);
  process.stdout.write(`patched: ${path}\n`);
}

function patchController(path) {
  const content = readFileSync(path, "utf8");

  if (content.includes(PATCH_MARKER_CONTROLLER)) {
    process.stdout.write(`already patched: ${path}\n`);
    return;
  }

  if (!content.includes(OLD_CONTROLLER_BLOCK)) {
    throw new Error(
      `target block not found in ${path}.\n` +
        `The local Ponder file may differ from the expected pnpm-patched state.\n` +
        `Inspect the isolatedController.js end-of-backfill createIndexes call manually.`,
    );
  }

  const patched = content.replace(OLD_CONTROLLER_BLOCK, NEW_CONTROLLER_BLOCK);
  writeFileSync(path, patched);
  process.stdout.write(`patched: ${path}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const actionsPath = resolve(args[0] ?? DEFAULT_ACTIONS_PATH);
  const controllerPath = resolve(args[1] ?? DEFAULT_CONTROLLER_PATH);

  try {
    patchActions(actionsPath);
    patchController(controllerPath);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
