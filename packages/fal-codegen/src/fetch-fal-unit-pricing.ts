/**
 * Batch-fetch unit pricing from FAL Platform GET /v1/models/pricing.
 *
 * Uses small batches (see platform-models: long `endpoint_id` query strings often yield HTTP 404
 * for the whole request). Retries 429/503 with backoff; on 404 splits batches recursively so one
 * bad or unknown id does not drop pricing for the rest.
 *
 * Env (optional):
 * - **`FAL_CATALOG_TO_PRICING_GAP_MS`** — used by the **CLI** when `--pricing-only --from-platform`:
 *   wait between finishing GET /v1/models (catalog) and starting pricing requests (default **120s**).
 * - **`FAL_PRICING_POST_CATALOG_COOLDOWN_MS`** — ms before first pricing request *inside* this module
 *   when the CLI did not already coordinate a gap. Full codegen default **25s**;
 *   `--pricing-only` alone scales (about **2.5s–60s**). Set either to `0` to skip (risky after large catalogs).
 *
 * After HTTP **429**, extra delay is added between subsequent chunks until responses succeed again
 * (adaptive throttle).
 */

import type { FalUnitPricing } from "./types.js";

const FAL_PRICING_URL = "https://api.fal.ai/v1/models/pricing";

export type FalUnitPricingFetchMode = "default" | "pricing-only";

const RETRYABLE_HTTP = new Set([429, 503]);
const MAX_ATTEMPTS = 12;
/** Second pass after persistent 429 exhaustion (ms). */
const PRICING_RETRY_PASS_COOLDOWN_MS = 120_000;
const BASE_BACKOFF_MS = 1_200;
/** Used only when the response has no `Retry-After` header. */
const BACKOFF_CAP_MS = 12_000;
/**
 * When the API sends `Retry-After`, wait at least that long (plus small jitter). Without a sane
 * ceiling we would cap at BACKOFF_CAP_MS and immediately hit 429 again — see user logs where
 * Retry-After was ~49s but we only waited ~12s.
 */
const RETRY_AFTER_HONOR_CAP_MS = 300_000;
/** Extra ms after `Retry-After` for HTTP 429 only (sliding-window limits often need a bit more). */
const RETRY_AFTER_CUSHION_MS_429 = 5_000;

/** After large catalog walks, pause before first pricing request (same rate-limit bucket). */
const INITIAL_PRICING_COOLDOWN_MIN_IDS = 40;

/** Log progress when this many pricing rows have been merged (successful API responses). */
const PRICING_PROGRESS_EVERY = 50;

function recordPricingRowsFetched(state: { rowsAdded: number }, n: number): void {
  if (n <= 0) {
    return;
  }
  const start = state.rowsAdded;
  state.rowsAdded += n;
  for (
    let k = Math.floor((start + 1) / PRICING_PROGRESS_EVERY) * PRICING_PROGRESS_EVERY;
    k <= state.rowsAdded;
    k += PRICING_PROGRESS_EVERY
  ) {
    if (k > start) {
      console.log(`FAL unit pricing: ${k} rows fetched…`);
    }
  }
}

interface Pacing {
  topLevelBatchSize: number;
  betweenChunkMs: number;
  betweenChunkJitterMs: number;
  recursiveSplitMs: number;
  recursiveJitterMs: number;
  initialCooldownDefaultMs: number;
  /** Minimum ms between the *start* of consecutive pricing HTTP requests (0 = off). */
  minMsBetweenPricingStarts: number;
}

function pacingForMode(mode: FalUnitPricingFetchMode): Pacing {
  if (mode === "pricing-only") {
    return {
      topLevelBatchSize: 15, // was 2 — fewer requests keeps us below the shared quota window
      betweenChunkMs: 6_000,
      betweenChunkJitterMs: 3_000,
      recursiveSplitMs: 1_200,
      recursiveJitterMs: 600,
      initialCooldownDefaultMs: 2_500,
      minMsBetweenPricingStarts: 6_500,
    };
  }
  return {
    topLevelBatchSize: 3,
    betweenChunkMs: 2_800,
    betweenChunkJitterMs: 2_200,
    recursiveSplitMs: 1_000,
    recursiveJitterMs: 900,
    initialCooldownDefaultMs: 25_000,
    minMsBetweenPricingStarts: 0,
  };
}

