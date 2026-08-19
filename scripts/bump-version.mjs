#!/usr/bin/env node
/**
 * Bump the application version across all relevant files.
 *
 * Updates:
 *   - web/package.json
 *   - electron/package.json
 *   - mobile/package.json
 *   - web/src/config/constants.ts  (VERSION constant)
 *
 * Usage:
 *   npm run bump-version 0.6.4
 *   npm run bump-version 0.6.4 --tag
 *   npm run bump-version 0.6.4 --tag --push
 *   npm run bump-version 0.6.4 --dry-run
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");

const PRIVATE_PACKAGES = new Set(["fal-codegen", "kie-codegen", "replicate-codegen"]);

/**
 * Every directory holding a versioned package.json. Both extra roots live
 * outside `packages/` and were skipped before, so each drifted behind: the
 * reliability harness sat at rc.32, and the sandbox packs — which ship inside
 * the app bundle, not to npm — spread across rc.34/35/36.
 */
const PACKAGE_ROOTS = ["packages", "packages/sandbox-packs", "reliability"];

function getPublicPackageJsons() {
  const found = [];
  for (const root of PACKAGE_ROOTS) {
    const dir = resolve(ROOT, root);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || PRIVATE_PACKAGES.has(entry.name)) continue;
      const p = resolve(dir, entry.name, "package.json");
      if (!existsSync(p)) continue;
      const pkg = JSON.parse(readFileSync(p, "utf8"));
      if (!pkg.private) found.push(p);
    }
  }
  return found;
}

const PACKAGE_JSONS = [
  resolve(ROOT, "web/package.json"),
  resolve(ROOT, "electron/package.json"),
  resolve(ROOT, "mobile/package.json"),
  ...getPublicPackageJsons(),
];

const CONSTANTS_TS = resolve(ROOT, "web/src/config/constants.ts");

function rel(p) {
  return relative(ROOT, p);
}

function updatePackageJson(filePath, version) {
  if (!existsSync(filePath)) {
    console.log(`  skip (not found): ${rel(filePath)}`);
    return false;
  }
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  if (data.version === version) {
    console.log(`  skip (already ${version}): ${rel(filePath)}`);
    return false;
  }
  data.version = version;
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  updated: ${rel(filePath)}`);
  return true;
}

function updateConstantsTs(version) {
  if (!existsSync(CONSTANTS_TS)) {
    console.log(`  skip (not found): ${rel(CONSTANTS_TS)}`);
    return false;
  }
  const text = readFileSync(CONSTANTS_TS, "utf8");
  const updated = text.replace(
    /export const VERSION = "[^"]+"/,
    `export const VERSION = "${version}"`
  );
  if (updated === text) {
    console.log(`  skip (already ${version}): ${rel(CONSTANTS_TS)}`);
    return false;
  }
  writeFileSync(CONSTANTS_TS, updated);
  console.log(`  updated: ${rel(CONSTANTS_TS)}`);
  return true;
}

function git(args) {
  execSync(`git ${args}`, { cwd: ROOT, stdio: "inherit" });
}

function gitCommitAndTag(version, tag, push) {
  const files = [...PACKAGE_JSONS, CONSTANTS_TS].filter(existsSync);
  for (const f of files) git(`add ${rel(f)}`);

  try {
    execSync("git diff --cached --quiet", { cwd: ROOT });
    console.log("\nNo changes staged — nothing to commit.");
    return;
  } catch {
    // Non-zero exit means there are staged changes — continue
  }

  git(`commit -m "Bump version to ${version}"`);
  console.log(`\nCommitted version bump to ${version}`);

  if (tag) {
    const tagName = `v${version}`;
    git(`tag -a ${tagName} -m "Release ${tagName}"`);
    console.log(`Created tag ${tagName}`);

    if (push) {
      git("push origin HEAD");
      git(`push origin ${tagName}`);
      console.log(`Pushed commit and tag ${tagName}`);
    }
  }
}

function dryRun(version) {
  console.log("Dry run — no files will be modified.\n");
  for (const p of PACKAGE_JSONS) {
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, "utf8"));
      console.log(`  ${rel(p)}: ${data.version ?? "?"} -> ${version}`);
    }
  }
  if (existsSync(CONSTANTS_TS)) {
    const text = readFileSync(CONSTANTS_TS, "utf8");
    const m = text.match(/export const VERSION = "([^"]+)"/);
    console.log(
      `  ${rel(CONSTANTS_TS)}: ${m ? m[1] : "?"} -> ${version}`
    );
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tag: { type: "boolean", default: false },
    push: { type: "boolean", default: false },
    "no-commit": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: npm run bump-version <version> [--tag] [--push] [--no-commit] [--dry-run]

  version      New version (e.g. 0.6.4, 0.7.0-rc.1)
  --tag        Create a git tag (v<version>)
  --push       Push commit and tag to origin (implies --tag)
  --no-commit  Write the files only — no git commit or tag (for CI)
  --dry-run    Show what would change without modifying files`);
  process.exit(values.help ? 0 : 1);
}

const version = positionals[0].replace(/^v/, "");
if (values.push) values.tag = true;

console.log(`Bumping version to ${version}\n`);

if (values["dry-run"]) {
  dryRun(version);
} else {
  let changed = false;
  for (const p of PACKAGE_JSONS) {
    if (updatePackageJson(p, version)) changed = true;
  }
  if (updateConstantsTs(version)) changed = true;

  if (!changed) {
    console.log("\nAll files already at the target version.");
  } else {
    if (!values["no-commit"]) {
      gitCommitAndTag(version, values.tag, values.push);
    }
    console.log(`\nDone — version is now ${version}`);
  }
}
