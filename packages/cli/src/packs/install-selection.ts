import { realpath } from "node:fs/promises";
import { readCatalogIndex, type NodeCatalogIndex, type CatalogPack, type PinnedPackage } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { InstallMode } from "./mode.js";
import { readInstallTree, type TreePackage } from "./install-tree.js";

import { globalBootstrapPins, type GlobalBootstrapPin } from "./global-bootstrap.js";
import { readDesiredState, type DesiredPackState } from "./install-state.js";
export { readDesiredState } from "./install-state.js";
export type { DesiredPackState } from "./install-state.js";
export interface InstallPacksRequest {
  readonly mode: InstallMode;
  readonly packs: readonly string[];
  readonly runtimeLibraries?: readonly string[];
  readonly stateFile: string;
  readonly catalog?: NodeCatalogIndex;
  readonly signal?: AbortSignal;
  readonly onWarning?: (warning: string) => void;
}
export interface InstallSelection {
  readonly root: string;
  readonly coreVersion: string;
  readonly mode: "global" | "local";
  readonly packs: readonly CatalogPack[];
  readonly runtimeLibraries: readonly string[];
  readonly scripts: readonly PinnedPackage[];
  readonly previous: DesiredPackState;
  readonly catalog: NodeCatalogIndex;
  readonly before: readonly TreePackage[];
  readonly replayLibraries: readonly string[];
  readonly installedIds: readonly string[];
  readonly initialGlobalLockMissing: boolean;
  readonly bootstrap?: readonly GlobalBootstrapPin[];
  readonly mutationPaths?: readonly string[];
}
export function expandCatalogPacks(catalog: NodeCatalogIndex, ids: readonly string[]): CatalogPack[] {
  const byId = new Map(catalog.packs.map((pack) => [pack.id, pack]));
  const visited = new Set<string>();
  const pending = [...ids];
  const result: CatalogPack[] = [];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) { continue; }
    visited.add(id);
    const pack = byId.get(id);
    if (!pack) { throw new Error(`Unknown node pack: ${id}`); }
    result.push(pack); pending.push(...pack.requires);
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/** Compute all specs that npm will replay. Desired intent alone adds no specs. */
export async function prepareInstallSelection(request: InstallPacksRequest, options: { readonly allowDirty?: boolean; readonly restoreDesired?: boolean } = {}): Promise<InstallSelection> {
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  const catalog = request.catalog ?? readCatalogIndex();
  if (catalog.coreVersion !== mode.coreVersion) { throw new Error("Catalog and CLI versions differ"); }
  const root = await realpath(mode.installRoot);
  const previous = (await readDesiredState(request.stateFile))[root] ?? { root, coreVersion: mode.coreVersion, packs: [], runtimeLibraries: [] };
  if (previous.dirty && !options.allowDirty) { throw new Error("Pack installation is dirty. Run nodetool packs doctor --repair."); }
  const tree = await readInstallTree(root, mode.kind === "global");
  const before = tree.packages;
  const names = new Set(before.map((entry) => entry.name));
  const installedIds = catalog.packs.filter((pack) => pack.kind === "node-pack" && names.has(pack.npm.name)).map((pack) => pack.id);
  const requested = expandCatalogPacks(catalog, [...request.packs, ...(options.restoreDesired ? previous.packs : [])]);
  const packs = expandCatalogPacks(catalog, [...installedIds, ...requested.map((pack) => pack.id)]);
  const byFolder = new Map((catalog.installPins ?? []).map((pin) => [pin.installName ?? pin.name, pin]));
  const replayLibraries = previous.runtimeLibraries.filter((id) => isRuntimeNpmPackageId(id) && RUNTIME_NPM_PACKAGES[id].packageNames.every((name) => {
    const pin = byFolder.get(name);
    return pin && before.some((entry) => entry.path === `node_modules/${name}` && entry.name === pin.name && entry.version === pin.version &&
      (entry.integrity === pin.integrity || (mode.kind === "global" && tree.missingLock && entry.integrity === undefined)));
  }));
  const explicitLibraries = [...(request.runtimeLibraries ?? []), ...(options.restoreDesired ? previous.runtimeLibraries : [])];
  for (const id of explicitLibraries) { if (!isRuntimeNpmPackageId(id)) { throw new Error(`Runtime library ${id} cannot be installed by npm`); } }
  const libraries = [...new Set([...replayLibraries, ...explicitLibraries, ...requested.flatMap((pack) => pack.runtimeLibraries).filter(isRuntimeNpmPackageId)])].sort();
  const scripts = [...new Map(packs.flatMap((pack) => pack.scriptAllowlist).map((pin) => [JSON.stringify(pin), pin])).values()];
  return { root, coreVersion: mode.coreVersion, mode: mode.kind, packs, runtimeLibraries: libraries, scripts, previous, catalog, before, replayLibraries, installedIds,
    initialGlobalLockMissing: mode.kind === "global" && tree.missingLock,
    bootstrap: mode.kind === "global" && tree.missingLock ? globalBootstrapPins(catalog, before, libraries) : [] };
}
