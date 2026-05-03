import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { loadReplicateNodesFromManifest } from "./replicate-factory.js";
import type { ReplicateManifestEntry } from "./replicate-factory.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export { loadReplicateNodesFromManifest, createReplicateNodeClass } from "./replicate-factory.js";
export type { ReplicateManifestEntry } from "./replicate-factory.js";
export * from "./replicate-base.js";

function loadManifest(): ReplicateManifestEntry[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(dir, "replicate-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export const REPLICATE_NODES: readonly NodeClass[] = loadReplicateNodesFromManifest(
  loadManifest()
);

export function registerReplicateNodes(registry: NodeRegistry): void {
  for (const nodeClass of REPLICATE_NODES) {
    registry.register(nodeClass);
  }
}
