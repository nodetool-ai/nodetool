#!/usr/bin/env node
// Rot detector for the shipped example workflows (packages/*/examples/**/*.json):
// nodes get renamed, properties change, models get deprecated, and a shipped
// example that references a now-unknown node type or a missing required
// property is broken for every new install. `nodetool validate` catches this
// statically — unknown node types, missing required properties, unselected
// models, dangling/mis-typed edges — without running the workflow.
//
// This is the CI guardrail (Phase 0 of docs/plans/examples-revamp.md): every
// example must validate with --warnings-as-errors, so a warning-level drift
// (an unselected model, say) fails the gate too, not just hard errors. It
// runs against the built CLI (packages/cli/dist), since validate loads the
// node registry from the decorator packages' dist output.
//
// The weekly scheduled workflow (workflow-example-validation.yaml) covers the
// self-healing side — it re-validates on the same drift and opens a repair PR
// via Claude. This script is the fast, blocking PR/push gate that catches
// drift before it merges at all.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cliEntry = join(repoRoot, "packages/cli/dist/nodetool.js");

// Walk packages/**/examples/**/*.json — mirrors the `find packages -path
// '*examples*' -name '*.json'` used by workflow-example-validation.yaml.
function findExamples(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findExamples(full));
    } else if (entry.endsWith(".json") && full.includes("/examples/")) {
      results.push(full);
    }
  }
  return results;
}

const examples = findExamples(join(repoRoot, "packages")).sort();

if (examples.length === 0) {
  console.error("No example JSON files found under packages/**/examples/ — check the search path.");
  process.exit(1);
}

console.log(`Validating ${examples.length} example workflow(s)...\n`);

let failures = 0;
for (const file of examples) {
  const rel = file.slice(repoRoot.length + 1);
  try {
    execFileSync(
      "node",
      [cliEntry, "validate", file, "--warnings-as-errors"],
      { stdio: "pipe", encoding: "utf8" }
    );
    console.log(`  ok    ${rel}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  ${rel}`);
    const output = [err.stdout, err.stderr].filter(Boolean).join("\n");
    console.log(
      output
        .split("\n")
        .map((line) => `        ${line}`)
        .join("\n")
    );
  }
}

console.log(`\n${examples.length - failures}/${examples.length} examples validate cleanly.`);

if (failures > 0) {
  console.error(
    `\n${failures} example(s) failed validation. Fix the graph to match the current node registry, or run:\n` +
      `  npm run dev:nodetool -- validate "<path>" --json\n` +
      `to see the full report for a single file.`
  );
  process.exit(1);
}
