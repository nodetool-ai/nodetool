import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadFalNodesFromManifest } from "./fal-factory.js";
import type { FalManifestEntry } from "./fal-factory.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerFalCostReconciler } from "./fal-billing.js";

export { FalProvider } from "./fal-provider.js";
export { FalRawNode, FalDynamicNode } from "./fal-dynamic.js";
export { createFalNodeClass, loadFalNodesFromManifest } from "./fal-factory.js";
export type { FalManifestEntry } from "./fal-factory.js";
export { estimateFalCost, reportFalCost, getFalPricing } from "./fal-cost.js";
export type { FalCostEstimate, FalPricingEntry } from "./fal-cost.js";
export { fetchFalBillingCost, registerFalCostReconciler } from "./fal-billing.js";

// Make FAL request costs reconcilable to actuals as soon as this package loads.
registerFalCostReconciler();

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
