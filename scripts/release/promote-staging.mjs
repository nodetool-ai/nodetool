#!/usr/bin/env node
/** Verify the complete staged cohort before promoting its CLI last. */
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createLimiter, runReleaseCommandAsync, timed } from "./commands.mjs";
import { RegistryNotReadyError } from "./registry.mjs";
import { releaseInputs, verifyStaging } from "./verify-staging.mjs";

/** Concurrent `npm dist-tag add` calls before the CLI, which always goes last. */
const PROMOTION_CONCURRENCY = 8;
/** Full verification passes over the staged cohort, each with its own readiness deadline. */
export const VERIFICATION_PASSES = 3;
/** Pause between passes after the registry did not serve a published version in time. */
export const VERIFICATION_RETRY_DELAY_MS = 300_000;

/**
 * Verify the staged cohort, starting a new pass when the registry has not
 * served a published version yet. Integrity, provenance, authorization and
 * smoke failures stop at once. The artifacts are already published, so a
 * later pass reads the same immutable versions and never republishes.
 */
export async function verifyWithRecovery(verify, {
  passes = VERIFICATION_PASSES, retryDelayMs = VERIFICATION_RETRY_DELAY_MS, sleep = setTimeout, log = console.warn
} = {}) {
  for (let pass = 1; ; pass++) {
    try { return await verify(); }
    catch (error) {
      if (!(error instanceof RegistryNotReadyError) || pass >= passes) { throw error; }
      log(`Registry not ready on verification pass ${pass} of ${passes} (${error.message}). Retrying the staged artifacts in ${Math.round(retryDelayMs / 1000)}s.`);
      await sleep(retryDelayMs);
    }
  }
}

export function releaseTag(version) {
  const parsed = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!parsed) { throw new Error(`Invalid release version: ${version}`); }
  if (!parsed[4]) { return "latest"; }
  const prefix = /^[0-9A-Za-z]+/.exec(parsed[4]);
  if (!prefix) { throw new Error(`Prerelease has no valid npm tag prefix: ${version}`); }
  return prefix[0];
}

export function promotionOrder(artifacts) {
  if (!artifacts.some(pkg => pkg.name === "@nodetool-ai/cli")) { throw new Error("Promotion requires the CLI release artifact"); }
  return [...artifacts].sort((a, b) => {
    if (a.name === "@nodetool-ai/cli") { return 1; }
    if (b.name === "@nodetool-ai/cli") { return -1; }
    return a.name.localeCompare(b.name);
  });
}

export async function promoteStaging(catalog, artifacts, {
  tag = releaseTag(catalog.coreVersion),
  verify = () => verifyStaging(catalog, artifacts),
  run = runReleaseCommandAsync,
  dryRun = false,
  recovery = {}
} = {}) {
  const expectedTag = releaseTag(catalog.coreVersion);
  if (tag !== expectedTag) { throw new Error(`Release ${catalog.coreVersion} must promote ${expectedTag}, not ${tag}`); }
  const order = promotionOrder(artifacts);
  await verifyWithRecovery(verify, recovery);
  if (dryRun) { return order.map(pkg => pkg.name); }
  const promote = pkg => run("npm", ["dist-tag", "add", `${pkg.name}@${pkg.version}`, tag], {});
  const cli = order.at(-1);
  const limit = createLimiter(PROMOTION_CONCURRENCY);
  await timed(`promote ${order.length - 1} packages`, () => Promise.all(order.slice(0, -1).map(pkg => limit(() => promote(pkg)))));
  await promote(cli);
  return order.map(pkg => pkg.name);
}

async function main() {
  const { values } = parseArgs({ options: {
    "tarballs-dir": { type: "string" }, catalog: { type: "string", default: "packages/node-catalog/data/index.json" }, tag: { type: "string" }, "dry-run": { type: "boolean", default: false }
  } });
  if (!values["tarballs-dir"]) { throw new Error("--tarballs-dir is required"); }
  const { catalog, artifacts } = releaseInputs(resolve(values["tarballs-dir"]), resolve(values.catalog));
  const options = { dryRun: values["dry-run"] };
  if (values.tag) { options.tag = values.tag; }
  const order = await timed("verify staging and promote", () => promoteStaging(catalog, artifacts, options));
  console.log(`${values["dry-run"] ? "Verified promotion plan for" : "Promoted"} ${order.length} packages, CLI last`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
