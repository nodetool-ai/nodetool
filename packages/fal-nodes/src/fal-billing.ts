/**
 * FAL billing-events client.
 *
 * Looks up the *actual* billed cost of a single FAL request via
 * `GET https://api.fal.ai/v1/models/billing-events?request_id=…`, so the
 * estimate recorded at call time can be reconciled into the real charge.
 *
 * The billing API requires an admin-scoped key. We reuse the configured
 * `FAL_API_KEY`; if it lacks admin scope the request 401s/403s and we fall
 * back to the estimate. Billing events also lag the request by seconds to a
 * minute, so the lookup retries with backoff.
 *
 * Response shape (per FAL docs):
 *   { billing_events: [{ request_id, endpoint_id, timestamp,
 *       output_units, unit_price, percent_discount,
 *       cost_estimate_nano_usd }], next_cursor, has_more }
 */

import {
  registerCostReconciler,
  type ReconciledCost
} from "@nodetool-ai/runtime";

const BILLING_URL = "https://api.fal.ai/v1/models/billing-events";
const NANO_PER_USD = 1_000_000_000;

interface FalBillingEvent {
  request_id: string;
  endpoint_id?: string;
  output_units?: number | null;
  unit_price?: number | null;
  cost_estimate_nano_usd?: number | null;
}

interface FalBillingResponse {
  billing_events?: FalBillingEvent[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch the actual billed cost (USD) for a single FAL request id. Returns
 * `null` when the key is not admin-scoped, the event never appears, or any
 * error occurs — callers keep the estimate in that case.
 */
export async function fetchFalBillingCost(
  apiKey: string,
  requestId: string,
  opts: { retries?: number; retryDelayMs?: number } = {}
): Promise<ReconciledCost | null> {
  const retries = opts.retries ?? 5;
  const retryDelayMs = opts.retryDelayMs ?? 6000;
  const url = `${BILLING_URL}?request_id=${encodeURIComponent(requestId)}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Key ${apiKey}` }
      });
      // 401/403 → key lacks admin scope; retrying won't help.
      if (res.status === 401 || res.status === 403) return null;
      if (res.ok) {
        const body = (await res.json()) as FalBillingResponse;
        const event = body.billing_events?.find(
          (e) => e.request_id === requestId
        );
        const nano = event?.cost_estimate_nano_usd;
        if (event && typeof nano === "number" && Number.isFinite(nano)) {
          return {
            cost: nano / NANO_PER_USD,
            currency: "USD",
            quantity: event.output_units ?? null,
            unit_price: event.unit_price ?? null
          };
        }
        // Event not posted yet — fall through to retry.
      }
    } catch {
      // Network/parse error — retry.
    }
    if (attempt < retries) await sleep(retryDelayMs);
  }
  return null;
}

/** Register the FAL reconciler so the runner can refine FAL estimates. */
export function registerFalCostReconciler(): void {
  registerCostReconciler("fal", async ({ requestId, secrets }) => {
    const apiKey = secrets?.FAL_API_KEY || process.env.FAL_API_KEY || "";
    if (!apiKey) return null;
    return fetchFalBillingCost(apiKey, requestId);
  });
}
