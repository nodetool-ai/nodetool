#!/usr/bin/env node
// Guards the ways a lockfile drifts out of sync with the manifests it resolves.
// Both root failures below broke the release build (run 30198644988): a
// Dependabot PR bumped electron/package.json and regenerated a *nested*
// electron/package-lock that npm never reads in a workspace install, so the root
// package-lock.json kept the old resolutions and every release job died in
// `npm ci` with EUSAGE.
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
//   3. The same resolver check for `mobile/`, which is deliberately not a root
//      workspace and carries its own real lockfile. It has the identical
//      cache-skip hole (quality-checks.yml keys mobile/node_modules on
//      `hashFiles('mobile/package-lock.json')`, so a PR that edits only
//      mobile/package.json hits the cache and never runs `npm ci`), plus a
//      failure mode the root does not have: an unresolvable peer tree. Run
//      30246386256 bumped `@react-native/jest-preset` to 0.86.1 against
//      react-native's `peerOptional @react-native/jest-preset@"0.85.3"` and
//      every job that installs mobile deps died on ERESOLVE. `npm ci --dry-run`
//      catches both in seconds, before the expensive legs run.

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

/**
 * Resolve `dir`'s lockfile against its manifests with the same resolver the
 * release build uses. Catches both a stale lock and a tree npm cannot resolve
 * at all (conflicting peer ranges).
 */
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function checkLockResolves(dir, { label, remedy }) {
  try {
    execFileSync(npmCommand, ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: join(repoRoot, dir),
      // Node 22 refuses to spawn a .cmd without a shell (EINVAL).
      shell: process.platform === "win32",
      stdio: ["ignore", "ignore", "pipe"],
      encoding: "utf8"
    });
    return true;
  } catch (error) {
    console.error(`${label}\n`);
    console.error(error.stderr?.trim() || error.message);
    console.error(`\n${remedy}`);
    return false;
  }
}

const dirs = await workspaceDirs();
// Every check runs — one failure must not hide another.
const results = [
  await checkNoNestedLockfiles(dirs),
  checkLockResolves(".", {
    label: "Root package-lock.json does not resolve against the workspace manifests.",
    remedy: "Run `npm install` at the repo root and commit the updated package-lock.json."
  }),
  checkLockResolves("mobile", {
    label: "mobile/package-lock.json does not resolve against mobile/package.json.",
    remedy:
      "If the lock is merely stale, run `npm install --prefix mobile` and commit it.\n" +
      "If npm reported ERESOLVE, a dependency was moved out of lockstep with the\n" +
      "Expo SDK — react-native and the @react-native/* and expo-* packages are\n" +
      "pinned together and only move during `npx expo install --fix`."
  })
];
if (results.includes(false)) process.exit(1);
console.log(
  `Lockfile check passed (${dirs.length} workspaces, root and mobile locks in sync).`
);
