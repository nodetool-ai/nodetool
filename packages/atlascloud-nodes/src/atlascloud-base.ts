/**
 * AtlasCloud HTTP helpers, auth, and prediction executor.
 *
 * Wire spec (from https://www.atlascloud.ai/docs and verified against the
 * model worker — see Gap #3 in the POC INTEGRATION.md):
 *  - Auth: `Authorization: Bearer <api_key>` header.
 *  - Submit: POST /api/v1/model/generate{Image,Video} with body
 *      { model: "<provider>/<model>/<variant>", ...flatFields }
 *    (The body is FLAT — top-level fields alongside `model` — not nested
 *     under `input`. The docs imply nesting, but the worker only reads top
 *     level.)
 *    Response: { data: { id: "<prediction_id>" } }
 *  - Poll: GET /api/v1/model/prediction/{id}
 *    Response: { data: { status, outputs: [url], error? } }
 *  - 429 / 5xx on polls/downloads: exponential backoff w/ Retry-After.
 *  - Submit is NOT retried — a 429/5xx may have actually created the job
 *    upstream, and retrying would double-bill.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export const ATLAS_BASE = "https://api.atlascloud.ai";

export type AtlasModality = "image" | "video";

export const SUBMIT_PATH: Record<AtlasModality, string> = {
  image: "/api/v1/model/generateImage",
  video: "/api/v1/model/generateVideo"
};

export const pollPath = (id: string): string => `/api/v1/model/prediction/${id}`;

export function getApiKey(secrets: Record<string, string> | undefined): string {
  const key =
    (secrets && secrets.ATLASCLOUD_API_KEY) ||
    process.env.ATLASCLOUD_API_KEY ||
    "";
  if (!key.trim()) {
    throw new Error("ATLASCLOUD_API_KEY is not configured");
  }
  return key.trim();
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

/**
 * Resolve a `Retry-After` header to a millisecond delay. The header is allowed
 * to be either delay-seconds (`"120"`) or an HTTP-date
 * (`"Wed, 21 Oct 2025 07:28:00 GMT"`); a date used to parse to `NaN`, and
 * `setTimeout(_, NaN)` fires immediately — defeating the backoff. Fall back to
 * the caller's exponential delay when the header is absent or unparseable.
 */
export function retryAfterMs(header: string | null, fallback: number): number {
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return fallback;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  maxAttempts = 6
): Promise<Response> {
  let delay = 1000;
  let last: Response | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const resp = await fetch(url, init);
    if (!RETRYABLE_STATUS.has(resp.status)) return resp;
    last = resp;
    if (attempt === maxAttempts) break;
    const wait = retryAfterMs(resp.headers.get("Retry-After"), delay);
    await sleep(wait);
    delay = Math.min(delay * 2, 30000);
  }
  return last as Response;
}

/**
 * Download a finished prediction's output bytes. Retries 429/5xx with backoff:
 * by the time we reach the download the job is already generated and billed,
 * so a transient CDN blip must not throw the paid-for result away.
 */
export async function atlasDownload(url: string): Promise<Uint8Array> {
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(
      `AtlasCloud download failed: HTTP ${res.status} fetching ${url}`
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function atlasSubmit(
  apiKey: string,
  modality: AtlasModality,
  modelId: string,
  input: Record<string, unknown>
): Promise<string> {
  const path = SUBMIT_PATH[modality];
  // Submit POST is not idempotent — never retry. A 429/5xx that we retry may
  // have actually succeeded upstream, creating a duplicate billed job.
  const res = await fetch(`${ATLAS_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model: modelId, ...input })
  });
  const text = await res.text();
  let data: { data?: { id?: string }; message?: string } | null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(`AtlasCloud submit ${res.status}: ${text.slice(0, 500)}`);
  }
  const id = data?.data?.id;
  if (!id) {
    throw new Error(
      `AtlasCloud: no prediction id in submit response: ${text.slice(0, 500)}`
    );
  }
  return id;
}

interface AtlasPollResult {
  status?: string;
  outputs?: Array<string | { url?: string }>;
  output?: string;
  url?: string;
  error?: string;
}

// AtlasCloud has not committed to a single status vocabulary across models, so
// accept the synonyms its image and video workers have been observed to emit
// rather than time out on a terminal-but-unrecognized word.
const SUCCESS_STATUS = new Set([
  "completed",
  "complete",
  "succeeded",
  "success",
  "done"
]);
const FAILURE_STATUS = new Set(["failed", "error", "canceled", "cancelled"]);

export async function atlasPoll(
  apiKey: string,
  predictionId: string,
  opts: { pollInterval?: number; maxAttempts?: number } = {}
): Promise<AtlasPollResult> {
  const pollInterval = opts.pollInterval ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 600;
  const url = `${ATLAS_BASE}${pollPath(predictionId)}`;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchWithRetry(url, { headers: authHeaders(apiKey) });
    const text = await res.text();
    let data: { data?: AtlasPollResult; message?: string } | null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    // AtlasCloud sometimes returns non-2xx with a STRUCTURED failure body
    // (status: "failed", error: "..."). Treat those as job failures, not
    // transport errors, so the user sees the actual reason.
    const d = data?.data ?? {};
    const status = String(d.status ?? "").toLowerCase();

    if (SUCCESS_STATUS.has(status)) {
      return d;
    }
    if (FAILURE_STATUS.has(status)) {
      const msg = d.error || data?.message || text.slice(0, 500);
      throw new Error(
        `AtlasCloud job failed: ${msg} (predictionId: ${predictionId})`
      );
    }
    if (!res.ok) {
      throw new Error(`AtlasCloud poll ${res.status}: ${text.slice(0, 500)}`);
    }
    await sleep(pollInterval);
  }
  throw new Error(`AtlasCloud job timed out (predictionId: ${predictionId})`);
}

export function pickOutputUrl(result: AtlasPollResult): string {
  if (Array.isArray(result.outputs) && result.outputs.length > 0) {
    const first = result.outputs[0];
    if (typeof first === "string") return first;
    if (first && typeof first.url === "string") return first.url;
  }
  if (typeof result.output === "string") return result.output;
  if (typeof result.url === "string") return result.url;
  throw new Error(
    `No output URL in result: ${JSON.stringify(result).slice(0, 500)}`
  );
}
