import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";

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
  atlasDownload,
  atlasPoll,
  atlasSubmit,
  getApiKey,
  pickOutputUrl,
  pollPath
} from "./atlascloud-base.js";
export type { AtlasModality } from "./atlascloud-base.js";

function loadManifest(): AtlasManifestEntry[] {
  return loadPackageAssetJson<AtlasManifestEntry[]>(
    { pkg: "@nodetool-ai/atlascloud-nodes", path: "atlascloud-manifest.json" },
    import.meta.url
  );
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
