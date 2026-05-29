#!/usr/bin/env node

// Patches Ponder's getRevertSql to emit an explicit target column list on
// the INSERT inside the crashRecovery / revertIsolated CTE chain. Without
// this, Postgres assigns SELECT values to the user table positionally, by
// the user table's PHYSICAL column order — which only works if that order
// matches the TS schema declaration order in ponder.schema.ts.
//
// Our isolated-schema migration builds target tables via `CREATE TABLE
// LIKE source`, which preserves source's physical order. If source columns
// were added later via ALTER (and so appended at the end), source order
// diverges from TS order, and the positional INSERT lands text into bool
// (or similar). Adding `(col1, col2, ...)` to the INSERT makes it
// name-matched and order-independent.
//
// Usage:
//   node scripts/patch-ponder-revert-sql.mjs [path-to-actions.js]
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

// The single-line INSERT statement we are replacing. Match the exact
// installed text (whitespace included) so we know we are surgically
// targeting the right occurrence.
const OLD_INSERT =
  '  INSERT INTO  "${schema}"."${getTableName(table)}"\n' +
  "  SELECT ${Object.values(getTableColumns(table))\n" +
  '        .map((column) => `"${getColumnCasing(column, "snake_case")}"`)\n' +
  '        .join(", ")} FROM reverted3';

const NEW_INSERT =
  '  INSERT INTO  "${schema}"."${getTableName(table)}" (${Object.values(getTableColumns(table))\n' +
  '        .map((column) => `"${getColumnCasing(column, "snake_case")}"`)\n' +
  '        .join(", ")})\n' +
  "  SELECT ${Object.values(getTableColumns(table))\n" +
  '        .map((column) => `"${getColumnCasing(column, "snake_case")}"`)\n' +
  '        .join(", ")} FROM reverted3';

function main() {
  const path = resolve(process.argv[2] ?? DEFAULT_PATH);
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`error: cannot read ${path}: ${err.message}\n`);
    process.exit(1);
  }

  if (content.includes(NEW_INSERT)) {
    process.stdout.write(`already patched: ${path}\n`);
    process.exit(0);
  }

  if (!content.includes(OLD_INSERT)) {
    process.stderr.write(
      `error: target pattern not found in ${path}\n` +
        `Ponder version may differ from 0.16.3, or the file has already been\n` +
        `modified in an incompatible way. Inspect getRevertSql manually.\n`,
    );
    process.exit(1);
  }

  const patched = content.replace(OLD_INSERT, NEW_INSERT);
  writeFileSync(path, patched);
  process.stdout.write(`patched: ${path}\n`);
}

main();
