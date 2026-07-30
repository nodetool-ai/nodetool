#!/usr/bin/env node
// Ring 0 (PR gate) reliability leg — docs/RELIABILITY_TASKS.md Track F, task
// F2; docs/RELIABILITY_ARCHITECTURE.md §11: "the five fastest journeys (1, 3,
// 6, 13, 14) on the kernel surface with strict lifecycle mode." Journey 14
// (malformed-protocol) has no `reliability/journeys/` directory yet — that
// coverage lives as websocket package tests (the journey 14 corpus) — so this
// runs the five journeys that do exist as harness journeys: linear-text-pipeline
// (1), fan-out-fan-in-dag (3), error-in-one-branch (13), mid-run-cancel-node
// and mid-run-cancel-streaming (6a/6b).
//
// Each journey runs on the kernel surface only (`--surface kernel`), which is
// always the oracle and always strict (reliability/harness/src/drivers/
// kernel.ts passes `strict: true` unconditionally) — no cross-surface diff at
// this ring, just the fast hermetic invariant/lifecycle checks. Requires
// `npm run build:packages` to have run first (built `dist/` for the CLI and
// the journeys' node registry).
//
// Local: `npm run reliability:ring0`
const RING0_JOURNEYS = [
  "linear-text-pipeline",
  "fan-out-fan-in-dag",
  "error-in-one-branch",
  "mid-run-cancel-node",
  "mid-run-cancel-streaming"
];

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

let failures = 0;
for (const journey of RING0_JOURNEYS) {
  console.log(`\n=== reliability run ${journey} (kernel, strict) ===`);
  const result = spawnSync(
    "npm",
    ["run", "nodetool", "--", "reliability", "run", journey, "--surface", "kernel"],
    { cwd: repoRoot, stdio: "inherit" }
  );
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL: ${journey} (exit ${result.status})`);
    continue;
  }
  console.log(`ok: ${journey}`);
}

if (failures > 0) {
  console.error(`\n${failures}/${RING0_JOURNEYS.length} Ring 0 reliability journey(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${RING0_JOURNEYS.length} Ring 0 reliability journeys passed.`);
