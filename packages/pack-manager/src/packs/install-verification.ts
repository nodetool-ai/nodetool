import type { InstallPackagePin } from "@nodetool-ai/pack-core";
import type { InstallSelection } from "./install-selection.js";
import type { TreePackage, VerificationPin } from "./install-tree.js";
import { packPins, runtimeLibraryPins, type PinnedSpec } from "./project.js";

export interface ProjectPins {
  /** The project's direct dependencies with their exact specs. */
  readonly roots: readonly PinnedSpec[];
  /** Release pins the installed tree must match. */
  readonly pins: readonly VerificationPin[];
  /** Shared-identity libraries, which may exist at most once. */
  readonly shared: readonly InstallPackagePin[];
}

/** Collect every pin before npm runs, so a missing pin fails before any download. */
export function projectPins(selection: Pick<InstallSelection, "catalog" | "packs" | "runtimeLibraries" | "scripts">): ProjectPins {
  const roots = [...selection.packs.flatMap((pack) => packPins(selection.catalog, pack)),
    ...selection.runtimeLibraries.flatMap((id) => runtimeLibraryPins(selection.catalog, id))];
  const pins: VerificationPin[] = [...roots.map((root) => ({ ...root.pin, installPath: `node_modules/${root.folder}` })), ...selection.scripts];
  if (pins.some((pin) => !pin.integrity || pin.integrity === "PENDING")) { throw new Error("Installation requires published integrity pins"); }
  return { roots, pins, shared: (selection.catalog.installPins ?? []).filter((pin) => pin.shared) };
}

/**
 * Check a pack project after npm installed it and before any install script
 * or import runs: release pins, one NodeTool version, no second CLI, and at
 * most one copy of each shared-identity library.
 */
export function verifyProjectTree(tree: readonly TreePackage[], pins: ProjectPins, coreVersion: string): void {
  const byName = new Map<string, TreePackage[]>();
  for (const entry of tree) {
    const entries = byName.get(entry.name) ?? [];
    entries.push(entry);
    byName.set(entry.name, entries);
    if (entry.name === "@nodetool-ai/cli") { throw new Error(`Pack project contains another CLI core package: ${entry.path}`); }
    if (entry.name.startsWith("@nodetool-ai/") && entry.version !== coreVersion) { throw new Error(`Wrong NodeTool version: ${entry.path}`); }
  }
  for (const pin of pins.pins) {
    const entries = (byName.get(pin.name) ?? []).filter((entry) => !pin.installPath || entry.path === pin.installPath);
    if (!entries.length || entries.some((entry) => entry.version !== pin.version || entry.integrity !== pin.integrity)) {
      throw new Error(`Package integrity or version does not match pin: ${pin.name}`);
    }
  }
  for (const pin of pins.shared) {
    const entries = byName.get(pin.name) ?? [];
    if (entries.length > 1) { throw new Error(`Shared library must exist exactly once: ${pin.name}`); }
    if (entries.some((entry) => entry.version !== pin.version || entry.integrity !== pin.integrity)) {
      throw new Error(`Package integrity or version does not match pin: ${pin.name}`);
    }
  }
}
