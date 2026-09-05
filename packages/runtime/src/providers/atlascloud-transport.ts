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
 *  - Submit is never retried: a 429/5xx may have created the job upstream, and
 *    a second POST is a second bill.
 */

import { isString } from "../type-predicates.js";
import {
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES,
  fetchWithRetry,
  sleep
} from "./http-transport.js";
import { assertSafePublicHttpsUrl, safeFetch } from "./safe-url.js";

export const ATLAS_BASE = "https://api.atlascloud.ai";

export type AtlasModality = "image" | "video";

export const SUBMIT_PATH = {
  image: "/api/v1/model/generateImage",
  video: "/api/v1/model/generateVideo"
} satisfies Record<AtlasModality, string>;

export const pollPath = (id: string): string => `/api/v1/model/prediction/${id}`;

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
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

export async function atlasSubmit(
  apiKey: string,
  modality: AtlasModality,
  modelId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const init: RequestInit = {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model: modelId, ...input })
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
  signal?: AbortSignal;
}

export async function atlasPoll(
  apiKey: string,
  predictionId: string,
  opts: AtlasPollOptions = {}
): Promise<AtlasPollResult> {
  const pollInterval = opts.pollInterval ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 600;
  const url = `${ATLAS_BASE}${pollPath(predictionId)}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      throw new Error(`AtlasCloud poll ${res.status}: ${text.slice(0, 500)}`);
    }
    if (attempt < maxAttempts - 1) await sleep(pollInterval, opts.signal);
  }
  throw new Error(`AtlasCloud job timed out (predictionId: ${predictionId})`);
}

export function pickOutputUrl(result: AtlasPollResult): string {
  if (Array.isArray(result.outputs) && result.outputs.length > 0) {
    const first = result.outputs[0];
    if (isString(first)) return first;
    if (first && isString(first.url)) return first.url;
  }
  if (isString(result.output)) return result.output;
  if (isString(result.url)) return result.url;
  throw new Error(
    `No output URL in result: ${JSON.stringify(result).slice(0, 500)}`
  );
}
