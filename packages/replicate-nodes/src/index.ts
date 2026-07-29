import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import { loadReplicateNodesFromManifest } from "./replicate-factory.js";
import type { ReplicateManifestEntry } from "./replicate-factory.js";

export { loadReplicateNodesFromManifest, createReplicateNodeClass } from "./replicate-factory.js";
export type { ReplicateManifestEntry } from "./replicate-factory.js";
export * from "./replicate-base.js";

function loadManifest(): ReplicateManifestEntry[] {
  return loadPackageAssetJson<ReplicateManifestEntry[]>(
    { pkg: "@nodetool-ai/replicate-nodes", path: "replicate-manifest.json" },
    import.meta.url
  );
}

export const REPLICATE_NODES: readonly NodeClass[] = loadReplicateNodesFromManifest(
  loadManifest()
);

export function registerReplicateNodes(registry: NodeRegistry): void {
  for (const nodeClass of REPLICATE_NODES) {
    registry.register(nodeClass);
  }
}
