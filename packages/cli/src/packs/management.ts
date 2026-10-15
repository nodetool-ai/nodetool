import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { DesiredPackState } from "./install-selection.js";
import { expandCatalogPacks } from "./install-selection.js";
import type { InstalledPackSnapshot } from "./installed.js";

export interface PackListRow {
  readonly id: string;
  readonly kind: "core" | "node-pack" | "runtime-library";
  readonly installed: boolean;
  readonly version: string | null;
  readonly installBytes: number | null;
  readonly nodeCount: number | null;
  readonly requiredBy: readonly string[];
}

export function requestedInstallIds(catalog: NodeCatalogIndex, ids: readonly string[]): { packs: string[]; runtimeLibraries: string[] } {
  const packs: string[] = [];
  const runtimeLibraries: string[] = [];
  for (const id of new Set(ids)) {
    const pack = catalog.packs.find(entry => entry.id === id);
    if (pack) {
      if (pack.kind === "core") {
        throw new Error(`Pack ${id} ships with the CLI and cannot be installed separately`);
      }
      packs.push(id);
    } else if (isRuntimeNpmPackageId(id)) {
      runtimeLibraries.push(id);
    } else {
      throw new Error(`Unknown node pack or runtime library: ${id}`);
    }
  }
  return { packs: packs.sort(), runtimeLibraries: runtimeLibraries.sort() };
}

/** The installed tree decides availability. Desired intent never makes a package installed. */
export function listPackRows(catalog: NodeCatalogIndex, snapshot: InstalledPackSnapshot, installedRuntimeIds: ReadonlySet<string> = new Set()): PackListRow[] {
  const installed = new Map(snapshot.packs.map(pack => [pack.id, pack.version]));
  const rows: PackListRow[] = catalog.packs.map(pack => ({
    id: pack.id, kind: pack.kind, installed: installed.has(pack.id), version: installed.get(pack.id) ?? null,
    installBytes: pack.installBytes, nodeCount: pack.nodeCount,
    requiredBy: catalog.packs.filter(candidate => installed.has(candidate.id) && candidate.requires.includes(pack.id)).map(candidate => candidate.id).sort()
  }));
  for (const [id, runtime] of Object.entries(RUNTIME_NPM_PACKAGES)) {
    rows.push({ id, kind: "runtime-library", installed: installedRuntimeIds.has(id),
      version: installedRuntimeIds.has(id) ? runtime.npmPackages.join(", ") : null,
      installBytes: null, nodeCount: null,
      requiredBy: catalog.packs.filter(pack => installed.has(pack.id) && pack.runtimeLibraries.includes(id)).map(pack => pack.id).sort() });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
}

export function explainPack(catalog: NodeCatalogIndex, snapshot: InstalledPackSnapshot, target: string, installedRuntimeIds: ReadonlySet<string> = new Set()) {
  const id = catalog.owners[target] ?? target;
  const pack = catalog.packs.find(entry => entry.id === id);
  if (!pack) {
    if (!isRuntimeNpmPackageId(id)) {
      throw new Error(`Unknown node type, pack or runtime library: ${target}`);
    }
    return { target, id, kind: "runtime-library", installed: installedRuntimeIds.has(id), packages: RUNTIME_NPM_PACKAGES[id].npmPackages,
      requiredBy: catalog.packs.filter(entry => entry.runtimeLibraries.includes(id)).map(entry => entry.id).sort() };
  }
  return { target, id, kind: pack.kind, npm: pack.npm.name, version: pack.npm.version,
    installed: snapshot.packs.some(entry => entry.id === id),
    requires: expandCatalogPacks(catalog, pack.requires).map(entry => entry.id), runtimeLibraries: pack.runtimeLibraries,
    requiredBy: catalog.packs.filter(entry => entry.requires.includes(id)).map(entry => entry.id).sort() };
}

export function restoreWarning(snapshot: InstalledPackSnapshot, desired: DesiredPackState | undefined): string | null {
  if (!desired || desired.coreVersion === snapshot.mode.coreVersion) {
    return null;
  }
  const installed = new Set(snapshot.packs.map(pack => pack.id));
  const missing = [...new Set(desired.packs)].filter(id => !installed.has(id)).sort();
  if (missing.length === 0) {
    return null;
  }
  return `${missing.length} pack${missing.length === 1 ? "" : "s"} from ${desired.coreVersion} ${missing.length === 1 ? "is" : "are"} not installed for ${snapshot.mode.coreVersion}: ${missing.join(", ")}. Run "nodetool packs add --restore".`;
}

/** Removal retains any requested pack still required by another installed pack. */
export function planPackRemoval(catalog: NodeCatalogIndex, installedIds: readonly string[], requestedIds: readonly string[]) {
  const requested = requestedInstallIds(catalog, requestedIds);
  const installed = new Set(installedIds);
  const wanted = new Set(requested.packs);
  const other = installedIds.filter(id => !wanted.has(id));
  const needed = new Set(expandCatalogPacks(catalog, other).map(pack => pack.id));
  const remove = requested.packs.filter(id => installed.has(id) && !needed.has(id));
  const kept = requested.packs.filter(id => needed.has(id));
  const removed = new Set(remove);
  const remaining = installedIds.filter(id => !removed.has(id));
  return { remove, kept, remaining, runtimeLibraries: requested.runtimeLibraries };
}

export function restartNotice(ids: readonly string[]): string {
  return `Restart running "nodetool serve" and "nodetool mcp serve" processes to load ${[...new Set(ids)].sort().join(", ")}.`;
}
