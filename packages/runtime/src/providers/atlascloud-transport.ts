/**
 * AtlasCloud's submit → poll → download flow, in one place.
 *
 * Wire spec (https://www.atlascloud.ai/docs, verified against the model worker —
 * see Gap #3 in the POC INTEGRATION.md):
 *  - Auth: `Authorization: Bearer <api_key>`.
 *  - Submit: POST /api/v1/model/generate{Image,Video} with body
 *      `{ model: "<provider>/<model>/<variant>", ...flatFields }`.
 *    The body is FLAT — top-level fields alongside `model` — not nested under
 *    `input`. The docs imply nesting; the worker only reads top level.
 *    Response: `{ data: { id } }`.
 *  - Poll: GET /api/v1/model/prediction/{id} → `{ data: { status, outputs, error? } }`.
 *  - Callback: a submit carrying `webhook_url` is answered with one signed
 *    POST per terminal prediction (https://atlascloud.ai/docs/en/webhooks).
 *  - Submit is never retried: a 429/5xx may have created the job upstream, and
 *    a second POST is a second bill.
 */

import { isString } from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import {
  AtlasWebhookWaitTimeout,
  registerAtlasWebhookWait
} from "./atlascloud-webhook-registry.js";
import {
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES,
  fetchWithRetry,
  sleep
} from "./http-transport.js";
import {
  assertSafePublicHttpsUrl,
  isSafePublicHttpsUrl,
  safeFetch
} from "./safe-url.js";

const log = createLogger("nodetool.runtime.providers.atlascloud-transport");

export const ATLAS_BASE = "https://api.atlascloud.ai";

export type AtlasModality = "image" | "video";

export const SUBMIT_PATH = {
  image: "/api/v1/model/generateImage",
  video: "/api/v1/model/generateVideo"
} satisfies Record<AtlasModality, string>;

export const UPLOAD_MEDIA_PATH = "/api/v1/model/uploadMedia";

export const pollPath = (id: string): string =>
  `/api/v1/model/prediction/${id}`;

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

/** Upload bytes to AtlasCloud and return the temporary URL used by model inputs. */
export async function atlasUploadMedia(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
  signal?: AbortSignal
): Promise<string> {
  if (bytes.length === 0) {
    throw new Error("AtlasCloud upload media must not be empty");
  }
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    filename
  );
  const init: RequestInit = {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  };
  if (signal) init.signal = signal;
  const res = await fetch(`${ATLAS_BASE}${UPLOAD_MEDIA_PATH}`, init);
  const text = await res.text();
  let data: {
    url?: string;
    data?: { url?: string; download_url?: string };
    message?: string;
  } | null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      `AtlasCloud media upload failed: HTTP ${res.status}: ${text.slice(0, 500)}`
    );
  }
  const url = data?.url ?? data?.data?.url ?? data?.data?.download_url;
  if (!url) {
    throw new Error(
      `AtlasCloud media upload returned no URL: ${text.slice(0, 500)}`
    );
  }
  assertSafePublicHttpsUrl(url);
  return url;
}

/**
 * A one-line summary of a submit body for an error message: scalar values
 * verbatim, long strings and data URIs reduced to a length, so a rejection can
 * name the parameter that was sent without echoing a prompt or an image.
 */
function describeInput(input: Record<string, unknown>): string {
  const parts = Object.entries(input).map(([key, value]) => {
    if (isString(value)) {
      return value.length > 40 || value.startsWith("data:")
        ? `${key}=<${value.length} chars>`
        : `${key}=${value}`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return `${key}=${value}`;
    }
    return `${key}=<${Array.isArray(value) ? "array" : typeof value}>`;
  });
  return parts.length > 0 ? parts.join(", ") : "no fields";
}

/**
 * Download a finished prediction's output. The URL comes out of the provider's
 * result body, so it is screened (`safeFetch` re-checks every redirect hop);
 * 429/5xx are retried because the job is already generated and billed and a
 * transient CDN blip must not throw the paid-for result away.
 */
