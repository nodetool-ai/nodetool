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
 * This script publishes in dependency order, treats "this exact version is
 * already on the registry" as success, and exits non-zero at the end if
 * anything failed. Re-running after a partial publish finishes the job.
 *
 * A package whose workspace dependency failed is not published. The 0.8.2
 * release published `cli` and `agents` after `app-runtime` failed, so the
 * registry held packages that pointed at a version that did not exist, and
 * `npm install @nodetool-ai/cli` failed for every user until a re-run.
 * Holding dependents back keeps every published version installable.
 *
 * Usage:
 *   node scripts/publish-packages.mjs --tag staging
 *   node scripts/publish-packages.mjs --tag staging --dry-run
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { pack, existingTarballs } from "./smoke-packed-cli.mjs";
import { catalogPackageNames, runReleaseCommand, tarballIntegrity, writeReleasePinnedCatalog } from "./release/pin-catalog.mjs";

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

const DEP_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

/** Names of the workspace packages in `names` that `pkg` depends on. */
export function workspaceDeps(pkg, names) {
  const deps = new Set();
  for (const field of DEP_FIELDS) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (names.has(dep) && dep !== pkg.name) deps.add(dep);
    }
  }
  return [...deps];
}

/**
 * Order `packages` ({ name, deps }) so each one follows its workspace
 * dependencies, alphabetically among packages that are ready together.
 * Throws on a dependency cycle, which npm could not install either.
 */
