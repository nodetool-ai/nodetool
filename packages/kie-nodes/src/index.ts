import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import { loadKieNodesFromManifest } from "./kie-factory.js";
import type { KieManifestEntry } from "./kie-factory.js";

export { loadKieNodesFromManifest, createKieNodeClass } from "./kie-factory.js";
export type { KieManifestEntry } from "./kie-factory.js";
export {
  getApiKey,
  isRefSet,
  kieExecuteTask,
  kieExecuteOmniDirect,
  kieImageRef,
  parseCreditsConsumed,
  reportKieProviderCost,
  uploadAudioInput,
  uploadImageInput,
  uploadVideoInput
} from "./kie-base.js";
export type { KieExecuteResult } from "./kie-base.js";
export {
  buildVideoClipsFromRefs,
  readClipStart,
  readClipEnd,
  clampClipEnd,
  MAX_VIDEO_CLIP_SPAN
} from "./video-clip.js";
export type { VideoClipPayload } from "./video-clip.js";

function loadManifest(): KieManifestEntry[] {
  return loadPackageAssetJson<KieManifestEntry[]>(
    { pkg: "@nodetool-ai/kie-nodes", path: "kie-manifest.json" },
    import.meta.url
  );
}

export const KIE_NODES: readonly NodeClass[] = loadKieNodesFromManifest(
  loadManifest()
);

export function registerKieNodes(registry: {
  register: (nodeClass: NodeClass) => void;
}): void {
  for (const nodeClass of KIE_NODES) {
    registry.register(nodeClass);
  }
}
