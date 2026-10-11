#!/usr/bin/env node
/**
 * Resolve workspace "*" dependencies to real version numbers before publishing.
 *
 * Reads each public package's package.json and replaces any @nodetool-ai/* dep
 * pinned to "*" with the exact version of that workspace.
 *
 * The pin is exact, not "^<version>". A caret lets an older release resolve to
 * whatever newer sibling the registry holds: when the 0.8.2 publish failed for
 * 39 packages, `@nodetool-ai/cli@0.8.1` (`^0.8.1` ranges) pulled the half-
 * published 0.8.2 `agents`, whose `^0.8.2` dependency on `app-runtime` did not
 * exist, so neither version installed. Exact pins make each release one
 * self-consistent set that a later partial publish cannot break.
 *
 * Run this AFTER bump-version and BEFORE npm publish. The release workflow
 * handles this automatically.
 *
 * Usage:
 *   node scripts/prepare-publish.mjs
 *   node scripts/prepare-publish.mjs --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * Roots holding packages that publish to npm. Sandbox packs are deliberately
 * excluded: they ship inside the app bundle, never to the registry.
 */
const PACKAGE_ROOTS = ["packages", "reliability"];

const PRIVATE_PACKAGES = new Set(["fal-codegen", "kie-codegen", "mutator", "replicate-codegen"]);

/** Every package.json under PACKAGE_ROOTS, as absolute paths. */
function packageJsonPaths() {
  const found = [];
  for (const root of PACKAGE_ROOTS) {
    const dir = resolve(ROOT, root);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || PRIVATE_PACKAGES.has(entry.name)) continue;
      const p = resolve(dir, entry.name, "package.json");
      if (existsSync(p)) found.push(p);
    }
  }
  return found;
}

const DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

/**
 * Pin every workspace "*" dependency in `pkg` to the exact version in
 * `versionMap`. Mutates `pkg` and returns the changes it made.
 */
export function resolveWorkspaceDeps(pkg, versionMap) {
  const changes = [];
  for (const field of DEP_FIELDS) {
    if (!pkg[field]) continue;
    for (const [dep, ver] of Object.entries(pkg[field])) {
      if (ver !== "*") continue;
      const resolvedVersion = versionMap.get(dep);
      if (!resolvedVersion) continue;
      changes.push({ field, dep, from: "*", to: resolvedVersion });
      pkg[field][dep] = resolvedVersion;
    }
  }
  return changes;
}

function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage: node scripts/prepare-publish.mjs [--dry-run]

Resolves @nodetool-ai/* workspace "*" dependencies to the exact <version> in all
public package.json files, preparing them for npm publish.

  --dry-run   Show what would change without modifying files`);
    process.exit(0);
  }

  // Build a map of package name -> version from all packages in the monorepo
  const versionMap = new Map();
  for (const pkgPath of packageJsonPaths()) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.name && pkg.version) versionMap.set(pkg.name, pkg.version);
    } catch {
      // skip unreadable packages
    }
  }

  let totalChanges = 0;

  for (const pkgPath of packageJsonPaths()) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.private) continue;

    const changes = resolveWorkspaceDeps(pkg, versionMap);

    if (changes.length === 0) continue;

    const rel = relative(ROOT, pkgPath);
    if (values["dry-run"]) {
      console.log(`\n${rel}:`);
      for (const { field, dep, to } of changes) {
        console.log(`  ${field}.${dep}: "*" → "${to}"`);
      }
    } else {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      console.log(`${rel}: resolved ${changes.length} dep(s)`);
    }
    totalChanges += changes.length;
  }

  if (totalChanges === 0) {
    console.log("No workspace \"*\" dependencies found to resolve.");
  } else if (values["dry-run"]) {
    console.log(`\nDry run: ${totalChanges} dep(s) would be resolved.`);
  } else {
    console.log(`\nResolved ${totalChanges} workspace dep(s) across all packages.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
