#!/usr/bin/env node
/** Read-only local-tree estimates. See docs/cli-pack-system-design.md section 8.1. */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CORE_PACKAGES, RUNTIME_LIBRARIES } from "./node-catalog/tiers.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CORE = new Set(CORE_PACKAGES);
const RUNTIME = new Set(RUNTIME_LIBRARIES.flatMap((library) => library.packages));

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

export function workspacePackages(root) {
  const workspaces = new Map();
  for (const area of ["packages", "reliability"]) {
    const parent = join(root, area);
    if (!existsSync(parent)) { continue; }
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const dir = join(parent, entry.name);
      if (!entry.isDirectory() || !existsSync(join(dir, "package.json"))) { continue; }
      const manifest = readManifest(dir);
      if (manifest.name) { workspaces.set(manifest.name, realpathSync(dir)); }
    }
  }
  return workspaces;
}

/** Node's package-directory lookup, independent of package.json export restrictions. */
export function resolvePackage(name, dependent) {
  let parent = dependent;
  while (true) {
    const candidate = join(parent, "node_modules", name);
    if (basename(parent) !== "node_modules" && existsSync(join(candidate, "package.json"))) { return realpathSync(candidate); }
    const next = dirname(parent);
    if (next === parent) { return null; }
    parent = next;
  }
}

export function measurePaths(paths) {
  let apparentBytes = 0;
  let diskBytes = 0;
  const pending = [...paths];
  while (pending.length > 0) {
    const path = pending.pop();
    if (!existsSync(path)) { continue; }
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry !== "node_modules") { pending.push(join(path, entry)); }
      }
    } else {
      apparentBytes += stat.size;
      diskBytes += stat.blocks * 512;
    }
  }
  return { apparentBytes, diskBytes };
}

function dependencies(manifest, scenario, workspace) {
  const edges = new Map();
  for (const name of Object.keys(manifest.dependencies ?? {})) { edges.set(name, false); }
  for (const name of Object.keys(manifest.optionalDependencies ?? {})) { edges.set(name, true); }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (!manifest.peerDependenciesMeta?.[name]?.optional && !edges.has(name)) { edges.set(name, false); }
  }
  if (scenario === "S3" && workspace) {
    for (const name of edges.keys()) {
      if (RUNTIME.has(name) ||
        (manifest.name === "@nodetool-ai/agents" && name === "office-text-extractor") ||
        (manifest.name === "@nodetool-ai/game-runtime" && name === "@dimforge/rapier3d-compat")) {
        edges.delete(name);
      }
    }
    if (manifest.name === "@nodetool-ai/cli") { edges.set("tsx", false); }
    if (manifest.name === "@nodetool-ai/gpu") { edges.set("webgpu", false); }
  }
  return edges;
}

export function measureClosure({ root = ROOT, scenario = "S0", roots, corePackages = CORE }) {
  if (scenario !== "S0" && scenario !== "S3") { throw new Error(`Unknown scenario: ${scenario}`); }
  root = realpathSync(root);
  const workspaces = workspacePackages(root);
  const workspaceDirs = new Set(workspaces.values());
  const start = roots ?? (scenario === "S0" ? ["@nodetool-ai/cli"]
    : [...corePackages].filter((name) => workspaces.has(name)));
  const pending = start.map((name) => {
    const dir = workspaces.get(name) ?? resolvePackage(name, root);
    if (!dir) { throw new Error(`Root package is not installed: ${name}`); }
    return dir;
  });
  const visited = new Set();
  const packages = [];
  const missingOptional = [];
  while (pending.length > 0) {
    const dir = pending.pop();
    if (visited.has(dir)) { continue; }
    visited.add(dir);
    const manifest = readManifest(dir);
    const workspace = workspaceDirs.has(dir);
    const sizes = measurePaths(workspace
      ? [join(dir, "dist"), join(dir, "package.json"), join(dir, "README.md")]
      : [dir]);
    packages.push({ name: manifest.name, version: manifest.version, path: relative(root, dir), ...sizes });
    for (const [name, optional] of dependencies(manifest, scenario, workspace)) {
      if (scenario === "S3" && workspaces.has(name) && !corePackages.has(name)) { continue; }
      const target = resolvePackage(name, dir);
      if (!target) {
        if (optional) { missingOptional.push({ dependent: manifest.name, name }); continue; }
        throw new Error(`${manifest.name} requires uninstalled package ${name} (from ${dir})`);
      }
      pending.push(target);
    }
  }
  if (packages.length === 0) { throw new Error("Closure measurement visited no packages"); }
  packages.sort((a, b) => b.apparentBytes - a.apparentBytes || a.path.localeCompare(b.path));
  return {
    scenario, packageCount: packages.length,
    apparentBytes: packages.reduce((total, pkg) => total + pkg.apparentBytes, 0),
    diskBytes: packages.reduce((total, pkg) => total + pkg.diskBytes, 0),
    largestPackages: packages.slice(0, 20),
    missingOptional: missingOptional.sort((a, b) => `${a.dependent}/${a.name}`.localeCompare(`${b.dependent}/${b.name}`))
  };
}

function main() {
  const { values } = parseArgs({ options: {
    json: { type: "boolean", default: false }, root: { type: "string", default: ROOT },
    scenario: { type: "string" }, help: { type: "boolean", short: "h" }
  } });
  if (values.help) {
    console.log("Usage: node scripts/measure-cli-closure.mjs [--scenario S0|S3] [--json] [--root <checkout>]");
    return;
  }
  const reports = (values.scenario ? [values.scenario] : ["S0", "S3"])
    .map((scenario) => measureClosure({ root: resolve(values.root), scenario }));
  if (values.json) { console.log(JSON.stringify(reports, null, 2)); return; }
  for (const report of reports) {
    console.log(`${report.scenario}: ${report.packageCount} packages, apparent ${(report.apparentBytes / 1e6).toFixed(2)} MB, disk ${(report.diskBytes / 1e6).toFixed(2)} MB`);
    console.log("20 largest packages (apparent MB, disk MB, package directory):");
    for (const pkg of report.largestPackages) {
      console.log(`${(pkg.apparentBytes / 1e6).toFixed(2)}\t${(pkg.diskBytes / 1e6).toFixed(2)}\t${pkg.path}`);
    }
    console.log(`Unavailable optional dependencies: ${report.missingOptional.length}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
