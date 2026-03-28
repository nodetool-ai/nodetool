/**
 * FAL model platform API — catalog + OpenAPI via `api.fal.ai/v1/models` only.
 * @see https://docs.fal.ai/platform-apis/v1/models
 *
 * Env: `FAL_CATALOG_PAGE_GAP_MS` — ms pause between catalog pages (default 550 + jitter; `0` off).
 * Spreads load on `api.fal.ai` before pricing / OpenAPI.
 */

import { allConfigs } from "./configs/index.js";

const MODELS_URL = "https://api.fal.ai/v1/models";

const CATALOG_PAGE_GAP_JITTER_MS = 380;

function catalogPageGapBaseMs(): number {
  const raw = process.env.FAL_CATALOG_PAGE_GAP_MS;
  if (raw === "0") {
    return 0;
  }
  if (raw != null && raw !== "") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) {
      return n;
    }
  }
  return 550;
}

/**
 * OpenAPI batch size for `expand=openapi-3.0`. Docs allow up to 50 `endpoint_id`s, but long IDs
 * produce huge query strings; servers/proxies often answer **404** for the whole request (every
 * id in the chunk looks "failed"). Keep this modest.
 */
const OPENAPI_BATCH_SIZE = 12;

/**
 * Parallel single-id OpenAPI retries (same `/v1/models`). Keep low: even with `FAL_API_KEY`,
 * many concurrent expands trigger HTTP 429.
 */
const OPENAPI_SINGLE_ID_CONCURRENCY = 2;

export type FalCodegenModuleKey = keyof typeof allConfigs;

/** Map FAL catalog `metadata.category` to a module key in configs/index. */
export function mapFalCategoryToModuleKey(
  category: string | undefined,
): FalCodegenModuleKey {
  if (!category) {
    return "unknown";
  }
  const normalized = category.trim().toLowerCase();
  if (normalized === "json") {
    return "json_processing";
  }
  const underscored = normalized.replace(/-/g, "_");
  if (underscored in allConfigs) {
    return underscored as FalCodegenModuleKey;
  }
  return "unknown";
}

/** Catalog `metadata.kind` values we include in platform-driven codegen. */
const CODEGEN_KINDS = new Set(["inference", "training"]);

export interface FalModelListItem {
  endpoint_id: string;
  metadata?: {
    display_name?: string;
    category?: string;
    description?: string;
    status?: string;
    tags?: string[];
    kind?: string;
  };
}

