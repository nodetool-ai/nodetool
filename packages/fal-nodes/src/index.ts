import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadFalNodesFromManifest } from "./fal-factory.js";
import type { FalManifestEntry } from "./fal-factory.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export { FalProvider } from "./fal-provider.js";
export { FalRawNode, FalDynamicNode } from "./fal-dynamic.js";
export { createFalNodeClass, loadFalNodesFromManifest } from "./fal-factory.js";
export type { FalManifestEntry } from "./fal-factory.js";

function loadManifest(): FalManifestEntry[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(dir, "fal-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export const FAL_NODES: readonly NodeClass[] = loadFalNodesFromManifest(
  loadManifest()
);

export function registerFalNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of FAL_NODES) {
    registry.register(nodeClass);
  }
}
