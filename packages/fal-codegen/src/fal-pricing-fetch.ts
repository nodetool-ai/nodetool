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
const MAX_RETRIES_429 = 4;

/** Delay between successive successful batches, to avoid tripping 429s. */
const INTER_BATCH_DELAY_MS = 250;

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

type BatchOutcome =
  | { kind: "ok"; prices: Record<string, PricingEntry> }
  | { kind: "not_found" } // 404 — at least one endpoint in the batch is unknown
  | { kind: "fail"; status: number; body: string };

async function fetchBatchOnce(
  batch: readonly string[],
  apiKey: string
): Promise<BatchOutcome> {
  const url = new URL(FAL_PRICING_URL);
  for (const id of batch) url.searchParams.append("endpoint_id", id);

  for (let attempt = 0; attempt < MAX_RETRIES_429; attempt++) {
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
      return { kind: "ok", prices: out };
    }

    if (res.status === 404) {
      return { kind: "not_found" };
    }

    if (res.status === 429 && attempt < MAX_RETRIES_429 - 1) {
      // Honor Retry-After if present, else exponential-ish backoff.
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
      const backoff = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 3000 * Math.pow(2, attempt);
      console.warn(
        `[fal-pricing-fetch] 429 rate limit, retrying in ${backoff}ms ` +
          `(batch of ${batch.length}, attempt ${attempt + 1}/${MAX_RETRIES_429})`
      );
      await sleep(backoff);
      continue;
    }

    const body = await res.text().catch(() => "");
    return { kind: "fail", status: res.status, body: body.slice(0, 200) };
  }
  return { kind: "fail", status: 429, body: "exhausted 429 retries" };
}

/**
 * Resolve prices for one batch, recursively halving on 404 so a single
 * unpriced/unknown endpoint does not poison its 49 batch-mates. Bottoms out at
 * size-1 batches: a 404 there means the endpoint really is unpriced and we
 * silently skip it.
 */
async function fetchBatchWithSplit(
  batch: readonly string[],
  apiKey: string,
  unknownIds: string[]
): Promise<Record<string, PricingEntry>> {
  if (batch.length === 0) return {};

  const outcome = await fetchBatchOnce(batch, apiKey);
  if (outcome.kind === "ok") return outcome.prices;

  if (outcome.kind === "fail") {
    console.warn(
      `[fal-pricing-fetch] HTTP ${outcome.status} for batch of ${batch.length} ` +
        `(giving up on this batch): ${outcome.body}`
    );
    return {};
  }

  // 404 — bisect to isolate the unknown id(s).
  if (batch.length === 1) {
    unknownIds.push(batch[0]);
    return {};
  }
  const mid = Math.floor(batch.length / 2);
  const left = batch.slice(0, mid);
  const right = batch.slice(mid);
  await sleep(INTER_BATCH_DELAY_MS);
  const leftPrices = await fetchBatchWithSplit(left, apiKey, unknownIds);
  await sleep(INTER_BATCH_DELAY_MS);
  const rightPrices = await fetchBatchWithSplit(right, apiKey, unknownIds);
  return { ...leftPrices, ...rightPrices };
}

/**
 * Fetch unit prices for the given endpoint IDs.
 *
 * Splits into batches of {@link BATCH_SIZE}. Each batch retries on 429 with
 * `Retry-After`-aware backoff, and bisects on 404 so that one unknown endpoint
 * does not lose pricing for its batch-mates. Never throws — endpoints that
 * either fail or are unknown are simply omitted from the returned map.
 *
 * Returns the price map; the list of fully-unknown endpoints is logged.
 */
export async function fetchFalPricing(
  endpointIds: readonly string[],
  apiKey: string
): Promise<Record<string, PricingEntry>> {
  const unique = [...new Set(endpointIds)];
  const result: Record<string, PricingEntry> = {};
  const unknownIds: string[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const partial = await fetchBatchWithSplit(batch, apiKey, unknownIds);
    Object.assign(result, partial);
    if (i + BATCH_SIZE < unique.length) {
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }

  if (unknownIds.length > 0) {
    console.warn(
      `[fal-pricing-fetch] ${unknownIds.length} endpoint(s) returned 404 ` +
        `(no FAL pricing). First 10: ${unknownIds.slice(0, 10).join(", ")}`
    );
  }

  return result;
}