function authHeaders(apiKey: string | undefined): HeadersInit {
  if (!apiKey) {
    return {};
  }
  return { Authorization: `Key ${apiKey}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse `Retry-After` as seconds or HTTP-date; returns delay in ms. */
export function parseRetryAfterMs(res: Response): number | undefined {
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

const RETRYABLE_HTTP_STATUS = new Set([429, 503]);

/** Max sleep between retries (FAL may send very large Retry-After; cap for interactive use). */
const FAL_RETRY_WAIT_CAP_MS = 8_000;
const FAL_FETCH_MAX_ATTEMPTS = 6;
const FAL_FETCH_BASE_MS = 600;
const FAL_FETCH_MAX_BACKOFF_MS = FAL_RETRY_WAIT_CAP_MS;

/**
 * GET with retries on 429/503. Backs off with capped waits (Retry-After and exponential both capped).
 */
async function falGetWithRetry(
  url: URL,
  apiKey: string | undefined,
  label: string,
): Promise<Response> {
  for (let attempt = 0; attempt < FAL_FETCH_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { headers: authHeaders(apiKey) });
    if (res.ok) {
      return res;
    }
    const retryable =
      RETRYABLE_HTTP_STATUS.has(res.status) &&
      attempt < FAL_FETCH_MAX_ATTEMPTS - 1;
    if (!retryable) {
      let hint = "";
      if (res.status === 429 && !apiKey) {
        hint =
          " Set FAL_API_KEY (env or nodetool/.env) for authenticated rate limits.";
      } else if (res.status === 429) {
        hint = " Wait and retry.";
      }
      throw new Error(
        `FAL ${label} failed: ${res.status} ${res.statusText}.${hint}`,
      );
    }

    const fromHeader = parseRetryAfterMs(res);
    const exp = Math.min(
      FAL_FETCH_MAX_BACKOFF_MS,
      FAL_FETCH_BASE_MS * 2 ** attempt,
    );
    const jitter = Math.floor(Math.random() * 250);
    const rawWait = (fromHeader ?? exp) + jitter;
    const waitMs = Math.min(FAL_RETRY_WAIT_CAP_MS, rawWait);
    if (fromHeader != null && rawWait > FAL_RETRY_WAIT_CAP_MS) {
      const hint = apiKey
        ? "still rate-limited with auth — backoff or run again later"
        : "set FAL_API_KEY or pass --fal-api-key for higher limits";
      console.warn(
        `FAL ${label}: Retry-After ${Math.round(fromHeader / 1000)}s capped to ${Math.round(waitMs / 1000)}s (${hint}).`,
      );
    }

    console.warn(
      `FAL ${label}: HTTP ${res.status} — waiting ${Math.round(waitMs / 1000)}s before retry (${attempt + 1}/${FAL_FETCH_MAX_ATTEMPTS - 1})…`,
    );
    await sleep(waitMs);
  }

  throw new Error(`FAL ${label}: exhausted retries`);
}

export interface CatalogFetchResult {
  models: FalModelListItem[];
  /** Active catalog rows where `metadata.kind` was absent — not code-generated. */
  skippedMissingKind: string[];
}

/**
 * Paginate all `status=active` models from the platform catalog.
 * Keeps only `inference` and `training`. Rows with missing `kind` are omitted (see
 * `skippedMissingKind`). Other explicit kinds are skipped without listing.
 */
export async function fetchAllActiveCatalogModels(
  apiKey?: string,
): Promise<CatalogFetchResult> {
  const out: FalModelListItem[] = [];
  const skippedMissingKind = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    const u = new URL(MODELS_URL);
    u.searchParams.set("status", "active");
    u.searchParams.set("limit", "100");
    if (cursor) {
      u.searchParams.set("cursor", cursor);
    }

    const res = await falGetWithRetry(
      u,
      apiKey,
      "GET /v1/models (catalog page)",
    );

    const body = (await res.json()) as {
      models?: FalModelListItem[];
      next_cursor?: string;
      has_more?: boolean;
    };

    for (const m of body.models ?? []) {
      const raw = m.metadata?.kind;
      if (raw == null || raw === "") {
        skippedMissingKind.add(m.endpoint_id);
        continue;
      }
      if (!CODEGEN_KINDS.has(raw.toLowerCase())) {
        continue;
      }
      out.push(m);
    }

    if (!body.has_more || !body.next_cursor) {
      break;
    }
    const gapBase = catalogPageGapBaseMs();
    if (gapBase > 0) {
      await sleep(gapBase + Math.random() * CATALOG_PAGE_GAP_JITTER_MS);
    }
    cursor = body.next_cursor;
  }

  return {
    models: out,
    skippedMissingKind: [...skippedMissingKind].sort(),
  };
}

/** @deprecated Use {@link fetchAllActiveCatalogModels} for full result including skips. */
export async function fetchAllActiveInferenceModels(
  apiKey?: string,
): Promise<FalModelListItem[]> {
  const r = await fetchAllActiveCatalogModels(apiKey);
  return r.models;
}

export interface OpenapiBatchFailure {
  endpointId: string;
  error: string;
}

interface OpenapiModelRow {
  endpoint_id: string;
  openapi?: Record<string, unknown>;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const workers = Math.min(concurrency, items.length);
  let index = 0;
  const worker = async () => {
    for (;;) {
      const i = index++;
      if (i >= items.length) {
        break;
      }
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
}

/**
 * One `endpoint_id` + `expand=openapi-3.0` on the same platform `GET /v1/models` as batch calls.
 */
async function fetchOpenapiSinglePlatform(
  endpointId: string,
  apiKey: string | undefined,
): Promise<
  { ok: true; schema: Record<string, unknown> } | { ok: false; error: string }
> {
  const u = new URL(MODELS_URL);
  u.searchParams.set("endpoint_id", endpointId);
  u.searchParams.set("expand", "openapi-3.0");
  try {
    const res = await falGetWithRetry(
      u,
      apiKey,
      "GET /v1/models (openapi single)",
    );
    const body = (await res.json()) as { models?: OpenapiModelRow[] };
    const row =
      body.models?.find((m) => m.endpoint_id === endpointId) ??
      body.models?.[0];
    if (!row) {
      return { ok: false, error: "Not present in API response" };
    }
    if (!row.openapi || typeof row.openapi !== "object") {
      return { ok: false, error: "Response missing openapi" };
    }
    return { ok: true, schema: row.openapi };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * OpenAPI 3.0 from `GET https://api.fal.ai/v1/models` with `expand=openapi-3.0` only (no queue URL).
 * Uses small batches to avoid 404s on oversized query strings; then single-id retries for misses.
 */
export async function fetchOpenapiForEndpoints(
  endpointIds: string[],
  apiKey?: string,
): Promise<{
  schemas: Map<string, Record<string, unknown>>;
  failed: OpenapiBatchFailure[];
}> {
  const schemas = new Map<string, Record<string, unknown>>();
  const failed: OpenapiBatchFailure[] = [];

  for (let i = 0; i < endpointIds.length; i += OPENAPI_BATCH_SIZE) {
    const chunk = endpointIds.slice(i, i + OPENAPI_BATCH_SIZE);
    const u = new URL(MODELS_URL);
    for (const id of chunk) {
      u.searchParams.append("endpoint_id", id);
    }
    u.searchParams.set("expand", "openapi-3.0");

    let res: Response;
    try {
      res = await falGetWithRetry(
        u,
        apiKey,
        "GET /v1/models (openapi batch)",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const id of chunk) {
        failed.push({ endpointId: id, error: msg });
      }
      continue;
    }

    const body = (await res.json()) as { models?: OpenapiModelRow[] };

    const seen = new Set<string>();
    for (const m of body.models ?? []) {
      seen.add(m.endpoint_id);
      if (!m.openapi || typeof m.openapi !== "object") {
        failed.push({
          endpointId: m.endpoint_id,
          error: "Response missing openapi",
        });
        continue;
      }
      schemas.set(m.endpoint_id, m.openapi);
    }

    for (const id of chunk) {
      if (!seen.has(id)) {
        failed.push({
          endpointId: id,
          error: "Not present in API response",
        });
      }
    }
  }

  const batchErrById = new Map<string, string>();
  for (const f of failed) {
    if (!batchErrById.has(f.endpointId)) {
      batchErrById.set(f.endpointId, f.error);
    }
  }
  const toRetry = [...batchErrById.keys()].filter((id) => !schemas.has(id));
  if (toRetry.length === 0) {
    return { schemas, failed: [] };
  }

  console.log(
    `  Platform OpenAPI: single-id retry for ${toRetry.length} miss(es) (same /v1/models)…`,
  );

  const stillFailed: OpenapiBatchFailure[] = [];

  await runWithConcurrency(
    toRetry,
    OPENAPI_SINGLE_ID_CONCURRENCY,
    async (id) => {
      const r = await fetchOpenapiSinglePlatform(id, apiKey);
      if (r.ok) {
        schemas.set(id, r.schema);
        return;
      }
      const batchReason = batchErrById.get(id) ?? "batch step missed";
      stillFailed.push({
        endpointId: id,
        error:
          batchReason === r.error
            ? batchReason
            : `${batchReason}; single-id: ${r.error}`,
      });
    },
  );

  return { schemas, failed: stillFailed };
}