/** Default first pricing pause after catalog when `--pricing-only` and env is unset (scales with load). */
function pricingOnlyDefaultCooldownMs(endpointCount: number): number {
  if (endpointCount >= 900) {
    return 150_000; // ~2.5 min; was 60s — large catalog crawls exhaust the shared quota window
  }
  if (endpointCount >= 600) {
    return 45_000;
  }
  if (endpointCount >= 400) {
    return 13_000;
  }
  if (endpointCount >= 200) {
    return 8_000;
  }
  if (endpointCount >= INITIAL_PRICING_COOLDOWN_MIN_IDS) {
    return 5_000;
  }
  return 2_500;
}

interface InitialPostCatalogCooldown {
  ms: number;
  /** Shown after "waiting Ns after catalog — …" */
  detail: string;
}

function resolveInitialPostCatalogCooldown(
  mode: FalUnitPricingFetchMode,
  endpointCount: number,
  postCatalogCooldownOverride?: number,
): InitialPostCatalogCooldown {
  const raw = process.env.FAL_PRICING_POST_CATALOG_COOLDOWN_MS;
  if (raw === "0") {
    return {
      ms: 0,
      detail:
        "FAL_PRICING_POST_CATALOG_COOLDOWN_MS=0 (no pause; large catalogs often see HTTP 429 right after)",
    };
  }
  if (raw != null && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) {
      return {
        ms: n,
        detail: `FAL_PRICING_POST_CATALOG_COOLDOWN_MS=${raw} (overrides built-in sizing)`,
      };
    }
  }
  if (postCatalogCooldownOverride !== undefined) {
    if (postCatalogCooldownOverride <= 0) {
      return {
        ms: 0,
        detail:
          "no pause here — CLI already waited between platform catalog and pricing (see FAL_CATALOG_TO_PRICING_GAP_MS)",
      };
    }
    return {
      ms: postCatalogCooldownOverride,
      detail: "from fetch options (coordinated with CLI catalog gap)",
    };
  }
  if (mode === "pricing-only") {
    const ms = pricingOnlyDefaultCooldownMs(endpointCount);
    return {
      ms,
      detail: `built-in for pricing-only (${endpointCount} endpoints; clear env to use this)`,
    };
  }
  const ms = pacingForMode(mode).initialCooldownDefaultMs;
  return {
    ms,
    detail: "full-codegen default (shared api.fal.ai quota)",
  };
}

/** Extra ms between top-level chunks after 429; decays on success. */
interface PricingRateLimitState {
  extraBetweenChunkMs: number;
}

function bumpExtraGapAfter429(
  state: PricingRateLimitState,
  observedRetryAfterMs?: number,
): void {
  const bumped =
    state.extraBetweenChunkMs <= 0
      ? 4_000
      : Math.min(45_000, state.extraBetweenChunkMs + 4_000);
  // The next inter-chunk gap must be at least as long as what the API requested,
  // otherwise the following chunk triggers the same window immediately.
  const floor =
    observedRetryAfterMs != null
      ? Math.min(90_000, observedRetryAfterMs)
      : 0;
  state.extraBetweenChunkMs = Math.max(bumped, floor);
}

function decayExtraGapOnSuccess(state: PricingRateLimitState): void {
  state.extraBetweenChunkMs = Math.floor(state.extraBetweenChunkMs * 0.5);
}

interface FalPricingApiRow {
  endpoint_id: string;
  unit_price: number;
  unit: string;
  currency: string;
}

interface FalPricingApiResponse {
  prices?: FalPricingApiRow[];
  next_cursor?: string | null;
  has_more?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (raw == null || raw === "") {
    return undefined;
  }
  const asInt = Number.parseInt(raw, 10);
  if (!Number.isNaN(asInt)) {
    return asInt * 1000;
  }
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return undefined;
}

function rowToUnitPricing(row: FalPricingApiRow): FalUnitPricing {
  return {
    endpointId: row.endpoint_id,
    unitPrice: row.unit_price,
    billingUnit: row.unit,
    currency: row.currency,
  };
}

function buildPricingUrl(batch: string[]): string {
  const qs = new URLSearchParams();
  for (const id of batch) {
    qs.append("endpoint_id", id);
  }
  return `${FAL_PRICING_URL}?${qs.toString()}`;
}

type BatchResult =
  | { ok: true; json: FalPricingApiResponse }
  | { ok: false; notFound: boolean; status: number; body: string };

/** Enforces minimum time between pricing request *starts* so the next chunk cannot open a new HTTP call too soon after the previous one (common 429 cause after honoring Retry-After per chunk). */
interface PricingRequestThrottle {
  lastStartMs: number;
  minGapMs: number;
}

