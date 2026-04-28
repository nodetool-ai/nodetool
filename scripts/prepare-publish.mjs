#!/usr/bin/env node
/**
 * Resolve workspace "*" dependencies to real version numbers before publishing.
 *
 * Reads each public package's package.json and replaces any @nodetool/* dep
 * pinned to "*" with "^<actual-version>" so that published packages on npm
 * have correct peer/dependency ranges.
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
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = resolve(ROOT, "packages");

const PRIVATE_PACKAGES = new Set(["fal-codegen", "kie-codegen", "replicate-codegen"]);

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: node scripts/prepare-publish.mjs [--dry-run]

Resolves @nodetool/* workspace "*" dependencies to "^<version>" in all
public package.json files, preparing them for npm publish.

  --dry-run   Show what would change without modifying files`);
  process.exit(0);
}

// Build a map of package name -> version from all packages in the monorepo
const versionMap = new Map();
for (const dir of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const pkgPath = resolve(PACKAGES_DIR, dir.name, "package.json");
  if (!existsSync(pkgPath)) continue;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.name && pkg.version) versionMap.set(pkg.name, pkg.version);
  } catch {
    // skip unreadable packages
  }
}

const DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

let totalChanges = 0;

for (const dir of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  if (PRIVATE_PACKAGES.has(dir.name)) continue;

  const pkgPath = resolve(PACKAGES_DIR, dir.name, "package.json");
  if (!existsSync(pkgPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.private) continue;

  const changes = [];

  for (const field of DEP_FIELDS) {
    if (!pkg[field]) continue;
    for (const [dep, ver] of Object.entries(pkg[field])) {
      if (ver !== "*") continue;
      const resolvedVersion = versionMap.get(dep);
      if (resolvedVersion) {
        changes.push({ field, dep, from: "*", to: `^${resolvedVersion}` });
        if (!values["dry-run"]) {
          pkg[field][dep] = `^${resolvedVersion}`;
        }
      }
    }
  }

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
