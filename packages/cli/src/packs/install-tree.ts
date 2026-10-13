import { readFile, readdir, realpath, rm } from "node:fs/promises";
import { join, relative, resolve, sep, dirname } from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";
import type { PinnedPackage } from "@nodetool-ai/node-catalog";
export interface VerificationPin extends PinnedPackage { readonly installName?: string; readonly shared?: boolean }

export interface TreePackage {
  readonly path: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string | undefined;
  readonly realPath: string;
}
const manifestSchema = z.object({ name: z.string(), version: z.string() });
const lockSchema = z.object({ packages: z.record(z.string(), z.object({
  version: z.string().optional(), integrity: z.string().optional()
})) });

/** Inspect every nested package, including entries omitted by an invalid hidden lock. */
export async function snapshotInstallTree(root: string): Promise<readonly TreePackage[]> {
  const lock = lockSchema.parse(JSON.parse(await readFile(join(root, "node_modules/.package-lock.json"), "utf8")));
  const result: TreePackage[] = [];
  const pending = [join(root, "node_modules")];
  while (pending.length) {
    const modules = pending.pop()!;
    let entries;
    try { entries = await readdir(modules, { withFileTypes: true }); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") { continue; }
      throw error;
    }
    const directories: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) { continue; }
      if (entry.name.startsWith("@")) {
        for (const scoped of await readdir(join(modules, entry.name))) {
          directories.push(join(modules, entry.name, scoped));
        }
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        directories.push(join(modules, entry.name));
      }
    }
    for (const directory of directories) {
      const actual = await realpath(directory);
      if (actual !== resolve(directory)) { throw new Error(`Installer refuses linked package ${directory}`); }
      const manifest = manifestSchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
      const path = relative(root, directory).replaceAll("\\", "/");
      const pinned = lock.packages[path];
      if (!pinned || pinned.version !== manifest.version) { throw new Error(`Hidden lock is missing or stale for ${path}`); }
      result.push({ path, name: manifest.name, version: manifest.version, integrity: pinned.integrity, realPath: actual });
      pending.push(join(directory, "node_modules"));
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export interface InstallPlan { readonly add: readonly { name: string; version: string }[]; readonly change: readonly unknown[]; readonly remove: readonly unknown[] }
const planEntry = z.object({ name: z.string(), version: z.string() });
const jsonPlan = z.object({ add: z.array(planEntry), change: z.array(z.unknown()), remove: z.array(z.unknown()) });
export function parseInstallPlan(output: string, npmVersion: string): InstallPlan {
  if (Number(npmVersion.split(".")[0]) >= 11) {
    // npm prints individual dry-run actions before its JSON summary.
    const start = output.indexOf("{");
    if (start < 0) { throw new Error("Missing npm dry-run JSON plan"); }
    return jsonPlan.parse(JSON.parse(output.slice(start)));
  }
  const add: { name: string; version: string }[] = [];
  const change: string[] = [];
  const remove: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(add|change|remove)\s+(\S+)\s+(\S+)/.exec(line);
    if (match?.[1] === "add") { add.push({ name: match[2], version: match[3] }); }
    else if (match?.[1] === "change") { change.push(line); }
    else if (match?.[1] === "remove") { remove.push(line); }
  }
  if (!/\b(?:added|changed|removed|up to date)\b/.test(output) && add.length + change.length + remove.length === 0) {
    throw new Error("Unrecognized npm dry-run output");
  }
  for (const [verb, entries] of [["added", add], ["changed", change], ["removed", remove]] as const) {
    const count = new RegExp(`\\b${verb} (\\d+) packages?\\b`).exec(output);
    if (count && Number(count[1]) !== entries.length) { throw new Error(`Incomplete npm dry-run ${verb} plan`); }
  }
  const jsonStart = output.indexOf("{");
  if (jsonStart >= 0) {
    const counts = z.object({ added: z.number(), changed: z.number(), removed: z.number() }).parse(JSON.parse(output.slice(jsonStart)));
    if (counts.added !== add.length || counts.changed !== change.length || counts.removed !== remove.length) {
      throw new Error("Incomplete npm 10 dry-run action plan");
    }
  }
  return { add, change, remove };
}

export function assertAdditivePlan(plan: InstallPlan, before: readonly TreePackage[], coreNames: ReadonlySet<string>, shared: readonly PinnedPackage[], coreVersion: string): void {
  if (plan.change.length || plan.remove.length) { throw new Error(`npm plan changes or removes installed packages: ${JSON.stringify({ change: plan.change, remove: plan.remove })}`); }
  const identities = new Set(shared.map((pin) => pin.name));
  const existing = new Set(before.map((entry) => entry.name));
  const added = new Set<string>();
  for (const entry of plan.add) {
    if (coreNames.has(entry.name) || entry.name === "@nodetool-ai/cli" || (identities.has(entry.name) && (existing.has(entry.name) || added.has(entry.name)))) {
      throw new Error(`npm plan adds another core or shared identity package: ${entry.name}`);
    }
    if (entry.name.startsWith("@nodetool-ai/") && entry.version !== coreVersion) { throw new Error(`Wrong NodeTool version in npm plan: ${entry.name}`); }
    added.add(entry.name);
  }
}

