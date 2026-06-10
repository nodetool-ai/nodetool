import type { FalUnitPricing, NodeMetadata } from "../stores/ApiTypes";

interface LivePricingResponse {
  byEndpointId: Record<string, { unit_price: number; billing_unit: string; currency: string }>;
  fetched_at: string;
}

/**
 * Fetches live FAL unit prices for a specific set of endpoint IDs.
 * Does NOT mutate `metadataByType`; instead returns a map of node type →
 * fresh `fal_unit_pricing` (marked source: "live") for the entries that were
 * updated, or null when nothing changed. The caller merges these into new
 * metadata objects so per-node selectors re-render.
 */
export async function fetchLiveFalPricing(
  metadataByType: Record<string, NodeMetadata>,
  endpointIds: string[],
): Promise<Record<string, FalUnitPricing> | null> {
  if (endpointIds.length === 0) return null;

  const url = new URL("/api/fal/pricing", window.location.origin);
  for (const id of endpointIds) url.searchParams.append("endpoint_id", id);

  let data: LivePricingResponse;
  try {
    const res = await fetch(url.toString());
    if (!res.ok || res.status === 204) return null;
    data = (await res.json()) as LivePricingResponse;
    if (!data.byEndpointId) return null;
  } catch (err) {
    console.error("[fal-pricing] fetch error:", err);
    return null;
  }

  const updated: Record<string, FalUnitPricing> = {};
  let updatedCount = 0;
  for (const [nodeType, md] of Object.entries(metadataByType)) {
    const existing = md.fal_unit_pricing;
    if (!existing) continue;
    const fresh = data.byEndpointId[existing.endpoint_id];
    if (!fresh) continue;
    updated[nodeType] = {
      endpoint_id: existing.endpoint_id,
      unit_price: fresh.unit_price,
      billing_unit: fresh.billing_unit,
      currency: fresh.currency,
      source: "live",
      checked_at: data.fetched_at,
    };
    updatedCount++;
  }
  return updatedCount > 0 ? updated : null;
}
