import type { FalUnitPricing, NodeMetadata } from "../stores/ApiTypes";
import falNodeTypePricingBundle from "@nodetool/fal-node-type-pricing";

/**
 * Merges FAL list prices from the codegen JSON bundle into metadata from `/api/nodes/metadata`
 * (backend `NodeMetadata` does not include `fal_unit_pricing` today).
 */
export const attachBundleFalUnitPricing = (
  metadataByType: Record<string, NodeMetadata>,
): void => {
  const raw = falNodeTypePricingBundle.byNodeType;
  if (raw == null || typeof raw !== "object") {
    return;
  }
  for (const [nodeType, pricing] of Object.entries(raw)) {
    const md = metadataByType[nodeType];
    if (!md || pricing == null) {
      continue;
    }
    if (md.fal_unit_pricing != null) {
      continue;
    }
    md.fal_unit_pricing = pricing as FalUnitPricing;
  }
};
