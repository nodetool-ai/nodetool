/**
 * MuAPI's submit → poll → download flow, in one place.
 *
 * Wire spec (https://muapi.ai/docs/api-reference):
 *  - Auth:    `x-api-key: <api_key>` on every request.
 *  - Submit:  POST /api/v1/<endpoint> with a flat JSON body.
 *             Response: `{ request_id }`.
 *  - Poll:    GET /api/v1/predictions/<request_id>/result →
 *             `{ status, outputs|... , error? }`.
 *  - Upload:  POST /api/v1/upload_file, multipart, returns a hosted URL that
 *             a later submit references.
 *  - Submit and upload are never retried: a 429/5xx may have created the job
 *    upstream, and a second POST is a second bill. The poll and the result
 *    download are GETs and are retried.
 *
 * The provider (`muapi-provider.ts`) and the `@nodetool-ai/muapi-nodes` pack
 * both call this — reached from a node package as
 * `@nodetool-ai/runtime/provider-transport`, so one copy of the billing and
 * SSRF rules serves both.
 */

import { recordGenerationReceipt } from "../generation-receipt.js";
import {
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES,
  fetchWithRetry,
  pollUntilTerminal
} from "./http-transport.js";
import { detectImageMime, extForImageMime } from "./image-mime.js";
import { sniffMedia, type MediaKind } from "./media-mime.js";
import { assertSafePublicHttpsUrl, safeFetch } from "./safe-url.js";

const MUAPI_BASE_URL = "https://api.muapi.ai/api/v1";

/** The routes MuAPI documents as live. Its FLUX 3 image routes are not. */
export const MUAPI_TEXT_TO_VIDEO_ENDPOINT = "flux-3-text-to-video";
export const MUAPI_IMAGE_TO_VIDEO_ENDPOINT = "flux-3-image-to-video";

/**
 * Option sets the video routes accept. The provider publishes these on its
 * `VideoModel` entries and the node pack uses them as enum prop values, so a
 * picker on either surface cannot offer a value the route rejects.
 */
export const MUAPI_VIDEO_DURATIONS = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
];
export const MUAPI_VIDEO_RESOLUTIONS = ["720p", "1080p"];
export const MUAPI_VIDEO_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9"
];

/** MuAPI rejects a source image larger than this, so refuse before uploading. */
export const MUAPI_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Ceiling on a downloaded result. A 10s 1080p clip is tens of megabytes; this
 * bounds the buffer a hostile or misconfigured result URL can make us hold.
 */
export const MUAPI_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

/** MuAPI reports a rejected job as `failure`, which no other vendor uses. */
const MUAPI_FAILURE_STATES: ReadonlySet<string> = new Set([
  ...TERMINAL_FAILURE_STATES,
  "failure"
]);

/** Result keys walked first when looking for the output URL. */
const OUTPUT_KEYS = [
  "url",
  "image",
  "image_url",
  "video",
  "video_url",
  "file_url",
  "output",
  "outputs",
  "images",
  "data",
  "result",
  "media",
  "content",
  "file"
] as const;

/** Keys a result body may report the charge under; absent leaves it unpriced. */
const COST_KEYS = ["cost", "credits_used"] as const;

/**
 * Keys inside a structured `cost`. MuAPI reports `cost: { amount_usd }`, so a
 * scalar-only reader leaves every receipt unpriced.
 */
const COST_AMOUNT_KEYS = ["amount_usd", "usd", "amount"] as const;

export interface MuapiPollOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

