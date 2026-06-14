#!/usr/bin/env node
// Aggregate Stryker mutation scores from each package's
// reports/mutation/mutation.json and emit a Markdown summary.
//
// Usage: node scripts/mutation-score.mjs [pkg1 pkg2 ...]
// With no args, scans every packages/* that has a stryker.config.json.
// Prints a Markdown table to stdout. Exits 0 always (reporting only).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(root, "packages");

// A killed or timed-out mutant counts as detected. Survived and no-coverage
// mutants count against the score. Ignored/compile-error mutants are excluded
// from the denominator, matching Stryker's own mutationScore.
const DETECTED = new Set(["Killed", "Timeout"]);
const UNDETECTED = new Set(["Survived", "NoCoverage"]);

function scoreFor(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  let detected = 0;
  let undetected = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      if (DETECTED.has(mutant.status)) detected += 1;
      else if (UNDETECTED.has(mutant.status)) undetected += 1;
    }
  }
  const total = detected + undetected;
  const score = total === 0 ? null : (detected / total) * 100;
  return { detected, undetected, total, score };
}

const requested = process.argv.slice(2);
const pkgs =
  requested.length > 0
    ? requested
    : readdirSync(packagesDir).filter((name) =>
        existsSync(join(packagesDir, name, "stryker.config.json"))
      );

const rows = [];
let totalDetected = 0;
let totalUndetected = 0;

for (const pkg of pkgs) {
  const reportPath = join(
    packagesDir,
    pkg,
    "reports",
    "mutation",
    "mutation.json"
  );
  if (!existsSync(reportPath)) {
    rows.push({ pkg, score: null, detected: 0, total: 0, missing: true });
    continue;
  }
  const { detected, undetected, total, score } = scoreFor(reportPath);
  totalDetected += detected;
  totalUndetected += undetected;
  rows.push({ pkg, score, detected, total, missing: false });
}

const fmt = (score) => (score === null ? "—" : `${score.toFixed(2)}%`);

const lines = [];
lines.push("| Package | Mutation Score | Detected / Total |");
lines.push("| --- | --- | --- |");
for (const row of rows) {
  if (row.missing) {
    lines.push(`| \`${row.pkg}\` | ⚠️ no report | — |`);
  } else {
    lines.push(
      `| \`${row.pkg}\` | ${fmt(row.score)} | ${row.detected} / ${row.total} |`
    );
  }
}
const overallTotal = totalDetected + totalUndetected;
const overall = overallTotal === 0 ? null : (totalDetected / overallTotal) * 100;
lines.push(
  `| **Overall** | **${fmt(overall)}** | **${totalDetected} / ${overallTotal}** |`
);

process.stdout.write(lines.join("\n") + "\n");
