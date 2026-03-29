import type { NodeMetadata } from "../stores/ApiTypes";

interface LivePricingResponse {
  byEndpointId: Record<string, { unit_price: number; billing_unit: string; currency: string }>;
  fetched_at: string;
}

/**
 * Fetches live FAL unit prices for a specific set of endpoint IDs.
 * Merges results into metadataByType in place, marking them source: "live".
 * Returns true if any entries were updated (caller should re-set store state).
 */
export async function fetchLiveFalPricing(
  metadataByType: Record<string, NodeMetadata>,
  endpointIds: string[],
): Promise<boolean> {
  if (endpointIds.length === 0) return false;

  const url = new URL("/api/fal/pricing", window.location.origin);
  for (const id of endpointIds) url.searchParams.append("endpoint_id", id);

  let data: LivePricingResponse;
  try {
    const res = await fetch(url.toString());
    if (!res.ok || res.status === 204) return false;
    data = (await res.json()) as LivePricingResponse;
    if (!data.byEndpointId) return false;
  } catch (err) {
    console.error("[fal-pricing] fetch error:", err);
    return false;
  }

  let updated = 0;
  for (const md of Object.values(metadataByType)) {
    const existing = md.fal_unit_pricing;
    if (!existing) continue;
    const fresh = data.byEndpointId[existing.endpoint_id];
    if (!fresh) continue;
    md.fal_unit_pricing = {
      endpoint_id: existing.endpoint_id,
      unit_price: fresh.unit_price,
      billing_unit: fresh.billing_unit,
      currency: fresh.currency,
      source: "live",
      checked_at: data.fetched_at,
    };
    updated++;
  }
  return updated > 0;
}
