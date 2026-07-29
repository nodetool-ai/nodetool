/**
 * Seed guard — the fail-closed gate between the seeder and the PR.
 *
 * Reads every `marketing/seo/out/<batch>/manifest.jsonl` (or one `--batch`) and
 * fails the job — so OPS-1's workflow opens NO PR — when either:
 *   1. Total manifest row count across all batches is 0. A run that rendered
 *      nothing has no content to review; a PR would be noise.
 *   2. Any single batch's summed `costUsd` exceeds the `--budget-usd` cap. The
 *      seeder pre-gates each render against the same cap, so this is the
 *      belt-and-suspenders check for provider-cost-vs-estimate drift.
 *
 * A clean run prints a per-batch summary and exits 0.
 *
 * Usage (from repo root or marketing/):
 *   node marketing/scripts/check-seed-manifest.mjs --budget-usd 10
 *   node marketing/scripts/check-seed-manifest.mjs --budget-usd 5 --batch movie-posters-20260705-42
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKETING_DIR = resolve(__dirname, "..");
// NODETOOL_SEED_OUT_DIR overrides the batch root (tests point it at a temp dir).
const OUT_DIR = process.env.NODETOOL_SEED_OUT_DIR
  ? resolve(process.env.NODETOOL_SEED_OUT_DIR)
  : join(MARKETING_DIR, "seo", "out");

const argv = process.argv.slice(2);

function argFlag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=").slice(1).join("=") : null;
}

const BATCH_FILTER = argFlag("batch");
// No cap given → treat as "unbounded": the row-count guard still applies.
const rawBudget = argFlag("budget-usd");
const BUDGET_USD = rawBudget == null ? Infinity : parseFloat(rawBudget);
if (Number.isNaN(BUDGET_USD)) {
  console.error(`❌ --budget-usd must be a number, got "${rawBudget}"`);
  process.exit(2);
}

function readManifest(file) {
  return readFileSync(file, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function listBatches() {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !BATCH_FILTER || name === BATCH_FILTER)
    .filter((name) => existsSync(join(OUT_DIR, name, "manifest.jsonl")));
}

function main() {
  const batches = listBatches();
  let totalRows = 0;
  const overCap = [];

  for (const batch of batches) {
    const rows = readManifest(join(OUT_DIR, batch, "manifest.jsonl"));
    const cost = rows.reduce((sum, r) => sum + (Number(r.costUsd) || 0), 0);
    totalRows += rows.length;
    const flag = cost > BUDGET_USD ? "  ⚠ OVER CAP" : "";
    console.error(
      `[guard] ${batch}: ${rows.length} row${rows.length === 1 ? "" : "s"}, $${cost.toFixed(3)} spent${flag}`
    );
    if (cost > BUDGET_USD) overCap.push({ batch, cost });
  }

  if (totalRows === 0) {
    console.error(
      `\n❌ guard failed: 0 manifest rows under ${OUT_DIR}` +
        (BATCH_FILTER ? ` matching "${BATCH_FILTER}"` : "") +
        " — nothing to review, no PR."
    );
    process.exit(1);
  }

  if (overCap.length > 0) {
    for (const { batch, cost } of overCap) {
      console.error(
        `\n❌ guard failed: batch "${batch}" spent $${cost.toFixed(
          3
        )} > cap $${BUDGET_USD.toFixed(2)}.`
      );
    }
    process.exit(1);
  }

  const cap = BUDGET_USD === Infinity ? "∞" : `$${BUDGET_USD.toFixed(2)}`;
  console.error(
    `\n✅ guard passed: ${totalRows} row${totalRows === 1 ? "" : "s"} across ${
      batches.length
    } batch${batches.length === 1 ? "" : "es"}, each within cap ${cap}.`
  );
}

main();
