#!/usr/bin/env node
/**
 * Finish `npm run build:packages:tsc` after `tsc --build tsconfig.build.json`.
 *
 * A package build is `node ../../scripts/build-typescript-workspace.mjs`,
 * sometimes followed by `&& <post-tsc steps>`: copying manifests and generated
 * JSON into dist/, generating the protocol schema, or bundling browser pages.
 * The root `tsc --build` replaces only the first command, so this script runs
 * each package's remaining steps from its own `build` script. Reading them from
 * package.json keeps one list of post-tsc steps for both build paths.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC_STEP = "node ../../scripts/build-typescript-workspace.mjs";

const rootManifest = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));

let inspected = 0;
let ran = 0;
for (const workspace of rootManifest.workspaces) {
  if (!workspace.startsWith("packages/")) {
    continue;
  }
  const dir = resolve(repoRoot, workspace);
  const manifest = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  const build = manifest.scripts?.build ?? "";
  if (!build.startsWith(TSC_STEP)) {
    continue;
  }
  inspected++;
  const rest = build.slice(TSC_STEP.length).trim();
  if (rest === "") {
    continue;
  }
  if (!rest.startsWith("&&")) {
    throw new Error(`copy-manifests: unexpected build script in ${workspace}: ${build}`);
  }
  const command = rest.slice(2).trim();
  console.log(`copy-manifests: ${workspace}: ${command}`);
  const result = spawnSync(command, { cwd: dir, shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`copy-manifests: post-tsc step failed in ${workspace}`);
    process.exit(result.status ?? 1);
  }
  ran++;
}

if (inspected === 0) {
  throw new Error("copy-manifests: found no package build scripts to inspect");
}
console.log(`copy-manifests: ran post-tsc steps for ${ran}/${inspected} package(s)`);