export async function atlasDownload(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  assertSafePublicHttpsUrl(url);
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetchWithRetry(url, init, {
    fetchImpl: (input, requestInit) =>
      safeFetch(String(input), requestInit as RequestInit)
  });
  if (!res.ok) {
    throw new Error(
      `AtlasCloud download failed: HTTP ${res.status} fetching ${url}`
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Path the signed AtlasCloud callback route is mounted on. */
export const ATLAS_WEBHOOK_PATH = "/api/providers/atlascloud/webhook";

/** AtlasCloud rejects a `webhook_url` longer than this. */
export const ATLAS_WEBHOOK_MAX_URL_LENGTH = 1024;

/**
 * The callback URL to send with a submission, or undefined when this server has
 * no address AtlasCloud could reach.
 *
 * AtlasCloud accepts only a public https URL, so a `NODETOOL_PUBLIC_URL` that is
 * http, loopback, or an RFC1918 address resolves to undefined here: the run
 * polls instead of sending a submission AtlasCloud would refuse.
 */
/**
 * Drop trailing slashes in one pass. `replace(/\/+$/, "")` is quadratic in the
 * length of the slash run, because each start position retries the whole run
 * (80k slashes took 2.4s locally), and this value comes from configuration
 * rather than from a constant.
 */
function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

export function atlasWebhookUrl(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const base = env["NODETOOL_PUBLIC_URL"]?.trim();
  if (!base) return undefined;
  const url = `${withoutTrailingSlashes(base)}${ATLAS_WEBHOOK_PATH}`;
  if (url.length > ATLAS_WEBHOOK_MAX_URL_LENGTH) return undefined;
  return isSafePublicHttpsUrl(url) ? url : undefined;
}

export async function atlasSubmit(
  apiKey: string,
  modality: AtlasModality,
  modelId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  // A callback is an optimization over polling, never a replacement for it, so
  // the field is added here rather than asked for by every call site.
  const webhookUrl = atlasWebhookUrl();
  const body = webhookUrl
    ? { model: modelId, ...input, webhook_url: webhookUrl }
    : { model: modelId, ...input };
  const init: RequestInit = {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body)
  };
  if (signal) init.signal = signal;
  const res = await fetch(`${ATLAS_BASE}${SUBMIT_PATH[modality]}`, init);
  const text = await res.text();
  let data: { data?: { id?: string }; message?: string } | null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    // AtlasCloud answers a bad field with a bare "Invalid request parameters",
    // which names nothing. Append the request shape so the caller can see which
    // parameter it sent — prompts and data URIs are summarized, not echoed.
    throw new Error(
      `AtlasCloud submit ${res.status} for ${modelId}: ${text.slice(0, 500)} ` +
        `(sent ${describeInput(input)})`
    );
  }
  const id = data?.data?.id;
  if (!id) {
    throw new Error(
      `AtlasCloud: no prediction id in submit response: ${text.slice(0, 500)}`
    );
  }
  return id;
}

export interface AtlasPollResult {
  status?: string;
  outputs?: Array<string | { url?: string }>;
  output?: string;
  url?: string;
  error?: string;
}

export interface AtlasPollOptions {
  pollInterval?: number;
  maxAttempts?: number;
  /** Number of initial 404s tolerated while AtlasCloud registers a job. */
  notFoundRetries?: number;
  signal?: AbortSignal;
}

/**
 * `atlasPoll` ran out of attempts without seeing a terminal state. Its own
 * callers treat this as the job timing out; `atlasAwaitResult` does not,
 * because there the callback wait owns the deadline.
 */
export class AtlasPollBudgetExhausted extends Error {
  constructor(predictionId: string) {
    super(`AtlasCloud job timed out (predictionId: ${predictionId})`);
    this.name = "AtlasPollBudgetExhausted";
  }
}

export async function atlasPoll(
  apiKey: string,
  predictionId: string,
  opts: AtlasPollOptions = {}
): Promise<AtlasPollResult> {
  const pollInterval = opts.pollInterval ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 600;
  const notFoundRetries = Math.max(0, opts.notFoundRetries ?? 3);
  const url = `${ATLAS_BASE}${pollPath(predictionId)}`;
  let notFoundCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // `sleep` resolves rather than throws on abort, so without this an aborted
    // wait would burn the request's whole retry budget on doomed fetches.
    if (opts.signal?.aborted) {
      throw opts.signal.reason instanceof Error
        ? opts.signal.reason
        : new Error(`AtlasCloud poll aborted (predictionId: ${predictionId})`);
    }
    const init: RequestInit = { headers: authHeaders(apiKey) };
    if (opts.signal) init.signal = opts.signal;
    const res = await fetchWithRetry(url, init);
    const text = await res.text();
    let data: { data?: AtlasPollResult; message?: string } | null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    // A non-2xx can still carry a structured failure body (status: "failed",
    // error: "…"). Report those as job failures so the user sees the reason.
    const d = data?.data ?? {};
    const status = String(d.status ?? "").toLowerCase();

    if (TERMINAL_SUCCESS_STATES.has(status)) return d;
    if (TERMINAL_FAILURE_STATES.has(status)) {
      const msg = d.error || data?.message || text.slice(0, 500);
      throw new Error(
        `AtlasCloud job failed: ${msg} (predictionId: ${predictionId})`
      );
    }
    if (!res.ok) {
      if (res.status === 404 && notFoundCount < notFoundRetries) {
        notFoundCount += 1;
        if (attempt < maxAttempts - 1) {
          await sleep(pollInterval, opts.signal);
          continue;
        }
      }
      throw new Error(`AtlasCloud poll ${res.status}: ${text.slice(0, 500)}`);
    }
    if (attempt < maxAttempts - 1) await sleep(pollInterval, opts.signal);
  }
  throw new AtlasPollBudgetExhausted(predictionId);
}

/**
 * How often the prediction endpoint is read while a callback is outstanding.
 *
 * AtlasCloud's delivery is at-least-once and best effort. A callback can be
 * lost and a duplicate can arrive, so the endpoint stays the authority. The
 * callback only shortens the wait, and this bounds what a lost one costs.
 */
export const ATLAS_WEBHOOK_RECONCILE_INTERVAL_MS = 15_000;

