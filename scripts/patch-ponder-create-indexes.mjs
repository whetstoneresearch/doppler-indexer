#!/usr/bin/env node

// Patch Ponder's createIndexes to NOT rewrite CREATE INDEX IF NOT EXISTS
// into CREATE INDEX CONCURRENTLY IF NOT EXISTS. The local pnpm patch adds
// CONCURRENTLY unconditionally, but Postgres rejects CONCURRENTLY on a
// partitioned parent table — which every user table becomes in isolated
// mode. With this patch off, Ponder issues plain CREATE INDEX IF NOT
// EXISTS, which:
//
//   1. works on partitioned tables, and
//   2. is a cheap no-op when the index already exists (which it will,
//      after `--phase indexes` of the migration generator has run).
//
// Live-write blocking from CREATE INDEX is irrelevant here because Ponder
// only invokes createIndexes once, at the end of historical backfill,
// before live indexing begins. There are no concurrent writes to block.
//
// Usage:
//   node scripts/patch-ponder-create-indexes.mjs [path-to-actions.js]
//
// Defaults to node_modules/ponder/dist/esm/database/actions.js. Idempotent.
//
// For a persistent fix (survives pnpm install), regenerate the pnpm patch:
//   pnpm patch ponder@0.16.3
//   # apply this script to dist/esm/database/actions.js in the printed dir
//   pnpm patch-commit <printed-dir>

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_PATH = "node_modules/ponder/dist/esm/database/actions.js";

// The block we're replacing — matches the queue.map() inside createIndexes
// that adds CONCURRENTLY. Indentation included so we know we're hitting
// the right occurrence.
const OLD_BLOCK =
  "    const queue = statements.indexes.sql.map((statement) => {\n" +
  "        if (!isPostgres) return statement;\n" +
  '        return statement.replace(/^\\s*CREATE(\\s+UNIQUE)?\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS/i, (_m, unique) => `CREATE${unique ?? ""} INDEX CONCURRENTLY IF NOT EXISTS`);\n' +
  "    });";

// Pass statements through unchanged — no CONCURRENTLY rewrite.
const NEW_BLOCK =
  "    const queue = statements.indexes.sql.slice();";

function main() {
  const path = resolve(process.argv[2] ?? DEFAULT_PATH);
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`error: cannot read ${path}: ${err.message}\n`);
    process.exit(1);
  }

  if (content.includes(NEW_BLOCK) && !content.includes(OLD_BLOCK)) {
    process.stdout.write(`already patched: ${path}\n`);
    process.exit(0);
  }

  if (!content.includes(OLD_BLOCK)) {
    process.stderr.write(
      `error: target pattern not found in ${path}\n` +
        `The Ponder version may differ from 0.16.3, or the local pnpm patch\n` +
        `has been altered. Inspect createIndexes manually.\n`,
    );
    process.exit(1);
  }

  const patched = content.replace(OLD_BLOCK, NEW_BLOCK);
  writeFileSync(path, patched);
  process.stdout.write(`patched: ${path}\n`);
}

main();
