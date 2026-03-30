import type { FalUnitPricing, NodeMetadata } from "../stores/ApiTypes";
import falNodeTypePricingBundle from "@nodetool/fal-node-type-pricing";
import falUnitPricingCatalog from "@nodetool/fal-unit-pricing-catalog";

function readStringField(obj: unknown, key: string): string | undefined {
  if (obj == null || typeof obj !== "object") {
    return undefined;
  }
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === "string" && v.trim() !== "") {
    return v;
  }
  return undefined;
}

/** `writtenAt` from codegen `fal-unit-pricing.json` (FAL /v1/models/pricing snapshot). */
function pricingCatalogWrittenAt(): string | undefined {
  return readStringField(falUnitPricingCatalog, "writtenAt");
}

/** `writtenAt` from `fal-node-type-pricing.json` (by-node map generation time). */
function nodeTypePricingMapWrittenAt(): string | undefined {
  return readStringField(falNodeTypePricingBundle, "writtenAt");
}

/**
 * ISO time to show for bundle-sourced list prices: prefer catalog snapshot time,
 * else node-type map `writtenAt`.
 */
function bundleSnapshotIso(): string | undefined {
  return pricingCatalogWrittenAt() ?? nodeTypePricingMapWrittenAt();
}

/**
 * Merges FAL list prices from the codegen JSON bundle into metadata from `/api/nodes/metadata`
 * (backend `NodeMetadata` does not include `fal_unit_pricing` today).
 *
 * Also fills `checked_at` + `source: "bundle"` when the app already has SDK pricing (no dates)
 * so tooltips show when the list price snapshot was recorded.
 */
export const attachBundleFalUnitPricing = (
  metadataByType: Record<string, NodeMetadata>,
): void => {
  const raw = falNodeTypePricingBundle.byNodeType;
  if (raw == null || typeof raw !== "object") {
    return;
  }
  const checkedAt = bundleSnapshotIso();

  for (const [nodeType, pricing] of Object.entries(raw)) {
    const md = metadataByType[nodeType];
    if (!md || pricing == null) {
      continue;
    }
    const bundleEntry = pricing as FalUnitPricing;

    if (md.fal_unit_pricing == null) {
      md.fal_unit_pricing = {
        ...bundleEntry,
        source: "bundle",
        checked_at: checkedAt,
      };
      continue;
    }

    const existing = md.fal_unit_pricing;
    if (existing.source === "live") {
      continue;
    }
    const hasDate =
      existing.checked_at != null && String(existing.checked_at).trim() !== "";
    if (hasDate) {
      continue;
    }
    if (existing.endpoint_id !== bundleEntry.endpoint_id) {
      continue;
    }
    md.fal_unit_pricing = {
      ...existing,
      source: existing.source ?? "bundle",
      checked_at: checkedAt,
    };
  }
};
