#!/usr/bin/env node
// Ring 1 (merge-to-main) reliability leg — docs/RELIABILITY_TASKS.md Track F,
// task F2; docs/RELIABILITY_ARCHITECTURE.md §11: "Full journey suite on all
// hermetic surfaces... plus the packaged-backend journey ring... before the
// Docker image is considered deployable."
//
// Runs every `reliability/journeys/` journey's cross-surface differential
// compare (kernel oracle vs. ws-server, `--diff` so a divergence prints its
// full per-channel stream diff in the job log), then runs one journey
// (linear-text-pipeline, the baseline — same pick §5 item 15 makes for the
// packaged ring) against the packaged backend bundle staged the same way
// `npm run backend:smoke` does.
//
// Requires `npm run build:packages` first. `--packaged` additionally stages
// the backend bundle (`npm run prepare-backend --workspace=electron`,
// minutes) before running the packaged-surface journey — pass it only when
// that's wanted (Ring 1 CI does; a quick local kernel+ws-server check
// doesn't need to).
//
// Local: `npm run reliability:ring1` (kernel+ws-server only) or
// `npm run reliability:ring1 -- --packaged` (adds the packaged journey).
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const journeysDir = join(repoRoot, "reliability", "journeys");

const withPackaged = process.argv.includes("--packaged");
const PACKAGED_JOURNEY = "linear-text-pipeline";

function runNodetool(args) {
  return spawnSync("npm", ["run", "nodetool", "--", ...args], {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

const journeys = readdirSync(journeysDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(journeysDir, e.name, "journey.json")))
  .map((e) => e.name)
  .sort();

let failures = 0;

for (const journey of journeys) {
  console.log(`\n=== reliability run ${journey} (kernel, ws-server, --diff) ===`);
  const result = runNodetool([
    "reliability",
    "run",
    journey,
    "--surface",
    "kernel",
    "--surface",
    "ws-server",
    "--diff"
  ]);
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL: ${journey} (exit ${result.status})`);
  } else {
    console.log(`ok: ${journey}`);
  }
}

if (withPackaged) {
  console.log(`\n=== staging packaged backend bundle (npm run prepare-backend --workspace=electron) ===`);
  const stage = spawnSync("npm", ["run", "prepare-backend", "--workspace=electron"], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (stage.status !== 0) {
    failures += 1;
    console.error(`FAIL: staging the packaged backend bundle (exit ${stage.status})`);
  } else {
    console.log(`\n=== reliability run ${PACKAGED_JOURNEY} (packaged, journey 15 pattern) ===`);
    const result = runNodetool([
      "reliability",
      "run",
      PACKAGED_JOURNEY,
      "--surface",
      "packaged",
      "--diff"
    ]);
    if (result.status !== 0) {
      failures += 1;
      console.error(`FAIL: ${PACKAGED_JOURNEY} on packaged surface (exit ${result.status})`);
    } else {
      console.log(`ok: ${PACKAGED_JOURNEY} (packaged)`);
    }
  }
}

const total = journeys.length + (withPackaged ? 1 : 0);
if (failures > 0) {
  console.error(`\n${failures}/${total} Ring 1 reliability run(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} Ring 1 reliability run(s) passed.`);
