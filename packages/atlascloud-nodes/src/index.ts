import type { NodeClass } from "@nodetool-ai/node-sdk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAtlasNodesFromManifest } from "./atlascloud-factory.js";
import type { AtlasManifestEntry } from "./atlascloud-factory.js";

export {
  loadAtlasNodesFromManifest,
  createAtlasNodeClass,
  resolveAssetForAtlas
} from "./atlascloud-factory.js";
export type {
  AtlasManifestEntry,
  AtlasFieldDef,
  AtlasFieldType
} from "./atlascloud-factory.js";

export {
  ATLAS_BASE,
  SUBMIT_PATH,
  atlasPoll,
  atlasSubmit,
  getApiKey,
  pickOutputUrl,
  pollPath
} from "./atlascloud-base.js";
export type { AtlasModality } from "./atlascloud-base.js";

function loadManifest(): AtlasManifestEntry[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(dir, "atlascloud-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export const ATLASCLOUD_NODES: readonly NodeClass[] =
  loadAtlasNodesFromManifest(loadManifest());

export function registerAtlasCloudNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of ATLASCLOUD_NODES) {
    registry.register(nodeClass);
  }
}
