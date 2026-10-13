import { readFile, realpath } from "node:fs/promises";
import { z } from "zod";
import { readCatalogIndex, type NodeCatalogIndex, type CatalogPack, type PinnedPackage } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { InstallMode } from "./mode.js";
import { readInstallTree, type TreePackage } from "./install-tree.js";

const desiredSchema = z.object({ root: z.string(), coreVersion: z.string(), packs: z.array(z.string()),
  runtimeLibraries: z.array(z.string()), dirty: z.boolean().optional() });
const stateSchema = z.record(z.string(), desiredSchema);
export type DesiredPackState = z.infer<typeof desiredSchema>;
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
}
export async function readDesiredState(file: string): Promise<z.infer<typeof stateSchema>> {
  try { return stateSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { return {}; }
    throw error;
  }
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
export async function prepareInstallSelection(request: InstallPacksRequest): Promise<InstallSelection> {
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  const catalog = request.catalog ?? readCatalogIndex();
  if (catalog.coreVersion !== mode.coreVersion) { throw new Error("Catalog and CLI versions differ"); }
  const root = await realpath(mode.installRoot);
  const previous = (await readDesiredState(request.stateFile))[root] ?? { root, coreVersion: mode.coreVersion, packs: [], runtimeLibraries: [] };
  if (previous.dirty) { throw new Error("Pack installation is dirty. Run nodetool packs doctor --repair."); }
  const tree = await readInstallTree(root, mode.kind === "global");
  const before = tree.packages;
  const names = new Set(before.map((entry) => entry.name));
  const installedIds = catalog.packs.filter((pack) => pack.kind === "node-pack" && names.has(pack.npm.name)).map((pack) => pack.id);
  const requested = expandCatalogPacks(catalog, request.packs);
  const packs = expandCatalogPacks(catalog, [...installedIds, ...request.packs]);
  const byFolder = new Map((catalog.installPins ?? []).map((pin) => [pin.installName ?? pin.name, pin]));
  const replayLibraries = previous.runtimeLibraries.filter((id) => isRuntimeNpmPackageId(id) && RUNTIME_NPM_PACKAGES[id].packageNames.every((name) => {
    const pin = byFolder.get(name);
    return pin && before.some((entry) => entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity);
  }));
  const libraries = [...new Set([...replayLibraries, ...(request.runtimeLibraries ?? []), ...requested.flatMap((pack) => pack.runtimeLibraries)])].sort();
  const scripts = [...new Map(packs.flatMap((pack) => pack.scriptAllowlist).map((pin) => [JSON.stringify(pin), pin])).values()];
  return { root, coreVersion: mode.coreVersion, mode: mode.kind, packs, runtimeLibraries: libraries, scripts, previous, catalog, before, replayLibraries, installedIds,
    initialGlobalLockMissing: mode.kind === "global" && tree.missingLock };
}
