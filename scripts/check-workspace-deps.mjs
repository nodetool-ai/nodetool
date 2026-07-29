#!/usr/bin/env node
// Guards against the failure that broke the deploy health check: a package that
// ships to production imports a `@nodetool-ai/*` workspace package it never
// declares in its own `dependencies`. Workspace hoisting hides this locally
// (the package is present in the root node_modules because *something* declares
// it), but the Docker prod stage installs only the pruned closure with
//   npm ci --omit=dev --workspace=@nodetool-ai/websocket --include-workspace-root=false
// so an undeclared import that nothing else pulls in is absent at runtime and
// the server crashes with ERR_MODULE_NOT_FOUND.
//
// This check mirrors that prune exactly: it walks the production dependency
// closure of PROD_ENTRYPOINTS and requires every package in the closure to
// declare each `@nodetool-ai/*` package its source imports. Packages outside
// the closure (e.g. the private *-codegen build tools) are not shipped and are
// intentionally not checked.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Production entrypoints bundled into the Docker image (the Dockerfile build
// stage esbuilds this workspace via scripts/bundle-backend.mjs --profile
// server). Keep in sync if the deployment bundles additional workspaces.
const PROD_ENTRYPOINTS = ["@nodetool-ai/websocket"];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const packagesDir = join(repoRoot, "packages");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "__tests__", "tests", "test", "coverage"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Capture the specifier from static imports/exports, dynamic import(), and require().
const SPECIFIER_PATTERNS = [
  /(?:import|export)\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];

/** Reduce a specifier like `@nodetool-ai/code-nodes/nodes/code` to `@nodetool-ai/code-nodes`. */
function workspacePackageName(specifier) {
  if (!specifier.startsWith("@nodetool-ai/")) return null;
  const [scope, name] = specifier.split("/");
  return name ? `${scope}/${name}` : null;
}

async function collectSourceFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await collectSourceFiles(full)));
    } else if (
      SOURCE_EXTENSIONS.has(full.slice(full.lastIndexOf("."))) &&
      !TEST_FILE.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

function importedWorkspacePackages(source) {
  const found = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const name = workspacePackageName(match[1]);
      if (name) found.add(name);
    }
  }
  return found;
}

// Load every workspace manifest under packages/.
const manifests = new Map(); // name -> { dir, prodDeps: Set<string> }
for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(packagesDir, entry.name);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (!manifest.name?.startsWith("@nodetool-ai/")) continue;
  manifests.set(manifest.name, {
    dir,
    prodDeps: new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {})
    ])
  });
}

// Production closure: packages reachable from the entrypoints via prod deps.
const closure = new Set();
const queue = [...PROD_ENTRYPOINTS];
while (queue.length > 0) {
  const name = queue.pop();
  if (closure.has(name)) continue;
  const manifest = manifests.get(name);
  if (!manifest) continue;
  closure.add(name);
  for (const dep of manifest.prodDeps) {
    if (dep.startsWith("@nodetool-ai/") && !closure.has(dep)) queue.push(dep);
  }
}

const violations = [];

for (const name of closure) {
  const { dir, prodDeps } = manifests.get(name);
  const sourceFiles = await collectSourceFiles(join(dir, "src"));
  const missing = new Map(); // dep -> example file
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    for (const dep of importedWorkspacePackages(source)) {
      if (dep === name || prodDeps.has(dep)) continue;
      if (!missing.has(dep)) missing.set(dep, file.slice(repoRoot.length + 1));
    }
  }
  for (const [dep, file] of missing) {
    violations.push({ pkg: name, dep, file });
  }
}

if (violations.length > 0) {
  console.error("Undeclared workspace dependencies in the production closure:\n");
  for (const { pkg, dep, file } of violations) {
    console.error(`  ${pkg}: imports "${dep}" (e.g. ${file}) but it is not in dependencies`);
  }
  console.error(
    `\nEach package above ships to production (it is in the closure of ${PROD_ENTRYPOINTS.join(", ")}).\n` +
      "Add the imported package to the importing package's `dependencies` in its package.json,\n" +
      "then run `npm install` to sync package-lock.json. These imports resolve locally via\n" +
      "workspace hoisting but break under the Docker prod prune (npm ci --omit=dev)."
  );
  process.exit(1);
}

console.log(
  `Workspace dependency check passed (${closure.size} packages in the ${PROD_ENTRYPOINTS.join(", ")} production closure).`
);
