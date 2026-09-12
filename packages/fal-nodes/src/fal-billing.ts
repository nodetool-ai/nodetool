/**
 * FAL billing-events client for cost reconciliation.
 *
 * Looks up the *actual* billed cost of a single FAL request, so the estimate
 * recorded at call time can be reconciled into the real charge. The wire call
 * is `falRequestCost` in `@nodetool-ai/runtime` — the same Platform API client
 * the provider's `listGenerations` / `getGeneration` use, so there is one
 * client for `GET /v1/models/billing-events` and not two that drift.
 *
 * The billing API requires an admin-scoped key. We reuse the configured
 * `FAL_API_KEY`; if it lacks admin scope the request 401s/403s and we fall
 * back to the estimate. Billing events also lag the request by seconds to a
 * minute, so the lookup retries with backoff.
 */

import {
  FalPlatformAuthError,
  falRequestCost,
  registerCostReconciler,
  type ReconciledCost
} from "@nodetool-ai/runtime";

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

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const billed = await falRequestCost(apiKey, requestId);
      if (billed) return billed;
      // No event posted yet — fall through to retry.
    } catch (err) {
      // A key without billing scope will not gain it by being asked again.
      if (err instanceof FalPlatformAuthError) return null;
      // Network / parse error — retry.
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