/**
 * Wait for a prediction to reach a terminal state.
 *
 * Without a reachable callback URL this is `atlasPoll`. With one, the callback
 * and a slow reconciliation poll race: whichever reports the terminal state
 * first settles the wait, and the loser is aborted. The result is the same
 * either way, so a callback AtlasCloud never sends costs latency, not the run.
 */
export async function atlasAwaitResult(
  apiKey: string,
  predictionId: string,
  opts: AtlasPollOptions = {}
): Promise<AtlasPollResult> {
  if (!atlasWebhookUrl()) return atlasPoll(apiKey, predictionId, opts);

  const pollInterval = opts.pollInterval ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 600;
  const windowMs = pollInterval * maxAttempts;
  // Reconcile on the slow cadence, but never so slowly that a short window
  // gets one request: a caller asking for 12s deserves real fallback polling
  // inside it, not a single read and then nothing.
  const reconcileInterval = Math.max(
    pollInterval,
    Math.min(ATLAS_WEBHOOK_RECONCILE_INTERVAL_MS, Math.floor(windowMs / 2))
  );
  // `atlasPoll` reads before each sleep, so N attempts span (N-1) intervals.
  const reconcileAttempts = Math.floor(windowMs / reconcileInterval) + 1;

  // `addEventListener` does not deliver an abort that already happened, so a
  // caller signal aborted before this call has to compose rather than
  // subscribe. `AbortSignal.any` carries an already-aborted input through.
  const settled = new AbortController();
  const waitSignal = opts.signal
    ? AbortSignal.any([opts.signal, settled.signal])
    : settled.signal;

  const callback = registerAtlasWebhookWait(predictionId, windowMs, waitSignal);
  const reconcile = atlasPoll(apiKey, predictionId, {
    pollInterval: reconcileInterval,
    maxAttempts: reconcileAttempts,
    signal: waitSignal
  }).catch((error: unknown): Promise<AtlasPollResult> => {
    // Running out of reconciliation attempts is not a verdict on the job. The
    // callback wait holds the real deadline and rejects at `windowMs`, so this
    // half simply stops. Every other rejection — a terminal failure, a 4xx, an
    // abort — is the answer and propagates.
    if (error instanceof AtlasPollBudgetExhausted) {
      return new Promise<AtlasPollResult>(() => undefined);
    }
    throw error;
  });
  // Aborting the loser rejects it after the race has been decided. These
  // handlers keep that expected rejection from surfacing as an unhandled one.
  callback.catch(() => undefined);
  reconcile.catch(() => undefined);

  log.debug("Awaiting AtlasCloud prediction", {
    predictionId,
    windowMs,
    reconcileInterval,
    reconcileAttempts
  });
  try {
    return await Promise.race([callback, reconcile]);
  } catch (error) {
    // The window ran out with neither a callback nor a terminal poll. That is
    // the job not finishing, which is what the polling path reports, so both
    // modes fail a slow prediction the same way.
    if (error instanceof AtlasWebhookWaitTimeout) {
      throw new AtlasPollBudgetExhausted(predictionId);
    }
    throw error;
  } finally {
    settled.abort(
      new Error(`AtlasCloud wait settled (predictionId: ${predictionId})`)
    );
  }
}

/**
 * Read one prediction once, without polling — the lookup behind
 * `AtlasCloudProvider.getGeneration`. `atlasPoll` waits for a terminal state
 * and throws on failure; this reports whatever state the job is in, and
 * answers `null` for a prediction id AtlasCloud does not know (404).
 */
export async function atlasGetPrediction(
  apiKey: string,
  predictionId: string,
  opts: { fetchFn?: typeof fetch; signal?: AbortSignal } = {}
): Promise<AtlasPollResult | null> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  const init: RequestInit = { headers: authHeaders(apiKey) };
  if (opts.signal) init.signal = opts.signal;
  const res = await fetchFn(`${ATLAS_BASE}${pollPath(predictionId)}`, init);
  const text = await res.text();
  let data: { data?: AtlasPollResult; message?: string } | null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (res.status === 404) return null;
  // A non-2xx that still carries a prediction body is the prediction's own
  // failure, and is reported as that state rather than as a transport error.
  if (!res.ok && !data?.data) {
    throw new Error(
      `AtlasCloud prediction lookup ${res.status}: ${text.slice(0, 500)}`
    );
  }
  return data?.data ?? null;
}

/** Every output URL a finished prediction carries, in the order it lists them. */
export function outputUrls(result: AtlasPollResult): string[] {
  const urls: string[] = [];
  for (const entry of result.outputs ?? []) {
    if (isString(entry)) urls.push(entry);
    else if (entry && isString(entry.url)) urls.push(entry.url);
  }
  if (isString(result.output)) urls.push(result.output);
  if (isString(result.url)) urls.push(result.url);
  return urls;
}

export function pickOutputUrl(result: AtlasPollResult): string {
  const [first] = outputUrls(result);
  if (first !== undefined) return first;
  throw new Error(
    `No output URL in result: ${JSON.stringify(result).slice(0, 500)}`
  );
}
