#!/usr/bin/env node
// Ring 1 (merge-to-main) reliability leg — docs/RELIABILITY_TASKS.md Track F,
// task F2; docs/RELIABILITY_ARCHITECTURE.md §11: "Full journey suite on all
// hermetic surfaces... plus the packaged-backend journey ring... before the
// Docker image is considered deployable."
//
// Runs every `reliability/journeys/` journey's cross-surface differential
// compare (kernel oracle vs. ws-server, `--diff` so a divergence prints its
// full per-channel stream diff in the job log) — except `python-node-workflow`
// and `host-disk-full-write` (task D3), which get their own per-fault,
// per-declared-surface loop below instead of the bare blind invocation (see
// the doc comment above `JOURNEYS_WITH_OWN_RING_HANDLING`) — then runs one
// journey (linear-text-pipeline, the baseline — same pick §5 item 15 makes
// for the packaged ring) against the packaged backend bundle staged the same
// way `npm run backend:smoke` does.
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
import { readdirSync, existsSync, readFileSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const journeysDir = join(repoRoot, "reliability", "journeys");

const withPackaged = process.argv.includes("--packaged");
const PACKAGED_JOURNEY = "linear-text-pipeline";

// Task D3: `python-node-workflow` (journey 7) and `host-disk-full-write` both
// declare a non-empty `faults` matrix whose entries DON'T overwrite each
// other the way D1's provider faults do (`registerProvider` is last-write-
// wins for the same provider id; these set distinct env vars / a distinct
// storage-override slot, so a bare invocation below would apply every
// declared fault SIMULTANEOUSLY, not one at a time — `resolveFaultSelection`
// in `cli.ts` falls back to the journey's full `faults` array whenever
// `--faults` is omitted, and there is no CLI-level way to request "none").
// `host-disk-full-write` also declares `"surfaces": ["kernel"]` only (the
// ws-server driver has no seam for this fault — see
// `faults/host-faults.ts`'s doc comment) — forcing `--surface ws-server` onto
// it the way the main loop below does for every other journey would run the
// disk-full fault on kernel (where it's wired) but not on ws-server (real
// storage, unaffected), a guaranteed cross-surface divergence. Both journeys
// are therefore excluded from the main blind loop and given their own
// per-fault, per-declared-surface block afterward. Their happy paths are
// covered by the harness's own `python-node-workflow.test.ts` /
// `host-disk-full-write.test.ts` (part of `npm run test`), which call the
// drivers directly and so don't hit this CLI limitation.
// `ws-transport-faults` is excluded for the same stacking reason, with a
// twist: its five ws faults share ONE process-wide proxy slot
// (`faults/ws-proxy.ts`), so a bare invocation doesn't merely apply them
// together, it applies only the last — `ws-abrupt-close`, which destroys the
// socket on the first client->server frame. The client then never sees a
// terminal and the driver's 4000ms wait expires. That timeout is the
// journey's DESIGNED outcome under a black-hole fault, not a slow path (an
// unfaulted run finishes in ~8ms), so the bare run reported a failure for
// behaving correctly. It also declares `"surfaces": ["ws-server"]` only, and
// unlike the two above it can't be rescued by a per-fault block here: `cli.ts`
// always injects the kernel oracle, and a kernel that completes necessarily
// diverges from a black-holed client. Its per-fault coverage — including
// post-fault server health — is
// `reliability/harness/tests/journeys/ws-transport-faults.test.ts`, which runs
// in the Quality Gate's `test-packages` leg.
const JOURNEYS_WITH_OWN_RING_HANDLING = new Set([
  "python-node-workflow",
  "host-disk-full-write",
  "ws-transport-faults"
]);

function runNodetool(args) {
  return spawnSync("npm", ["run", "nodetool", "--", ...args], {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

function readJourneyFaults(journey) {
  const manifest = JSON.parse(
    readFileSync(join(journeysDir, journey, "journey.json"), "utf8")
  );
  return manifest.faults.map((f) => f.type);
}

const journeys = readdirSync(journeysDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(journeysDir, e.name, "journey.json")))
  .map((e) => e.name)
  .sort();

let failures = 0;
let ringRuns = 0;

for (const journey of journeys) {
  if (JOURNEYS_WITH_OWN_RING_HANDLING.has(journey)) continue;
  ringRuns += 1;
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

// Task D3: journey 7's bridge fault matrix, one CLI invocation per fault
// (never bare — see this file's doc comment above).
for (const faultName of readJourneyFaults("python-node-workflow")) {
  ringRuns += 1;
  console.log(`\n=== reliability run python-node-workflow --faults ${faultName} (kernel, ws-server) ===`);
  const result = runNodetool([
    "reliability",
    "run",
    "python-node-workflow",
    "--faults",
    faultName,
    "--surface",
    "kernel",
    "--surface",
    "ws-server",
    "--diff"
  ]);
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL: python-node-workflow --faults ${faultName} (exit ${result.status})`);
  } else {
    console.log(`ok: python-node-workflow --faults ${faultName}`);
  }
}

// Task D3: host-disk-full-write is kernel-only (see doc comment above).
for (const faultName of readJourneyFaults("host-disk-full-write")) {
  ringRuns += 1;
  console.log(`\n=== reliability run host-disk-full-write --faults ${faultName} (kernel) ===`);
  const result = runNodetool([
    "reliability",
    "run",
    "host-disk-full-write",
    "--faults",
    faultName,
    "--surface",
    "kernel",
    "--diff"
  ]);
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAIL: host-disk-full-write --faults ${faultName} (exit ${result.status})`);
  } else {
    console.log(`ok: host-disk-full-write --faults ${faultName}`);
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

const total = ringRuns + (withPackaged ? 1 : 0);
if (failures > 0) {
  console.error(`\n${failures}/${total} Ring 1 reliability run(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} Ring 1 reliability run(s) passed.`);
