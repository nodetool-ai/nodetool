import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { z } from "zod";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import { planPackRemoval } from "./management.js";
import { prepareInstallSelection, type InstallPacksRequest, type InstallSelection } from "./install-selection.js";

export interface RemovalSelection {
  readonly authorization: InstallSelection;
  readonly remove: readonly string[];
  readonly kept: readonly string[];
  readonly removePaths: ReadonlySet<string>;
  readonly npmNames: readonly string[];
  readonly remainingPackIds: readonly string[];
}
const dependencySchema = z.object({ dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(), peerDependencies: z.record(z.string(), z.string()).optional(),
  peerDependenciesMeta: z.record(z.string(), z.object({ optional: z.boolean().optional() })).optional() });

function reachable(roots: Iterable<string>, edges: ReadonlyMap<string, readonly string[]>): Set<string> {
  const result = new Set<string>(); const pending = [...roots];
  while (pending.length) {
    const path = pending.pop()!; if (result.has(path)) { continue; } result.add(path); pending.push(...(edges.get(path) ?? []));
  }
  return result;
}

/** Preserve logical pack requirements and every dependency reachable from retained roots. */
export async function preparePackRemoval(request: InstallPacksRequest): Promise<RemovalSelection> {
  const selection = await prepareInstallSelection({ ...request, packs: [], runtimeLibraries: [] });
  const logical = planPackRemoval(selection.catalog, selection.installedIds, request.packs);
  const requestedLibraries = [...new Set([...(request.runtimeLibraries ?? []), ...logical.runtimeLibraries])];
  for (const id of requestedLibraries) { if (!isRuntimeNpmPackageId(id)) { throw new Error(`Unknown runtime library: ${id}`); } }
  const byPath = new Map(selection.before.map((entry) => [entry.path, entry]));
  const byRealPath = new Map(selection.before.map((entry) => [entry.realPath, entry.path]));
  const edges = new Map<string, readonly string[]>();
  const dependencies = async (directory: string, omit: ReadonlySet<string> = new Set()): Promise<string[]> => {
    const manifest = dependencySchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
    const peers = Object.keys(manifest.peerDependencies ?? {}).filter((name) => !manifest.peerDependenciesMeta?.[name]?.optional);
    const names = [...new Set([...Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }), ...peers])];
    const resolver = createRequire(join(directory, "package.json")); const result: string[] = [];
    for (const name of names) {
      if (omit.has(name)) { continue; }
      for (const lookup of resolver.resolve.paths(name) ?? []) {
        try {
          const actual = await realpath(join(lookup, name)); const path = byRealPath.get(actual);
          if (path) { result.push(path); } break;
        } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; } }
      }
    }
    return result;
  };
  for (const entry of selection.before) { edges.set(entry.path, await dependencies(entry.realPath)); }
  const catalogById = new Map(selection.catalog.packs.map((pack) => [pack.id, pack]));
  const ownerRoots = new Map<string, readonly string[]>();
  for (const id of logical.remove) {
    const pack = catalogById.get(id)!;
    ownerRoots.set(id, [pack.npm.name, ...pack.provides].map((name) => `node_modules/${name}`).filter((path) => byPath.has(path)));
  }
  const installedIds = new Set(selection.installedIds);
  for (const id of request.packs) {
    if (catalogById.get(id)?.kind === "node-pack" && !installedIds.has(id) && !logical.kept.includes(id)) { ownerRoots.set(id, []); }
  }
  for (const id of requestedLibraries) {
    if (isRuntimeNpmPackageId(id)) {
      const paths = RUNTIME_NPM_PACKAGES[id].packageNames.map((name) => `node_modules/${name}`).filter((path) => byPath.has(path));
      ownerRoots.set(id, [...new Set([...(ownerRoots.get(id) ?? []), ...paths])]);
    }
  }
  const requestedRoots = new Set([...ownerRoots.values()].flat());
  const targetClosure = reachable(requestedRoots, edges);
  const requestedNames = new Set([...requestedRoots].map((path) => path.slice("node_modules/".length)));
  const protectedRoots = new Set(await dependencies(selection.root, selection.mode === "global" ? new Set() : requestedNames));
  if (request.mode.cliRoot !== selection.root) { for (const path of await dependencies(request.mode.cliRoot)) { protectedRoots.add(path); } }
  const nodePackNames = new Set(selection.catalog.packs.filter((pack) => pack.kind === "node-pack").flatMap((pack) => [pack.npm.name, ...pack.provides]));
  for (const entry of selection.before) {
    const topLevel = !entry.path.slice("node_modules/".length).includes("/node_modules/");
    if ((entry.name.startsWith("@nodetool-ai/") && !nodePackNames.has(entry.name)) || (topLevel && !targetClosure.has(entry.path))) { protectedRoots.add(entry.path); }
  }
  for (const id of logical.remaining) {
    const pack = catalogById.get(id)!;
    for (const name of [pack.npm.name, ...pack.provides]) { const path = `node_modules/${name}`; if (byPath.has(path)) { protectedRoots.add(path); } }
    for (const library of pack.runtimeLibraries) {
      if (isRuntimeNpmPackageId(library)) { for (const name of RUNTIME_NPM_PACKAGES[library].packageNames) { const path = `node_modules/${name}`; if (byPath.has(path)) { protectedRoots.add(path); } } }
    }
  }
  const wantedLibraries = new Set(requestedLibraries);
  for (const id of selection.runtimeLibraries) {
    if (!wantedLibraries.has(id) && isRuntimeNpmPackageId(id)) {
      for (const name of RUNTIME_NPM_PACKAGES[id].packageNames) { const path = `node_modules/${name}`; if (byPath.has(path)) { protectedRoots.add(path); } }
    }
  }
  const kept = new Set(logical.kept);
  let protectedPaths = reachable(protectedRoots, edges);
  while (true) {
    const protectedAncestors = new Set<string>();
    for (const path of protectedPaths) { let prefix = ""; for (const segment of path.split("/")) { prefix = prefix ? `${prefix}/${segment}` : segment; protectedAncestors.add(prefix); } }
    let changed = false;
    for (const [id, paths] of ownerRoots) {
      if (kept.has(id)) { continue; }
      if (paths.some((path) => protectedAncestors.has(path))) {
        kept.add(id); for (const path of paths) { protectedRoots.add(path); } changed = true;
      }
    }
    if (!changed) { break; }
    protectedPaths = reachable(protectedRoots, edges);
  }
  const remove = [...ownerRoots.keys()].filter((id) => !kept.has(id)).sort();
  const removePaths = new Set([...reachable(remove.flatMap((id) => ownerRoots.get(id) ?? []), edges)].filter((path) => !protectedPaths.has(path)));
  const npmNames = [...new Set(remove.flatMap((id) => ownerRoots.get(id) ?? []).map((path) => path.slice("node_modules/".length)))];
  const authorization = { ...selection, packs: [...new Map([...selection.packs, ...request.packs.map((id) => catalogById.get(id)).filter((pack) => pack !== undefined)].map((pack) => [pack.id, pack])).values()],
    runtimeLibraries: [...new Set([...selection.runtimeLibraries, ...requestedLibraries])].sort(), scripts: [], mutationPaths: [...removePaths] };
  return { authorization, remove, kept: [...kept].sort(), removePaths, npmNames,
    remainingPackIds: selection.installedIds.filter((id) => !remove.includes(id)) };
}
