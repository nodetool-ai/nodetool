#!/usr/bin/env node
/** Verify the complete staged cohort before promoting its CLI last. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runReleaseCommand } from "./pin-catalog.mjs";
import { releaseInputs, verifyStaging } from "./verify-staging.mjs";

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
  run = runReleaseCommand,
  dryRun = false
} = {}) {
  const expectedTag = releaseTag(catalog.coreVersion);
  if (tag !== expectedTag) { throw new Error(`Release ${catalog.coreVersion} must promote ${expectedTag}, not ${tag}`); }
  const order = promotionOrder(artifacts);
  await verify();
  if (dryRun) { return order.map(pkg => pkg.name); }
  for (const pkg of order) {
    await run("npm", ["dist-tag", "add", `${pkg.name}@${pkg.version}`, tag], {});
  }
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
  const order = await promoteStaging(catalog, artifacts, options);
  console.log(`${values["dry-run"] ? "Verified promotion plan for" : "Promoted"} ${order.length} packages, CLI last`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
