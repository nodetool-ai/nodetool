import { readCatalogNodes, type NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import type { InstalledPackSnapshot } from "@nodetool-ai/pack-manager/packs/installed";
import { verifyPackLoads } from "./packs/installer-load-check.js";

/** Verify admitted node packs with the full registry, excluding separately verified CLI features. */
export async function verifyNodePacks(snapshot: InstalledPackSnapshot, catalog: NodeCatalogIndex, ids: readonly string[]): Promise<void> {
  const nodePacks = new Set(catalog.packs.filter((pack) => pack.kind !== "cli-feature").map((pack) => pack.id));
  await verifyPackLoads(snapshot, catalog, readCatalogNodes(), ids.filter((id) => nodePacks.has(id)));
}
