#!/usr/bin/env node
// Ring 0 (PR gate) reliability leg: the fast hermetic journeys on the kernel
// surface with strict lifecycle mode. The malformed-protocol corpus (journey
// 14) runs as `reliability/harness/tests/journeys/ws-malformed-transport.test.ts`
// and the websocket package tests, not here, because it needs the ws-server.
//
// Each journey runs on the kernel surface only (`--surface kernel`), which is
// always the oracle and always strict (reliability/harness/src/drivers/
// kernel.ts passes `strict: true` unconditionally) — no cross-surface diff at
// this ring, just the fast hermetic invariant/lifecycle checks. A journey
// whose fault matrix names the kernel (slow-consumer-drain) runs with that
// fault applied. Requires `npm run build:packages` to have run first (built
// `dist/` for the CLI and the journeys' node registry).
//
// Local: `npm run reliability:ring0`
const RING0_JOURNEYS = [
  "linear-text-pipeline",
  "fan-out-fan-in-dag",
  "fan-in-shared-list-handle",
  "error-in-one-branch",
  "mid-run-cancel-node",
  "mid-run-cancel-streaming",
  "streaming-input-complete",
  "workflow-loop",
  "slow-consumer-drain"
];

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
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
