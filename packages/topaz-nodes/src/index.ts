import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadTopazNodesFromManifest } from "./topaz-factory.js";
import type { TopazManifestEntry } from "./topaz-factory.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export {
  loadTopazNodesFromManifest,
  createTopazNodeClass
} from "./topaz-factory.js";
export type { TopazManifestEntry, TopazFieldDef } from "./topaz-factory.js";
export {
  getApiKey,
  refToBytes,
  probeVideoMetadata,
  topazImageRef,
  topazExecuteImageTask,
  topazExecuteVideoTask,
  sourceContainerFromRef,
  containerContentType
} from "./topaz-base.js";
export type {
  TopazImageSpec,
  TopazVideoSpec,
  TopazVideoMetadata
} from "./topaz-base.js";

function loadManifest(): TopazManifestEntry[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(dir, "topaz-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export const TOPAZ_NODES: readonly NodeClass[] = loadTopazNodesFromManifest(
  loadManifest()
);

export function registerTopazNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of TOPAZ_NODES) {
    registry.register(nodeClass);
  }
}
