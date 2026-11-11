import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import { loadTopazNodesFromManifest } from "./topaz-factory.js";
import type { TopazManifestEntry } from "./topaz-factory.js";

export {
  loadTopazNodesFromManifest,
  createTopazNodeClass
} from "./topaz-factory.js";
export type { TopazManifestEntry, TopazFieldDef } from "./topaz-factory.js";
export {
  refToBytes,
  probeVideoMetadata,
  topazImageRef,
  topazImageFields,
  topazVideoCreateBody,
  topazExecuteImageTask,
  topazExecuteVideoTask,
  sourceContainerFromRef
} from "./topaz-base.js";
export type {
  TopazJob,
  TopazVideoJob,
  TopazVideoMetadata
} from "./topaz-base.js";

function loadManifest(): TopazManifestEntry[] {
  return loadPackageAssetJson<TopazManifestEntry[]>(
    { pkg: "@nodetool-ai/topaz-nodes", path: "topaz-manifest.json" },
    import.meta.url
  );
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
