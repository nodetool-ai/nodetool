import { readCatalogIndex, type NodeCatalogIndex, type CatalogPack, type PinnedPackage } from "@nodetool-ai/pack-core";
import { isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { InstallMode } from "./mode.js";
import { readInstalledPacks } from "./installed.js";
import { currentProject, readProjectSelection, type PacksProjectSelection } from "./project.js";
import { readDesiredFor, desiredStateKey, type DesiredPackState } from "./install-state.js";
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

export type PackOperation = "install" | "remove" | "repair";

/** The pack project a transaction will build, computed from the active one. */
export interface InstallSelection {
  /** The per-version pack project directory, `<packs home>/<core version>`. */
  readonly root: string;
  /** The key of this packs home in the desired-state file. */
  readonly stateKey: string;
  readonly coreVersion: string;
  readonly mode: "global" | "local";
  /** Every pack in the new generation, with the packs they require. */
  readonly packs: readonly CatalogPack[];
  /** Every npm runtime library in the new generation. */
  readonly runtimeLibraries: readonly string[];
  readonly scripts: readonly PinnedPackage[];
  /** The ids the user asked for. npm installs the closure of these. */
  readonly requested: PacksProjectSelection;
  /** The selection recorded in the active generation. */
  readonly active: PacksProjectSelection;
  readonly previous: DesiredPackState;
  readonly catalog: NodeCatalogIndex;
  /** The active generation, or null before the first install. */
  readonly current: string | null;
  readonly installedIds: readonly string[];
  readonly installedLibraries: readonly string[];
  /** Installed packs and libraries this transaction removes. */
  readonly removed: readonly string[];
  /** Requested removals that stay because another selection requires them. */
  readonly kept: readonly string[];
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

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * Compute the selection of the next generation. Install adds the request to
 * the active selection, remove takes it away, and repair adds the recorded
 * desired set. The pack closure and runtime libraries follow from the result.
 */
export async function prepareInstallSelection(request: InstallPacksRequest, operation: PackOperation = "install"): Promise<InstallSelection> {
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  const catalog = request.catalog ?? readCatalogIndex();
  if (catalog.coreVersion !== mode.coreVersion) { throw new Error("Catalog and CLI versions differ"); }
  const stateKey = desiredStateKey(mode);
  const previous = await readDesiredFor(request.stateFile, mode) ?? { root: stateKey, coreVersion: mode.coreVersion, packs: [], runtimeLibraries: [] };
  for (const id of request.packs) {
    if (!catalog.packs.some((pack) => pack.id === id)) { throw new Error(`Unknown node pack: ${id}`); }
  }
  for (const id of request.runtimeLibraries ?? []) {
    if (!isRuntimeNpmPackageId(id)) { throw new Error(`Runtime library ${id} cannot be installed by npm`); }
  }
  const current = currentProject(mode.packsRoot);
  const active: PacksProjectSelection = current ? await readProjectSelection(current) : { coreVersion: mode.coreVersion, packs: [], runtimeLibraries: [] };
  if (active.coreVersion !== mode.coreVersion) { throw new Error(`Pack project ${current ?? mode.packsRoot} records core version ${active.coreVersion}, not ${mode.coreVersion}`); }
  const snapshot = readInstalledPacks(mode, catalog, current ? { projectRoot: current } : {});
  const installedIds = snapshot.packs.map((pack) => pack.id);
  const installedLibraries = expandLibraries(catalog, active.packs, active.runtimeLibraries);
  let requested: PacksProjectSelection;
  if (operation === "remove") {
    const packs = new Set(request.packs);
    const libraries = new Set(request.runtimeLibraries ?? []);
    requested = { coreVersion: mode.coreVersion, packs: active.packs.filter((id) => !packs.has(id)), runtimeLibraries: active.runtimeLibraries.filter((id) => !libraries.has(id)) };
  } else {
    const restore = operation === "repair" ? previous : undefined;
    requested = { coreVersion: mode.coreVersion,
      packs: sorted([...active.packs, ...request.packs, ...(restore?.requestedPacks ?? restore?.packs ?? [])].filter((id) => catalog.packs.some((pack) => pack.id === id))),
      runtimeLibraries: sorted([...active.runtimeLibraries, ...(request.runtimeLibraries ?? []), ...(restore?.runtimeLibraries ?? [])].filter(isRuntimeNpmPackageId)) };
  }
  const packs = expandCatalogPacks(catalog, requested.packs);
  const runtimeLibraries = expandLibraries(catalog, requested.packs, requested.runtimeLibraries);
  const packIds = new Set(packs.map((pack) => pack.id));
  const libraryIds = new Set(runtimeLibraries);
  const removed = sorted([...installedIds.filter((id) => !packIds.has(id)), ...installedLibraries.filter((id) => !libraryIds.has(id))]);
  const kept = operation === "remove" ? sorted([...request.packs.filter((id) => packIds.has(id)), ...(request.runtimeLibraries ?? []).filter((id) => libraryIds.has(id))]) : [];
  const scripts = [...new Map(packs.flatMap((pack) => pack.scriptAllowlist).map((pin) => [JSON.stringify(pin), pin])).values()];
  return { root: mode.packsRoot, stateKey, coreVersion: mode.coreVersion, mode: mode.kind, packs, runtimeLibraries, scripts, requested, active, previous, catalog,
    current, installedIds, installedLibraries, removed, kept };
}

/** Explicit runtime libraries plus every npm runtime library a selected pack needs. */
function expandLibraries(catalog: NodeCatalogIndex, packIds: readonly string[], explicit: readonly string[]): string[] {
  return sorted([...explicit, ...expandCatalogPacks(catalog, packIds).flatMap((pack) => pack.runtimeLibraries)].filter(isRuntimeNpmPackageId));
}
