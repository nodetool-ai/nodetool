#!/usr/bin/env node
// Guards the two ways the root lockfile drifts out of sync with the workspace
// manifests. Both broke the release build (run 30198644988): a Dependabot PR
// bumped electron/package.json and regenerated a *nested* electron/package-lock
// that npm never reads in a workspace install, so the root package-lock.json
// kept the old resolutions and every release job died in `npm ci` with EUSAGE.
//
// PR CI missed it because setup-build caches node_modules on the root lockfile
// hash: a PR that touches no root lockfile hits the cache and skips `npm ci`
// entirely. This check runs regardless of that cache.
//
//   1. No package-lock.json inside a root workspace. npm resolves workspace
//      dependencies through the root lock; a nested one is dead weight that
//      makes tooling (Dependabot, humans) update the wrong file.
//   2. The root lock satisfies every workspace manifest, verified with the same
//      resolver the release build uses: `npm ci --dry-run`.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Expand the root `workspaces` globs to concrete directories. */
async function workspaceDirs() {
  const { workspaces } = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const dirs = new Set();
  for (const pattern of workspaces) {
    for await (const match of glob(join(pattern, "package.json"), { cwd: repoRoot })) {
      dirs.add(dirname(match));
    }
  }
  return [...dirs].sort();
}

async function checkNoNestedLockfiles(dirs) {
  const nested = [];
  for (const dir of dirs) {
    const lock = join(repoRoot, dir, "package-lock.json");
    try {
      await readFile(lock);
      nested.push(relative(repoRoot, lock));
    } catch {
      // No nested lockfile — the expected case.
    }
  }
  if (nested.length === 0) return true;

  console.error("Nested lockfile(s) inside root npm workspaces:\n");
  for (const file of nested) console.error(`  ${file}`);
  console.error(
    "\nWorkspaces resolve through the root package-lock.json; npm ignores these.",
    "\nDelete them and run `npm install` at the repo root instead."
  );
  return false;
}

function checkRootLockInSync() {
  try {
    execFileSync("npm", ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8"
    });
    return true;
  } catch (error) {
    console.error("Root package-lock.json is out of sync with the workspace manifests.\n");
    console.error(error.stderr?.trim() || error.message);
    console.error("\nRun `npm install` at the repo root and commit the updated package-lock.json.");
    return false;
  }
}

const dirs = await workspaceDirs();
const ok = (await checkNoNestedLockfiles(dirs)) && checkRootLockInSync();
if (!ok) process.exit(1);
console.log(`Lockfile check passed (${dirs.length} workspaces, root lock in sync).`);
