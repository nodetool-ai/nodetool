/**
 * In-memory snapshot of the most recent pack load.
 *
 * Kept in its own tiny module (no built-in-node imports) so router code can
 * pull it without dragging the whole pack ecosystem into the import graph.
 */

import {
  loadInstalledPacks,
  type LoadedPackResult,
  type LoadPacksOptions,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";

let snapshot: LoadedPackResult[] = [];

/** Replace the snapshot. Called by {@link bootstrapNodeRegistry} at startup. */
export function setPackSnapshot(results: readonly LoadedPackResult[]): void {
  snapshot = [...results];
}

/** Read the current snapshot. */
export function getPackSnapshot(): readonly LoadedPackResult[] {
  return snapshot;
}

/**
 * Re-scan installed packs and register any new ones into the existing registry.
 *
 * Built-ins, already-registered third-party nodes, and reserved namespaces are
 * untouched — the loader's collision guard makes a second call a no-op for
 * packs that have already loaded. New packs (just trusted via the UI, or
 * freshly installed) get registered live.
 *
 * Note: this is a *soft* reload — removing trust from a pack does not unload
 * its already-registered nodes; that requires a server restart.
 */
export async function reloadPacks(
  registry: NodeRegistry,
  options: Pick<LoadPacksOptions, "searchPaths" | "trust"> = {}
): Promise<readonly LoadedPackResult[]> {
  const results = await loadInstalledPacks(registry, options);
  setPackSnapshot(results);
  return results;
}
