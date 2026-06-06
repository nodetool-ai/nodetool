import type { NodeClass } from "@nodetool-ai/node-sdk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(dir, "together-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
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
