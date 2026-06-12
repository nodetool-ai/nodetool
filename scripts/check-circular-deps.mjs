#!/usr/bin/env node
/**
 * Detects circular dependencies among @nodetool-ai/* workspace packages.
 *
 * Circular imports inside esbuild bundles cause `export const` values to be
 * wrapped in __esm lazy initializers. If module A's top-level code runs before
 * the cycle resolves, module B's constants are still `undefined` — the exact
 * failure mode that caused "BROWSER_ACTION_SPECS is not iterable" in production.
 *
 * Usage:
 *   node scripts/check-circular-deps.mjs          # check all packages
 *   node scripts/check-circular-deps.mjs packages/code-nodes  # single package
 */

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const madge = (await import("madge")).default;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

// Workspace packages whose source trees are checked for circular deps.
// These are the packages that ship in the production bundle.
const PACKAGES_DIR = resolve(repoRoot, "packages");

import { readdir } from "node:fs/promises";

async function getPackageDirs(base) {
  const entries = await readdir(base, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => resolve(base, e.name, "src"));
}

const targetDirs =
  process.argv.length > 2
    ? process.argv.slice(2).map((p) => resolve(repoRoot, p, "src"))
    : await getPackageDirs(PACKAGES_DIR);

let found = 0;

for (const dir of targetDirs) {
  let result;
  try {
    result = await madge(dir, {
      fileExtensions: ["ts", "tsx"],
      tsConfig: resolve(repoRoot, "tsconfig.json"),
    });
  } catch {
    // Directory doesn't exist or madge can't parse it — skip silently.
    continue;
  }

  const cycles = result.circular();
  if (cycles.length === 0) continue;

  const pkg = dir.replace(repoRoot + "/", "").replace("/src", "");
  console.error(`\n❌  Circular dependencies detected in ${pkg}:`);
  for (const cycle of cycles) {
    console.error(`   ${cycle.join(" → ")} → ${cycle[0]}`);
  }
  found += cycles.length;
}

if (found > 0) {
  console.error(
    `\n${found} circular dependency chain(s) found across workspace packages.` +
      "\nCircular imports can cause module-level constants to be undefined in" +
      "\nesbuild bundles (via __esm lazy init), crashing the server at startup." +
      "\nFix by breaking the cycle — typically by moving the shared value to a" +
      "\nleaf module, or by using a factory/lazy registration pattern."
  );
  process.exit(1);
}

console.log("✅  No circular dependencies found.");
