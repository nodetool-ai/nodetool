import type { KieUnitPricing, NodeMetadata } from "../stores/ApiTypes";

interface LiveKiePricingResponse {
  byModelId: Record<
    string,
    {
      model_id: string;
      unit_price: number;
      billing_unit: string;
      currency: "credits";
      usd_price?: number;
      tier_count?: number;
      pricing_url?: string;
    }
  >;
  fetched_at: string;
}

/**
 * Fetches live kie.ai list prices for specific model IDs.
 * Does NOT mutate `metadataByType`; instead returns a map of node type →
 * fresh `kie_unit_pricing` (marked source: "live") for the entries that were
 * updated, or null when nothing changed. The caller merges these into new
 * metadata objects so per-node selectors re-render.
 */
export async function fetchLiveKiePricing(
  metadataByType: Record<string, NodeMetadata>,
  modelIds: string[],
): Promise<Record<string, KieUnitPricing> | null> {
  if (modelIds.length === 0) {
    return null;
  }

  const url = new URL("/api/kie/pricing", window.location.origin);
  for (const id of modelIds) {
    url.searchParams.append("model_id", id);
  }

  let data: LiveKiePricingResponse;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      return null;
    }
    data = (await res.json()) as LiveKiePricingResponse;
    if (!data.byModelId) {
      return null;
    }
  } catch (err) {
    console.error("[kie-pricing] fetch error:", err);
    return null;
  }

  const updated: Record<string, KieUnitPricing> = {};
  let updatedCount = 0;
  for (const [nodeType, md] of Object.entries(metadataByType)) {
    const existing = md.kie_unit_pricing;
    if (!existing) {
      continue;
    }
    const fresh = data.byModelId[existing.model_id];
    if (!fresh) {
      continue;
    }
    updated[nodeType] = {
      model_id: fresh.model_id,
      unit_price: fresh.unit_price,
      billing_unit: fresh.billing_unit,
      currency: "credits",
      usd_price: fresh.usd_price,
      tier_count: fresh.tier_count,
      pricing_url: fresh.pricing_url,
      source: "live",
      checked_at: data.fetched_at,
    };
    updatedCount++;
  }
  return updatedCount > 0 ? updated : null;
}