async function fetchPricingBatchOnce(
  batch: string[],
  headers: HeadersInit,
  requestThrottle: PricingRequestThrottle,
): Promise<Response> {
  if (requestThrottle.minGapMs > 0) {
    const now = Date.now();
    const idle =
      requestThrottle.lastStartMs + requestThrottle.minGapMs - now;
    if (idle > 0) {
      await sleep(idle);
    }
    requestThrottle.lastStartMs = Date.now();
  }
  return fetch(buildPricingUrl(batch), { headers });
}

async function tryFetchPricingBatch(
  batch: string[],
  apiKey: string,
  requestThrottle: PricingRequestThrottle,
  rateLimit?: PricingRateLimitState,
): Promise<BatchResult> {
  const headers = { Authorization: `Key ${apiKey}` };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetchPricingBatchOnce(batch, headers, requestThrottle);
    if (res.ok) {
      try {
        const json = (await res.json()) as FalPricingApiResponse;
        return { ok: true, json };
      } catch {
        return {
          ok: false,
          notFound: false,
          status: res.status,
          body: "invalid JSON in pricing response",
        };
      }
    }

    if (res.status === 404) {
      const body = await res.text().catch(() => "");
      return { ok: false, notFound: true, status: 404, body };
    }

    const retryable =
      RETRYABLE_HTTP.has(res.status) && attempt < MAX_ATTEMPTS - 1;
    if (!retryable) {
      const body = await res.text().catch(() => "");
      return { ok: false, notFound: false, status: res.status, body };
    }

    const fromHeader = parseRetryAfterMs(res);
    await res.text().catch(() => "");
    const exp = Math.min(BACKOFF_CAP_MS, BASE_BACKOFF_MS * 2 ** attempt);
    const jitter = Math.floor(Math.random() * 250);
    const cushion = res.status === 429 ? RETRY_AFTER_CUSHION_MS_429 : 0;

    let waitMs: number;
    let pauseDescription: string;
    if (fromHeader != null) {
      const rawWait = fromHeader + cushion + jitter;
      waitMs = Math.min(RETRY_AFTER_HONOR_CAP_MS, rawWait);
      const askedSec = Math.max(1, Math.round(fromHeader / 1000));
      const cushionNote =
        cushion > 0 ? ` + ${Math.round(cushion / 1000)}s cushion` : "";
      if (rawWait > RETRY_AFTER_HONOR_CAP_MS) {
        pauseDescription = `Retry-After ~${askedSec}s${cushionNote} (applied cap ~${Math.round(RETRY_AFTER_HONOR_CAP_MS / 1000)}s)`;
      } else {
        pauseDescription = `Retry-After ~${askedSec}s${cushionNote}`;
      }
    } else {
      waitMs = Math.min(BACKOFF_CAP_MS, exp + jitter);
      pauseDescription = "exponential backoff (no Retry-After header)";
    }

    if (rateLimit != null && res.status === 429) {
      bumpExtraGapAfter429(rateLimit, fromHeader);
    }

    console.warn(
      `FAL unit pricing: HTTP ${res.status} (${batch.length} ids) — waiting ~${Math.max(1, Math.round(waitMs / 1000))}s (${pauseDescription}; attempt ${attempt + 1}/${MAX_ATTEMPTS - 1})…`,
    );
    await sleep(waitMs);
  }

  return {
    ok: false,
    notFound: false,
    status: -1,
    body: "exhausted retries",
  };
}

async function mergeBatchIntoMap(
  batch: string[],
  apiKey: string,
  map: Map<string, FalUnitPricing>,
  pacing: Pacing,
  progress: { rowsAdded: number },
  requestThrottle: PricingRequestThrottle,
  rateLimit: PricingRateLimitState | undefined,
  failedIds: Set<string>,
): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  const result = await tryFetchPricingBatch(
    batch,
    apiKey,
    requestThrottle,
    rateLimit,
  );

  if (result.ok) {
    const prices = result.json.prices ?? [];
    for (const row of prices) {
      map.set(row.endpoint_id, rowToUnitPricing(row));
    }
    recordPricingRowsFetched(progress, prices.length);
    if (rateLimit != null) {
      decayExtraGapOnSuccess(rateLimit);
    }
    return;
  }

  if (result.notFound) {
    if (batch.length === 1) {
      return;
    }
    const mid = Math.floor(batch.length / 2);
    await mergeBatchIntoMap(
      batch.slice(0, mid),
      apiKey,
      map,
      pacing,
      progress,
      requestThrottle,
      rateLimit,
      failedIds,
    );
    await sleep(
      pacing.recursiveSplitMs + Math.random() * pacing.recursiveJitterMs,
    );
    await mergeBatchIntoMap(
      batch.slice(mid),
      apiKey,
      map,
      pacing,
      progress,
      requestThrottle,
      rateLimit,
      failedIds,
    );
    return;
  }

  console.warn(
    `FAL unit pricing batch HTTP ${result.status} (${batch.length} ids): ${result.body.slice(0, 240)}`,
  );
  for (const id of batch) {
    failedIds.add(id);
  }
}

