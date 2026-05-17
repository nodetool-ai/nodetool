/**
 * Fetch per-endpoint unit pricing from the FAL pricing API.
 *
 * Mirrors the batching/retry behaviour of `packages/websocket/src/routes/fal-pricing.ts`
 * so the codegen-time snapshot matches what the runtime route returns. Kept
 * standalone (no cross-package imports) because codegen runs before the
 * workspace is built and importing from `@nodetool-ai/websocket` would force a
 * build dependency on a heavy server package.
 */

const FAL_PRICING_URL = "https://api.fal.ai/v1/models/pricing";

/** Per-batch size when calling the FAL pricing endpoint. */
const BATCH_SIZE = 50;

/** Max retries on HTTP 429 (rate limit). */
const MAX_RETRIES = 3;

export interface PricingEntry {
  unit_price: number;
  billing_unit: string;
  currency: string;
}

interface FalPricingApiResponse {
  prices?: Array<{
    endpoint_id: string;
    unit_price: number;
    unit: string;
    currency: string;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBatch(
  batch: string[],
  apiKey: string
): Promise<Record<string, PricingEntry>> {
  const url = new URL(FAL_PRICING_URL);
  for (const id of batch) {
    url.searchParams.append("endpoint_id", id);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Key ${apiKey}` }
    });

    if (res.ok) {
      const json = (await res.json()) as FalPricingApiResponse;
      const out: Record<string, PricingEntry> = {};
      for (const row of json.prices ?? []) {
        out[row.endpoint_id] = {
          unit_price: row.unit_price,
          billing_unit: row.unit,
          currency: row.currency
        };
      }
      return out;
    }

    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      const backoff = 4000 * (attempt + 1);
      console.warn(
        `[fal-pricing-fetch] 429 rate limit, retrying in ${backoff}ms ` +
          `(batch of ${batch.length})`
      );
      await sleep(backoff);
      continue;
    }

    const body = await res.text().catch(() => "");
    console.warn(
      `[fal-pricing-fetch] HTTP ${res.status} for batch of ${batch.length}: ` +
        body.slice(0, 200)
    );
    break;
  }
  return {};
}

/**
 * Fetch unit prices for the given endpoint IDs.
 *
 * Splits into batches of {@link BATCH_SIZE}, retries each batch on 429, and
 * never throws — endpoints that fail to resolve are simply omitted from the
 * returned map.
 */
export async function fetchFalPricing(
  endpointIds: readonly string[],
  apiKey: string
): Promise<Record<string, PricingEntry>> {
  const unique = [...new Set(endpointIds)];
  const result: Record<string, PricingEntry> = {};

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const partial = await fetchBatch(batch, apiKey);
    Object.assign(result, partial);
  }

  return result;
}
