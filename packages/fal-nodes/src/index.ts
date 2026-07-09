import type { NodeClass } from "@nodetool-ai/node-sdk";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import { loadFalNodesFromManifest } from "./fal-factory.js";
import type { FalManifestEntry } from "./fal-factory.js";
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
  return loadPackageAssetJson<FalManifestEntry[]>(
    { pkg: "@nodetool-ai/fal-nodes", path: "fal-manifest.json" },
    import.meta.url
  );
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