export interface FetchFalUnitPricingMapOptions {
  /**
   * `pricing-only` uses moderate batches and gaps after a catalog-only run (same host as GET /v1/models).
   * `default` is slower when OpenAPI fetch shares the same quota.
   */
  mode?: FalUnitPricingFetchMode;
  /**
   * When set and `FAL_PRICING_POST_CATALOG_COOLDOWN_MS` is **not** set, use this pre-pricing wait (ms).
   * Pass `0` when the CLI already paused after catalog (`FAL_CATALOG_TO_PRICING_GAP_MS`).
   */
  postCatalogCooldownMs?: number;
}

/**
 * Returns a map endpoint_id → unit pricing. Omits endpoints with no row or persistent HTTP errors.
 * When `apiKey` is missing/empty, returns an empty map (callers should set falUnitPricing to null).
 */
export async function fetchFalUnitPricingMap(
  endpointIds: string[],
  apiKey: string | undefined,
  options?: FetchFalUnitPricingMapOptions,
): Promise<Map<string, FalUnitPricing>> {
  const unique = [...new Set(endpointIds.filter(Boolean))].sort();
  const map = new Map<string, FalUnitPricing>();
  const key = apiKey?.trim();
  if (unique.length === 0 || !key) {
    return map;
  }

  const mode: FalUnitPricingFetchMode = options?.mode ?? "default";
  const pacing = pacingForMode(mode);

  const { ms: cooldownMs, detail: cooldownDetail } = resolveInitialPostCatalogCooldown(
    mode,
    unique.length,
    options?.postCatalogCooldownMs,
  );
  if (unique.length >= INITIAL_PRICING_COOLDOWN_MIN_IDS) {
    if (cooldownMs > 0) {
      console.log(
        `FAL unit pricing: waiting ${Math.round(cooldownMs / 1000)}s after catalog — ${cooldownDetail}`,
      );
      await sleep(cooldownMs);
    } else {
      console.log(`FAL unit pricing: ${cooldownDetail}`);
    }
  }

  const progress = { rowsAdded: 0 };
  const rateLimit: PricingRateLimitState = { extraBetweenChunkMs: 0 };
  const requestThrottle: PricingRequestThrottle = {
    lastStartMs: 0,
    minGapMs: pacing.minMsBetweenPricingStarts,
  };
  const failedIds = new Set<string>();
  const batchSize = pacing.topLevelBatchSize;

  const processEndpointList = async (
    ids: string[],
    passTag: "primary" | "retry",
  ): Promise<void> => {
    const totalChunks = Math.ceil(ids.length / batchSize);
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      const chunkNum = Math.floor(i / batchSize) + 1;
      if (
        ids.length >= INITIAL_PRICING_COOLDOWN_MIN_IDS &&
        chunkNum > 1 &&
        chunkNum % 10 === 0
      ) {
        console.log(
          `FAL unit pricing: ${passTag} pass ${chunkNum}/${totalChunks} chunks, ${progress.rowsAdded} rows merged, ${map.size} priced endpoints…`,
        );
      }
      await mergeBatchIntoMap(
        chunk,
        key,
        map,
        pacing,
        progress,
        requestThrottle,
        rateLimit,
        failedIds,
      );
      if (i + batchSize < ids.length) {
        const base =
          pacing.betweenChunkMs + Math.random() * pacing.betweenChunkJitterMs;
        await sleep(base + rateLimit.extraBetweenChunkMs);
      }
    }
  };

  await processEndpointList(unique, "primary");

  if (failedIds.size > 0) {
    const n = failedIds.size;
    console.warn(
      `FAL unit pricing: ${n} endpoint id(s) missing after HTTP errors; waiting ${Math.round(PRICING_RETRY_PASS_COOLDOWN_MS / 1000)}s then retrying them once…`,
    );
    await sleep(PRICING_RETRY_PASS_COOLDOWN_MS);
    rateLimit.extraBetweenChunkMs = Math.max(
      rateLimit.extraBetweenChunkMs,
      10_000,
    );
    const retryIds = [...failedIds].sort();
    failedIds.clear();
    await processEndpointList(retryIds, "retry");
    if (failedIds.size > 0) {
      console.warn(
        `FAL unit pricing: still no pricing for ${failedIds.size} id(s) after retry (often quota — try again later or raise FAL_CATALOG_TO_PRICING_GAP_MS).`,
      );
    }
  }

  return map;
}