export function publishOrder(packages) {
  const pending = new Map(packages.map((p) => [p.name, p]));
  const done = new Set();
  const order = [];
  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter((p) => p.deps.every((d) => done.has(d) || !pending.has(d)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (ready.length === 0) {
      throw new Error(
        `Dependency cycle among: ${[...pending.keys()].sort().join(", ")}`
      );
    }
    for (const p of ready) {
      pending.delete(p.name);
      done.add(p.name);
      order.push(p);
    }
  }
  return order;
}

/** The dependencies of `pkg` that are not on the registry at this version. */
export function unmetDeps(pkg, available) {
  return pkg.deps.filter((d) => !available.has(d));
}

/** Packing has a catalog boundary independent of the later publish dependency order. */
export async function packRelease(packages, dest, {
  root = ROOT,
  packPackages = pack,
  pin = writeReleasePinnedCatalog,
  rebuildCatalog = () => runReleaseCommand(process.execPath, [join(root, "packages/node-catalog/build.mjs")], { cwd: root })
} = {}) {
  if (readdirSync(dest).some(name => name.endsWith(".tgz"))) {
    throw new Error("Release tarball directory must be empty. Reuse existing artifacts with --tarballs-dir without --pack-only.");
  }
  const catalogFile = join(root, "packages/node-catalog/data/index.json");
  const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
  const names = catalogPackageNames(catalog);
  const available = new Set(packages.map(pkg => pkg.name));
  for (const name of names) {
    if (!available.has(name)) { throw new Error(`No public workspace package for catalog entry ${name}`); }
  }
  const early = packages.filter(pkg => names.has(pkg.name));
  const remaining = packages.filter(pkg => !names.has(pkg.name));
  const earlyTarballs = await packPackages(early, dest);
  const originalHashes = new Map(Object.entries(earlyTarballs).map(([name, file]) => [name, tarballIntegrity(file)]));
  const verifyOriginals = () => {
    for (const [name, integrity] of originalHashes) {
      if (tarballIntegrity(earlyTarballs[name]) !== integrity) { throw new Error(`Already-packed release artifact changed: ${name}`); }
    }
  };
  await pin(catalogFile, earlyTarballs, { root, workspaces: packages, measurementOptions: { cacheDir: join(dest, ".measurement-cache") } });
  await rebuildCatalog();
  verifyOriginals();
  const remainingTarballs = await packPackages(remaining, dest);
  verifyOriginals();
  return { ...earlyTarballs, ...remainingTarballs };
}

export function assertPublishTag(tag, dryRun = false) {
  if (!dryRun && tag !== "staging") {
    throw new Error("Release artifacts must publish to staging. Use scripts/release/promote-staging.mjs after verification for final tags.");
  }
}

export async function stageExistingVersion(name, version, run = runReleaseCommand) {
  await run("npm", ["dist-tag", "add", `${name}@${version}`, "staging"], { cwd: ROOT });
}

async function main() {
  const { values } = parseArgs({
    options: {
      tag: { type: "string", default: "staging" },
      "tarballs-dir": { type: "string" },
      "pack-only": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage: node scripts/publish-packages.mjs [--tag <dist-tag>] [--dry-run] [--tarballs-dir <dir>] [--pack-only]

Publishes every public workspace package to npm, continuing past failures and
skipping versions already present on the registry.

  --tag <dist-tag>   npm dist-tag to publish under (default: staging)
  --dry-run          Run npm publish --dry-run for each tarball
  --tarballs-dir     Reuse release tarballs or write them with --pack-only
  --pack-only        Pack public workspaces once without publishing`);
    process.exit(0);
  }

  /** Every public package under PACKAGE_ROOTS, as { name, version, dir, deps }. */
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
        found.push({ name: pkg.name, version: pkg.version, dir, manifest: pkg });
      }
    }
    const names = new Set(found.map((p) => p.name));
    return publishOrder(
      found.map(({ manifest, ...p }) => ({
        ...p,
        deps: workspaceDeps(manifest, names)
      }))
    );
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
  if (packages.length === 0) {
    throw new Error("No public workspace packages found to publish");
  }
  if (values["pack-only"] && !values["tarballs-dir"]) {
    throw new Error("--pack-only requires --tarballs-dir");
  }
  const temporary = !values["tarballs-dir"];
  const tarballDir = temporary
    ? mkdtempSync(join(tmpdir(), "nodetool-release-"))
    : resolve(values["tarballs-dir"]);
  mkdirSync(tarballDir, { recursive: true });
  if (values["pack-only"]) {
    await packRelease(packages, tarballDir);
    console.log(`Packed ${packages.length} packages in ${tarballDir}`);
    return;
  }
  try {
    assertPublishTag(values.tag, values["dry-run"]);
    const tarballs = temporary ? await packRelease(packages, tarballDir) : existingTarballs(packages, tarballDir);
    console.log(
      `Publishing ${packages.length} package(s) under dist-tag "${values.tag}"` +
        (values["dry-run"] ? " (dry run)" : "")
    );

    const published = [];
    const skipped = [];
    const failed = [];
    const blocked = [];
    /** Packages whose current version is on the registry (or would be, in a dry run). */
    const available = new Set();

    for (const pkg of packages) {
      const { name, version } = pkg;
      const unmet = unmetDeps(pkg, available);
      if (unmet.length > 0) {
        console.error(`BLOCK   ${name}@${version} (needs ${unmet.join(", ")})`);
        blocked.push(`${name}@${version}`);
        continue;
      }

      if (!values["dry-run"] && alreadyPublished(name, version)) {
        console.log(`skip    ${name}@${version} (already on registry)`);
        try {
          await stageExistingVersion(name, version);
          skipped.push(`${name}@${version}`);
          available.add(name);
        } catch (error) {
          console.error(`FAIL    ${name}@${version} staging tag`);
          failed.push({ name: `${name}@${version}`, output: error.message });
        }
        continue;
      }

      const args = [
        "publish",
        tarballs[name],
        "--access",
        "public",
        "--ignore-scripts",
        "--provenance",
        "--tag",
        values.tag,
      ];
      if (values["dry-run"]) args.push("--dry-run");

      const res = spawnSync("npm", args, { cwd: ROOT, encoding: "utf8" });
      const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;

      switch (classifyPublishResult(res.status, output)) {
        case "published":
          console.log(`publish ${name}@${version}`);
          published.push(`${name}@${version}`);
          available.add(name);
          break;
        case "skipped":
          console.log(`skip    ${name}@${version} (already on registry)`);
          try {
            if (!values["dry-run"]) { await stageExistingVersion(name, version); }
            skipped.push(`${name}@${version}`);
            available.add(name);
          } catch (error) {
            console.error(`FAIL    ${name}@${version} staging tag`);
            failed.push({ name: `${name}@${version}`, output: error.message });
          }
          break;
        default:
          console.error(`FAIL    ${name}@${version}`);
          console.error(output.trim());
          failed.push({ name: `${name}@${version}`, output: output.trim() });
      }
    }

    console.log(
      `\npublished ${published.length}, skipped ${skipped.length}, ` +
        `failed ${failed.length}, blocked ${blocked.length}`
    );

    if (failed.length > 0 || blocked.length > 0) {
      console.error(`\nFailed packages:`);
      for (const { name } of failed) console.error(`  ${name}`);
      if (blocked.length > 0) {
        console.error(`\nNot published because a dependency failed:`);
        for (const name of blocked) console.error(`  ${name}`);
      }
      console.error(
        `\nConfigure npm trusted publishing for each package in the ` +
          `@nodetool-ai scope, authorizing this repository and publish.yaml. ` +
          `Re-running this script after fixing publisher access will publish ` +
          `only what is still missing.`
      );
      process.exitCode = 1;
    }
  } finally {
    if (temporary) { rmSync(tarballDir, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
