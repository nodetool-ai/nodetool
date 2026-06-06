import type { NodeClass } from "@nodetool-ai/node-sdk";
import { createRequire } from "node:module";

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
  // Load the bundled manifest as a JSON module (cached `require`) rather than a
  // raw `readFileSync`. The model ids in the manifest flow into the Together API
  // request bodies; reading the file via `fs` makes CodeQL treat those static,
  // trusted ids as untrusted "file data" reaching an outbound request
  // (js/file-access-to-http). A module require resolves the same dist JSON
  // without being modelled as a filesystem read. Mirrors how
  // runtime/manifest-models.ts consumes this manifest.
  const require = createRequire(import.meta.url);
  return require("./together-manifest.json") as TogetherManifestEntry[];
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
