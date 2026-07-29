#!/usr/bin/env node
// Smoke tier for shipped examples (docs/plans/examples-revamp.md, Phase 0):
// runs `nodetool debug` (headless server surface, no browser/trace) on a
// curated list of keyless/local examples — ones that need no paid API key —
// so their kernel run is exercised end to end, not just statically validated.
//
// Deliberately NOT wired into the default PR/push CI gate: it executes a
// workflow rather than just reading its JSON, so it costs real runtime (and,
// for any non-local example, real API spend). Run it manually via
// `npm run examples:smoke` or the "Example Smoke Debug" GitHub Action
// (workflow_dispatch only).
//
// CURATED_EXAMPLES is short by design. As of 2026-07-17 the shipped examples
// have exactly zero local-model (Ollama/MLX/llama.cpp) templates — see the
// plan's Analysis section — so "keyless" here means "no node in the graph
// needs a provider API key", which today is nearly nothing. Extend this list
// as Phase 3 lands local/keyless examples ("Private Assistant (local)" and
// friends); each entry should be one of those, not a paid-model template.
const CURATED_EXAMPLES = ["Conditional Logic Engine"];

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const examplesDir = join(
  repoRoot,
  "packages/base-nodes/nodetool/examples/nodetool-base"
);

let failures = 0;
for (const name of CURATED_EXAMPLES) {
  const file = join(examplesDir, `${name}.json`);
  console.log(`\n=== ${name} ===`);
  // Server surface only (the debug command's default) — no --browser/--trace,
  // this is a cheap kernel run. Exit code already reflects verdict.ok.
  const result = spawnSync(
    "npm",
    ["run", "dev:nodetool", "--", "debug", file],
    { cwd: repoRoot, stdio: "inherit" }
  );
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL: ${name} (exit ${result.status})`);
    continue;
  }
  console.log(`ok: ${name}`);
}

if (failures > 0) {
  console.error(`\n${failures}/${CURATED_EXAMPLES.length} smoke example(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CURATED_EXAMPLES.length} smoke example(s) ran cleanly.`);
