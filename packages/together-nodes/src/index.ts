import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";

import { loadTogetherNodesFromManifest } from "./together-factory.js";
import type { TogetherManifestEntry } from "./together-factory.js";

export {
  loadTogetherNodesFromManifest,
  createTogetherNodeClass
} from "./together-factory.js";
export type {
  TogetherManifestEntry,
  TogetherFieldDef,
  TogetherFieldType,
  TogetherModality,
  TogetherOutputType
} from "./together-factory.js";

export {
  getApiKey,
  isSafeHttpUrl,
  resolveAssetBytes,
  resolveVideoDimensions,
  togetherGenerateImage,
  togetherGenerateVideo,
  togetherTextToSpeech,
  togetherTranscribe
} from "./together-base.js";

function loadManifest(): TogetherManifestEntry[] {
  return loadPackageAssetJson<TogetherManifestEntry[]>(
    { pkg: "@nodetool-ai/together-nodes", path: "together-manifest.json" },
    import.meta.url
  );
}

export const TOGETHER_NODES: readonly NodeClass[] =
  loadTogetherNodesFromManifest(loadManifest());

export function registerTogetherNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of TOGETHER_NODES) {
    registry.register(nodeClass);
  }
}
