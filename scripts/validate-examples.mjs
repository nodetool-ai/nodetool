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
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
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

// `*.app.json` files are ApplicationBundles: an app document plus the full
// graphs of the workflows it binds. They used to be skipped here, on the
// grounds that `scripts/build-example-apps.mjs` validated them by running
// `nodetool app debug --no-run`. It does not: `app debug` checks widget
// bindings and never consults the node registry, and no CI workflow runs
// build-example-apps at all. The result was that the bundles users actually
// install had no gate on node types, properties, edges, or providers — and
// five of them shipped `provider: "huggingface_fal_ai"`, which the runtime
// cannot construct. Validate each embedded graph with the same validator the
// plain examples get.
function expandBundle(file) {
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    return { parseError: err.message, workflows: [] };
  }
  const workflows = Array.isArray(bundle?.workflows) ? bundle.workflows : [];
  return {
    parseError: workflows.length === 0 ? "bundle declares no workflows" : null,
    workflows: workflows.map((wf, i) => ({
      label: wf?.name || wf?.key || `workflow[${i}]`,
      graph: wf?.graph
    }))
  };
}

const examples = findExamples(join(repoRoot, "packages")).sort();
const bundles = examples.filter((f) => f.endsWith(".app.json"));
const workflowExamples = examples.filter((f) => !f.endsWith(".app.json"));

if (workflowExamples.length === 0) {
  console.error("No example JSON files found under packages/**/examples/ — check the search path.");
  process.exit(1);
}

if (bundles.length === 0) {
  console.error("No *.app.json bundles found under packages/**/examples/ — check the search path.");
  process.exit(1);
}

function indent(text) {
  return text
    .split("\n")
    .map((line) => `        ${line}`)
    .join("\n");
}

// Validate one graph file with the built CLI. Returns null on success, or the
// validator's output on failure.
function validateFile(path) {
  try {
    execFileSync("node", [cliEntry, "validate", path, "--warnings-as-errors"], {
      stdio: "pipe",
      encoding: "utf8"
    });
    return null;
  } catch (err) {
    return [err.stdout, err.stderr].filter(Boolean).join("\n");
  }
}

console.log(
  `Validating ${workflowExamples.length} example workflow(s) and ` +
    `${bundles.length} app bundle(s)...\n`
);

let failures = 0;
let checked = 0;

for (const file of workflowExamples) {
  const rel = file.slice(repoRoot.length + 1);
  checked += 1;
  const output = validateFile(file);
  if (output === null) {
    console.log(`  ok    ${rel}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${rel}`);
    console.log(indent(output));
  }
}

// Each bundle's embedded workflows are written to a scratch file and run
// through the same validator, so a bundle graph is held to exactly the standard
// a standalone example graph is.
const scratch = mkdtempSync(join(tmpdir(), "validate-app-bundles-"));
for (const file of bundles) {
  const rel = file.slice(repoRoot.length + 1);
  const { parseError, workflows } = expandBundle(file);
  if (parseError) {
    checked += 1;
    failures += 1;
    console.log(`  FAIL  ${rel}`);
    console.log(indent(parseError));
    continue;
  }
  for (const [i, wf] of workflows.entries()) {
    checked += 1;
    const label = `${rel} › ${wf.label}`;
    if (!wf.graph) {
      failures += 1;
      console.log(`  FAIL  ${label}`);
      console.log(indent("bundled workflow has no graph"));
      continue;
    }
    const scratchFile = join(scratch, `${i}.json`);
    writeFileSync(scratchFile, JSON.stringify({ name: wf.label, graph: wf.graph }));
    const output = validateFile(scratchFile);
    if (output === null) {
      console.log(`  ok    ${label}`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${label}`);
      console.log(indent(output.replaceAll(scratchFile, label)));
    }
  }
}
rmSync(scratch, { recursive: true, force: true });

console.log(`\n${checked - failures}/${checked} graphs validate cleanly.`);

if (failures > 0) {
  console.error(
    `\n${failures} graph(s) failed validation. Fix the graph to match the current node registry, or run:\n` +
      `  npm run dev:nodetool -- validate "<path>" --json\n` +
      `to see the full report for a single file.\n` +
      `For a bundled app graph, the path is the *.app.json file; the failing\n` +
      `workflow is named after the › in the line above.`
  );
  process.exit(1);
}
