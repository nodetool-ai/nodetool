#!/usr/bin/env node
/**
 * Ring 2 packed-backend journey (docs/RELIABILITY_ARCHITECTURE.md §5 item 15,
 * §11; docs/RELIABILITY_TASKS.md F2): runs the linear-text-pipeline journey
 * (journey 1 — "the baseline; if this diverges across surfaces, everything is
 * suspect") against the real per-OS PACKED backend — electron-builder's
 * `afterPack` output, the same tree release.yaml's existing smoke-boot step
 * boots — via the reliability harness's `PackagedDriver`, diffed against the
 * kernel oracle. Catches packaging-only regressions (native module ABI skew,
 * flattened `_modules/` resolution) a plain health-check smoke test can't:
 * this actually runs a workflow through the packed artifact's real WS
 * protocol, not just `/health`.
 *
 * Usage: node scripts/reliability-packed-journey.mjs <packedBackendDir>
 *        Same argument convention as scripts/smoke-backend-bundle.mjs.
 *        Requires `npm run build:packages` first (for the CLI/harness dist
 *        AND @nodetool-ai/reliability-harness's own dist).
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const bundleDir = process.argv[2] ? resolve(process.argv[2]) : null;
if (!bundleDir || !existsSync(bundleDir)) {
  console.error("Usage: node scripts/reliability-packed-journey.mjs <packedBackendDir>");
  process.exit(1);
}

const JOURNEY_NAME = "linear-text-pipeline";
const journeyDir = resolve(repoRoot, "reliability", "journeys", JOURNEY_NAME);

const { compareJourney, formatCompareReport, loadJourney, KernelDriver, PackagedDriver } =
  await import("@nodetool-ai/reliability-harness");

const journey = await loadJourney(journeyDir);
const drivers = [new KernelDriver(), new PackagedDriver({ bundleDir })];

console.log(`Running journey "${JOURNEY_NAME}" against the packed backend at ${bundleDir}`);
const report = await compareJourney(journey, drivers);
console.log(formatCompareReport(report, { showDiff: true }));

process.exit(report.verdict.ok ? 0 : 1);
