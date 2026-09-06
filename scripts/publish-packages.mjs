#!/usr/bin/env node
/**
 * Publish every public workspace package to npm, one at a time, idempotently.
 *
 * `npm publish --workspaces` aborts on the first package that fails. That is
 * how the 0.7.0-rc.24..rc.40 releases died: the first workspace in the list
 * (@nodetool-ai/protocol) got a 404 from an unauthorized token and the other
 * 58 packages were never attempted. It also makes a re-run impossible, because
 * whatever did publish before the failure now returns EPUBLISHCONFLICT and
 * kills the retry at that package instead.
 *
 * This script attempts every package regardless of what happened to the ones
 * before it, treats "this exact version is already on the registry" as success,
 * and exits non-zero at the end if anything actually failed. Re-running after a
 * partial publish finishes the job.
 *
 * Usage:
 *   node scripts/publish-packages.mjs --tag rc
 *   node scripts/publish-packages.mjs --tag rc --dry-run
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * Roots holding packages that publish to npm. Kept in sync with
 * prepare-publish.mjs: sandbox packs ship inside the app bundle, never to the
 * registry, so they are not here.
 */
const PACKAGE_ROOTS = ["packages", "reliability"];

/**
 * What a finished `npm publish` attempt means. A version already on the
 * registry is the desired end state, not a failure — treating it as one is
 * what made a partially-completed release impossible to re-run.
 */
export function classifyPublishResult(status, output) {
  if (status === 0) return "published";
  if (
    output.includes("EPUBLISHCONFLICT") ||
    output.includes("cannot publish over")
  ) {
    return "skipped";
  }
  return "failed";
}

function main() {
  const { values } = parseArgs({
    options: {
      tag: { type: "string", default: "latest" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage: node scripts/publish-packages.mjs [--tag <dist-tag>] [--dry-run]

Publishes every public workspace package to npm, continuing past failures and
skipping versions already present on the registry.

  --tag <dist-tag>   npm dist-tag to publish under (default: latest)
  --dry-run          Run npm publish --dry-run for each package`);
    process.exit(0);
  }

  /** Every public package under PACKAGE_ROOTS, as { name, version, dir }. */
  function publicPackages() {
    const found = [];
    for (const root of PACKAGE_ROOTS) {
      const rootDir = resolve(ROOT, root);
      if (!existsSync(rootDir)) continue;
      for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = resolve(rootDir, entry.name);
        const manifest = resolve(dir, "package.json");
        if (!existsSync(manifest)) continue;
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        if (pkg.private || !pkg.name || !pkg.version) continue;
        found.push({ name: pkg.name, version: pkg.version, dir });
      }
    }
    return found.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** True when name@version is already on the registry. */
  function alreadyPublished(name, version) {
    const res = spawnSync(
      "npm",
      ["view", `${name}@${version}`, "version", "--json"],
      { encoding: "utf8" }
    );
    return res.status === 0 && res.stdout.trim() !== "";
  }

  const packages = publicPackages();
  console.log(
    `Publishing ${packages.length} package(s) under dist-tag "${values.tag}"` +
      (values["dry-run"] ? " (dry run)" : "")
  );

  const published = [];
  const skipped = [];
  const failed = [];

  for (const { name, version, dir } of packages) {
    if (!values["dry-run"] && alreadyPublished(name, version)) {
      console.log(`skip    ${name}@${version} (already on registry)`);
      skipped.push(`${name}@${version}`);
      continue;
    }

    const args = [
      "publish",
      "--access",
      "public",
      "--ignore-scripts",
      "--provenance",
      "--tag",
      values.tag,
    ];
    if (values["dry-run"]) args.push("--dry-run");

    const res = spawnSync("npm", args, { cwd: dir, encoding: "utf8" });
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;

    switch (classifyPublishResult(res.status, output)) {
      case "published":
        console.log(`publish ${name}@${version}`);
        published.push(`${name}@${version}`);
        break;
      case "skipped":
        console.log(`skip    ${name}@${version} (already on registry)`);
        skipped.push(`${name}@${version}`);
        break;
      default:
        console.error(`FAIL    ${name}@${version}`);
        console.error(output.trim());
        failed.push({ name: `${name}@${version}`, output: output.trim() });
    }
  }

  console.log(
    `\npublished ${published.length}, skipped ${skipped.length}, failed ${failed.length}`
  );

  if (failed.length > 0) {
    console.error(`\nFailed packages:`);
    for (const { name } of failed) console.error(`  ${name}`);
    console.error(
      `\nA 404 on PUT for a package that exists means the npm token is not ` +
        `authorized to write to the @nodetool-ai scope. Re-running this script ` +
        `after fixing the token will publish only what is still missing.`
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
