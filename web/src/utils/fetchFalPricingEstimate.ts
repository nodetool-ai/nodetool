import { BASE_URL } from "../stores/BASE_URL";

export interface FalPricingEstimate {
  endpoint_id: string;
  estimate_type: "historical_api_price" | "unit_price";
  total_cost: number;
  currency: string;
  fetched_at?: string;
  cached?: boolean;
}

/**
 * Fetches a per-run cost estimate from our backend proxy (POST fal.ai
 * /v1/models/pricing/estimate with historical_api_price, call_quantity=1).
 */
export async function fetchFalPricingEstimate(
  endpointId: string,
): Promise<FalPricingEstimate | null> {
  const url = `${BASE_URL}/api/fal/pricing/estimate`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint_id: endpointId,
        estimate_type: "historical_api_price",
        call_quantity: 1,
      }),
    });
    if (res.status === 204) {
      return null;
    }
    if (!res.ok) {
      console.warn("[fal-pricing-estimate] request failed", {
        url,
        status: res.status,
      });
      return null;
    }
    return (await res.json()) as FalPricingEstimate;
  } catch (err) {
    console.warn("[fal-pricing-estimate] fetch error", err);
    return null;
  }
}