export function assertTreePins(before: readonly TreePackage[], after: readonly TreePackage[], pins: readonly VerificationPin[], coreNames: ReadonlySet<string>, coreVersion: string): void {
  const paths = new Map(after.map((entry) => [entry.path, entry]));
  for (const previous of before) {
    const next = paths.get(previous.path);
    if (!next || next.name !== previous.name || next.version !== previous.version || next.integrity !== previous.integrity || next.realPath !== previous.realPath) {
      throw new Error(`Install changed an existing package: ${previous.path}`);
    }
  }
  const names = new Map<string, TreePackage[]>();
  for (const entry of after) {
    const values = names.get(entry.name) ?? []; values.push(entry); names.set(entry.name, values);
    if (entry.name.startsWith("@nodetool-ai/") && entry.version !== coreVersion) { throw new Error(`Wrong NodeTool version: ${entry.path}`); }
  }
  for (const name of coreNames) {
    if (names.get(name)?.length !== 1) { throw new Error(`Core package must exist exactly once: ${name}`); }
  }
  for (const pin of pins) {
    const values = (names.get(pin.name) ?? []).filter((entry) => !pin.installName || entry.path.endsWith(`/node_modules/${pin.installName}`) || entry.path === `node_modules/${pin.installName}`);
    if (!pin.integrity || !values.length || values.some((entry) => entry.version !== pin.version || entry.integrity !== pin.integrity)) {
      throw new Error(`Package integrity or version does not match pin: ${pin.name}`);
    }
  }
}

export async function assertSharedIdentities(tree: readonly TreePackage[], shared: readonly PinnedPackage[]): Promise<void> {
  for (const pin of shared) {
    const entries = tree.filter((entry) => entry.name === pin.name);
    if (entries.length !== 1) { throw new Error(`Shared library must exist exactly once: ${pin.name}`); }
    for (const dependent of tree) {
      const manifest = z.object({ dependencies: z.record(z.string(), z.string()).optional(),
        optionalDependencies: z.record(z.string(), z.string()).optional(), peerDependencies: z.record(z.string(), z.string()).optional()
      }).parse(JSON.parse(await readFile(join(dependent.realPath, "package.json"), "utf8")));
      if (!(manifest.dependencies?.[pin.name] || manifest.optionalDependencies?.[pin.name] || manifest.peerDependencies?.[pin.name])) { continue; }
      const resolver = createRequire(join(dependent.realPath, "package.json"));
      const locations = resolver.resolve.paths(pin.name) ?? [];
      let found: string | undefined;
      for (const location of locations) {
        try { found = await realpath(join(location, pin.name)); break; }
        catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; } }
      }
      if (found !== entries[0].realPath) { throw new Error(`Shared library identity differs from ${dependent.name}: ${pin.name}`); }
    }
  }
}

/** npm may retain extraneous --no-save additions even after uninstall. */
export async function removeSnapshotAdditions(root: string, admittedModules: string, before: readonly TreePackage[]): Promise<void> {
  const modules = await realpath(admittedModules);
  if (modules !== resolve(root, "node_modules")) { throw new Error("Rollback node_modules root differs from admitted tree"); }
  const current = await snapshotInstallTree(root);
  const previous = new Set(before.map((entry) => entry.path));
  const protectedAncestors = new Set<string>();
  for (const entry of before) {
    let prefix = "";
    for (const segment of entry.path.split("/").slice(0, -1)) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      protectedAncestors.add(prefix);
    }
  }
  const additions = current.filter((entry) => !previous.has(entry.path)).sort((a, b) => a.path.length - b.path.length);
  const removed = new Set<string>();
  for (const entry of additions) {
    const segments = entry.path.split("/");
    let ancestor = "";
    let covered = false;
    for (const segment of segments) {
      ancestor = ancestor ? `${ancestor}/${segment}` : segment;
      if (removed.has(ancestor)) { covered = true; break; }
    }
    if (covered) { continue; }
    if (protectedAncestors.has(entry.path)) { throw new Error(`Rollback addition contains a preexisting package: ${entry.path}`); }
    const target = resolve(root, entry.path);
    const parent = await realpath(dirname(target));
    const within = relative(modules, target);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || target !== await realpath(target) || parent !== dirname(target)) {
      throw new Error(`Rollback addition escapes admitted tree: ${entry.path}`);
    }
    await rm(target, { recursive: true });
    removed.add(entry.path);
  }
}
