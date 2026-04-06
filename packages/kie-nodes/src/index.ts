import type { NodeClass } from "@nodetool/node-sdk";
import { loadKieNodesFromManifest } from "./kie-factory.js";
import type { KieManifestEntry } from "./kie-factory.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export { loadKieNodesFromManifest, createKieNodeClass } from "./kie-factory.js";
export type { KieManifestEntry } from "./kie-factory.js";

function loadManifest(): KieManifestEntry[] {
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifestPath = join(dir, "kie-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf8"));
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
