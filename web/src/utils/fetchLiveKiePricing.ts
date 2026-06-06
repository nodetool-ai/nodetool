import type { NodeMetadata } from "../stores/ApiTypes";

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
 * Fetches live kie.ai list prices for specific model IDs and merges into metadata.
 */
export async function fetchLiveKiePricing(
  metadataByType: Record<string, NodeMetadata>,
  modelIds: string[],
): Promise<boolean> {
  if (modelIds.length === 0) {
    return false;
  }

  const url = new URL("/api/kie/pricing", window.location.origin);
  for (const id of modelIds) {
    url.searchParams.append("model_id", id);
  }

  let data: LiveKiePricingResponse;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      return false;
    }
    data = (await res.json()) as LiveKiePricingResponse;
    if (!data.byModelId) {
      return false;
    }
  } catch (err) {
    console.error("[kie-pricing] fetch error:", err);
    return false;
  }

  let updated = 0;
  for (const md of Object.values(metadataByType)) {
    const existing = md.kie_unit_pricing;
    if (!existing) {
      continue;
    }
    const fresh = data.byModelId[existing.model_id];
    if (!fresh) {
      continue;
    }
    md.kie_unit_pricing = {
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
    updated++;
  }
  return updated > 0;
}
