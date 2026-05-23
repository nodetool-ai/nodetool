import type { KieUnitPricing, NodeMetadata } from "../stores/ApiTypes";
import kieNodeTypePricingBundle from "@nodetool/kie-node-type-pricing";
import kieUnitPricingCatalog from "@nodetool/kie-unit-pricing-catalog";

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

function pricingCatalogWrittenAt(): string | undefined {
  return readStringField(kieUnitPricingCatalog, "writtenAt");
}

function nodeTypePricingMapWrittenAt(): string | undefined {
  return readStringField(kieNodeTypePricingBundle, "writtenAt");
}

function bundleSnapshotIso(): string | undefined {
  return pricingCatalogWrittenAt() ?? nodeTypePricingMapWrittenAt();
}

/**
 * Merges kie.ai list prices from the codegen JSON bundle into node metadata.
 */
export const attachBundleKieUnitPricing = (
  metadataByType: Record<string, NodeMetadata>,
): void => {
  const raw = kieNodeTypePricingBundle.byNodeType;
  if (raw == null || typeof raw !== "object") {
    return;
  }
  const checkedAt = bundleSnapshotIso();

  for (const [nodeType, pricing] of Object.entries(raw)) {
    const md = metadataByType[nodeType];
    if (!md || pricing == null) {
      continue;
    }
    const bundleEntry = pricing as KieUnitPricing;

    if (md.kie_unit_pricing == null) {
      md.kie_unit_pricing = {
        ...bundleEntry,
        source: "bundle",
        checked_at: checkedAt,
      };
      continue;
    }

    const existing = md.kie_unit_pricing;
    if (existing.source === "live") {
      continue;
    }
    const hasDate =
      existing.checked_at != null && String(existing.checked_at).trim() !== "";
    if (hasDate) {
      continue;
    }
    if (existing.model_id !== bundleEntry.model_id) {
      continue;
    }
    md.kie_unit_pricing = {
      ...existing,
      source: existing.source ?? "bundle",
      checked_at: checkedAt,
    };
  }
};