export interface MuapiMediaOptions extends MuapiPollOptions {
  apiKey: string;
  endpoint: string;
  payload: Record<string, unknown>;
  /** What the result must sniff as. A wrong-type body is a failure, not media. */
  kind: Extract<MediaKind, "image" | "video">;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function readIdentifier(value: unknown): string | undefined {
  const text = readString(value);
  if (text) return text;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * What may be put in an error message. MuAPI echoes the api key back in some
 * rejections, and its result bodies carry signed CDN URLs whose query string is
 * the credential — neither belongs in a log line a user pastes into an issue.
 */
export function sanitizeMuapiText(text: string, apiKey: string): string {
  const withoutKey =
    apiKey.trim().length > 0
      ? text.split(apiKey.trim()).join("<redacted-api-key>")
      : text;
  // Match the whole URL token with one greedy class and split at "?" in code.
  // Spelling the split as a regex (`[^\s"'\\]+?\?…`) makes the class ambiguous
  // with the "?" that follows it, so a body of many "http://" and no query
  // backtracks quadratically — CodeQL js/polynomial-redos, and a real cost on a
  // large error body. This form visits each character once.
  return withoutKey.replace(/https?:\/\/[^\s"'\\]*/g, (url) => {
    const query = url.indexOf("?");
    return query === -1 ? url : `${url.slice(0, query)}?<redacted>`;
  });
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey };
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return { ...authHeaders(apiKey), "Content-Type": "application/json" };
}

async function readBody(
  response: Response,
  apiKey: string
): Promise<{ body: unknown; text: string }> {
  const raw = await response.text();
  // Sanitize before truncating: slicing first can cut a credential in half and
  // leave the surviving fragment in the message.
  const text = sanitizeMuapiText(raw, apiKey).slice(0, 500);
  if (!raw.trim()) return { body: {}, text };
  try {
    return { body: JSON.parse(raw) as unknown, text };
  } catch {
    return { body: null, text };
  }
}

/**
 * Create a job. Attempted exactly once — MuAPI may already have accepted and
 * billed the request when a 5xx comes back.
 */
async function muapiSubmit(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const path = endpoint.replace(/^\/+/, "");
  const init: RequestInit = {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify(payload)
  };
  if (signal) init.signal = signal;

  const response = await fetch(`${MUAPI_BASE_URL}/${path}`, init);
  const { body, text } = await readBody(response, apiKey);
  if (!response.ok) {
    throw new Error(`MuAPI ${path} submit failed: ${response.status} ${text}`);
  }
  if (!isRecord(body)) {
    throw new Error(`MuAPI ${path} returned a non-object submit response: ${text}`);
  }

  const requestId = readIdentifier(body.request_id) ?? readIdentifier(body.id);
  if (!requestId) {
    throw new Error(`MuAPI ${path} returned no request_id: ${text}`);
  }
  // The seam reads this back after dispatch even when the job later fails.
  recordGenerationReceipt({ provider_request_id: requestId });
  return requestId;
}

function findOutputUrl(
  value: unknown,
  visited: Set<object>,
  depth: number
): string | undefined {
  if (depth > 8) return undefined;
  if (typeof value === "string") {
    const candidate = value.trim();
    return /^https?:\/\//i.test(candidate) ? candidate : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOutputUrl(item, visited, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value) || visited.has(value)) return undefined;
  visited.add(value);

  for (const key of OUTPUT_KEYS) {
    if (key in value) {
      const found = findOutputUrl(value[key], visited, depth + 1);
      if (found) return found;
    }
  }
  for (const item of Object.values(value)) {
    const found = findOutputUrl(item, visited, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The first http(s) URL in a result body, wherever MuAPI nested it. */
function pickMuapiOutputUrl(
  result: Record<string, unknown>,
  apiKey = ""
): string {
  const url = findOutputUrl(result, new Set<object>(), 0);
  if (!url) {
    throw new Error(
      `MuAPI result carried no output URL: ${sanitizeMuapiText(
        JSON.stringify(result).slice(0, 500),
        apiKey
      )}`
    );
  }
  return url;
}

/**
 * A non-negative amount, or undefined. `Number(null)` and `Number("")` are both
 * 0, so only a number or a non-empty numeric string counts — a missing field
 * must stay unpriced rather than record a free job.
 */
function readAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  const text = readString(value);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** The charge MuAPI reported for a finished job, when it reported one. */
export function readMuapiCost(result: Record<string, unknown>): number | null {
  for (const key of COST_KEYS) {
    const value = result[key];
    if (isRecord(value)) {
      for (const amountKey of COST_AMOUNT_KEYS) {
        const nested = readAmount(value[amountKey]);
        if (nested !== undefined) return nested;
      }
      continue;
    }
    const scalar = readAmount(value);
    if (scalar !== undefined) return scalar;
  }
  return null;
}

async function muapiPoll(
  apiKey: string,
  requestId: string,
  options: MuapiPollOptions = {}
): Promise<Record<string, unknown>> {
  const url = `${MUAPI_BASE_URL}/predictions/${encodeURIComponent(requestId)}/result`;
  const intervalMs = options.pollIntervalMs ?? 5000;
  const maxAttempts = options.maxAttempts ?? 360;

  const result = await pollUntilTerminal<Record<string, unknown>>(
    async () => {
      const init: RequestInit = { headers: authHeaders(apiKey) };
      if (options.signal) init.signal = options.signal;
      const response = await fetchWithRetry(url, init);
      const { body, text } = await readBody(response, apiKey);
      if (!isRecord(body)) {
        throw new Error(`MuAPI poll returned a non-object response: ${text}`);
      }
      const status = readString(body.status)?.toLowerCase() ?? "";
      // A non-2xx can still carry a structured failure body; report that as a
      // job failure so the user reads the reason rather than a status code.
      if (!response.ok && !MUAPI_FAILURE_STATES.has(status)) {
        throw new Error(`MuAPI poll failed: ${response.status} ${text}`);
      }
      return body;
    },
    {
      intervalMs,
      maxAttempts,
      signal: options.signal,
      success: TERMINAL_SUCCESS_STATES,
      failure: MUAPI_FAILURE_STATES,
      statusOf: (body) => {
        const status = readString(body.status)?.toLowerCase();
        if (status) return status;
        // A result body that already names an output URL is finished whether or
        // not it repeated a status word; without this a completed job would
        // poll to exhaustion and be reported as a timeout.
        return findOutputUrl(body, new Set<object>(), 0) ? "completed" : "";
      },
      onFailure: (body) => {
        const detail =
          readString(body.error) ??
          readString(body.message) ??
          JSON.stringify(body).slice(0, 500);
        return new Error(
          `MuAPI generation failed: ${sanitizeMuapiText(detail, apiKey)} ` +
            `(requestId: ${requestId})`
        );
      },
      onTimeout: () =>
        new Error(
          `MuAPI request ${requestId} did not finish within ${maxAttempts} poll attempts`
        )
    }
  );

  const cost = readMuapiCost(result);
  if (cost !== null) recordGenerationReceipt({ cost });
  return result;
}

/**
 * Read a response body, giving up as soon as it crosses `limit` rather than
 * after it is buffered. `content-length` is the sender's claim: a missing or
 * understated one used to let an arbitrarily large body be allocated in full
 * before the ceiling was checked. Cancels the stream on the first chunk that
 * crosses, so nothing past the limit is read or held.
 */
export async function readBodyWithLimit(
  response: Response,
  limit: number,
  tooLarge: string
): Promise<Uint8Array> {
  const body = response.body;
  if (!body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error(tooLarge);
    return bytes;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error(tooLarge);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Download a finished job's output. The URL comes out of the result body, so
 * `safeFetch` screens it and re-checks every redirect hop; 429/5xx are retried
 * because the job is already generated and billed and a transient CDN blip
 * must not throw the paid-for result away.
 */
async function muapiDownload(
  url: string,
  kind: Extract<MediaKind, "image" | "video">,
  signal?: AbortSignal
): Promise<Uint8Array> {
  assertSafePublicHttpsUrl(url);
  const init: RequestInit = signal ? { signal } : {};
  const response = await fetchWithRetry(url, init, {
    fetchImpl: (input, requestInit) =>
      safeFetch(String(input), requestInit as RequestInit)
  });
  if (!response.ok) {
    throw new Error(`MuAPI output download failed: HTTP ${response.status}`);
  }

  const tooLarge = `MuAPI output exceeds the ${MUAPI_MAX_OUTPUT_BYTES} byte limit`;
  // Refuse a declared length over the ceiling without opening the body at all;
  // a missing or understated one is caught chunk by chunk while reading.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MUAPI_MAX_OUTPUT_BYTES) {
    throw new Error(tooLarge);
  }
  const bytes = await readBodyWithLimit(
    response,
    MUAPI_MAX_OUTPUT_BYTES,
    tooLarge
  );
  if (bytes.length === 0) throw new Error("MuAPI returned an empty output file");

  const sniffed = sniffMedia(bytes);
  if (sniffed?.kind !== kind) {
    throw new Error(
      `MuAPI returned ${sniffed?.mime ?? "an unrecognized file"} where ` +
        `${kind} bytes were expected`
    );
  }
  return bytes;
}

/**
 * Upload a source image and return the hosted URL a submit references. Not
 * retried — the upload is a POST MuAPI may already have accepted.
 */
export async function muapiUploadImage(
  apiKey: string,
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<string> {
  if (bytes.length === 0) throw new Error("The input image is empty");
  if (bytes.length > MUAPI_MAX_UPLOAD_BYTES) {
    throw new Error(
      `MuAPI accepts source images up to ${MUAPI_MAX_UPLOAD_BYTES} bytes, got ${bytes.length}`
    );
  }

  const sniffed = sniffMedia(bytes);
  if (sniffed?.kind !== "image") {
    throw new Error(
      `MuAPI takes an image as the source frame, got ` +
        `${sniffed?.mime ?? "an unrecognized file"}`
    );
  }

  const mimeType = detectImageMime(bytes);
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(bytes)], { type: mimeType }),
    `input.${extForImageMime(mimeType) ?? "bin"}`
  );
  const init: RequestInit = {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form
  };
  if (signal) init.signal = signal;

  const response = await fetch(`${MUAPI_BASE_URL}/upload_file`, init);
  const { body, text } = await readBody(response, apiKey);
  if (!response.ok) {
    throw new Error(`MuAPI image upload failed: ${response.status} ${text}`);
  }
  if (!isRecord(body)) {
    throw new Error(`MuAPI image upload returned an invalid response: ${text}`);
  }

  const url = pickMuapiOutputUrl(body, apiKey);
  // The URL goes back to MuAPI on the submit and is fetched locally later, so
  // refuse an internal address here rather than at download time.
  assertSafePublicHttpsUrl(url);
  return url;
}

/** Submit, poll, and download one MuAPI job. */
export async function runMuapiMedia(
  options: MuapiMediaOptions
): Promise<Uint8Array> {
  const requestId = await muapiSubmit(
    options.apiKey,
    options.endpoint,
    options.payload,
    options.signal
  );
  const result = await muapiPoll(options.apiKey, requestId, {
    pollIntervalMs: options.pollIntervalMs,
    maxAttempts: options.maxAttempts,
    signal: options.signal
  });
  const url = pickMuapiOutputUrl(result, options.apiKey);
  return muapiDownload(url, options.kind, options.signal);
}
