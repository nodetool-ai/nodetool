import type { ImageRef, VideoRef } from "@nodetool-ai/node-sdk";
import {
  assertSafePublicHttpsUrl,
  detectImageMime,
  loadMediaRefBytes,
  safeFetch,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import {
  fetchWithRetry,
  imageRefFromBytes,
  pollUntilTerminal,
  TERMINAL_FAILURE_STATES,
  TERMINAL_SUCCESS_STATES
} from "@nodetool-ai/runtime/provider-transport";

export const MUAPI_BASE_URL = "https://api.muapi.ai/api/v1";

export const MUAPI_IMAGE_MODELS = [
  "flux-3-text-to-image",
  "flux-3-dev"
] as const;

export const MUAPI_IMAGE_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "2:3",
  "3:2",
  "21:9"
] as const;

export const MUAPI_VIDEO_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9"
] as const;

export const MUAPI_IMAGE_RESOLUTIONS = ["1k", "2k", "4k"] as const;
export const MUAPI_VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;

export function normalizeMuapiVideoDuration(value: unknown): number {
  const duration = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(duration)) return 5;
  return Math.min(10, Math.max(4, Math.round(duration)));
}

const MUAPI_FAILURE_STATES = new Set([
  ...TERMINAL_FAILURE_STATES,
  "failure"
]);

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
  "prediction",
  "media",
  "content",
  "file"
] as const;

export interface MuapiPollOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

export interface GenerateMuapiMediaOptions {
  apiKey: string;
  endpoint: string;
  payload: Record<string, unknown>;
  kind: "image" | "video";
  pollIntervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readIdentifier(value: unknown): string | undefined {
  const stringValue = readString(value);
  if (stringValue) return stringValue;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

async function readJsonResponse(
  response: Response
): Promise<{ body: unknown; text: string }> {
  const text = await response.text();
  if (!text.trim()) return { body: {}, text };
  try {
    return { body: JSON.parse(text) as unknown, text };
  } catch {
    return { body: null, text };
  }
}

function apiUrl(endpoint: string): string {
  return `${MUAPI_BASE_URL}/${endpoint.replace(/^\/+/, "")}`;
}

export function getMuapiApiKey(
  secrets: Record<string, string> | undefined
): string {
  const key = secrets?.MUAPI_API_KEY || process.env.MUAPI_API_KEY || "";
  if (!key.trim()) throw new Error("MUAPI_API_KEY is not configured");
  return key.trim();
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "Content-Type": "application/json"
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey };
}

/** Submit exactly once: the provider may have created a billable job already. */
export async function submitMuapi(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const init: RequestInit = {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify(payload)
  };
  if (signal) init.signal = signal;

  const response = await fetch(apiUrl(endpoint), init);
  const { body, text } = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `MuAPI ${endpoint} submit failed: ${response.status} ${text.slice(0, 500)}`
    );
  }
  if (!isRecord(body)) {
    throw new Error(
      `MuAPI ${endpoint} returned a non-object submission response: ${text.slice(0, 500)}`
    );
  }

  const requestId = readIdentifier(body.request_id) ?? readIdentifier(body.id);
  if (!requestId) {
    throw new Error(
      `MuAPI ${endpoint} returned no request_id: ${text.slice(0, 500)}`
    );
  }
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
  if (!isRecord(value)) return undefined;
  if (visited.has(value)) return undefined;
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

export function pickMuapiOutputUrl(result: Record<string, unknown>): string {
  const url = findOutputUrl(result, new Set<object>(), 0);
  if (!url) {
    throw new Error(
      `MuAPI result did not contain an output URL: ${JSON.stringify(result).slice(0, 500)}`
    );
  }
  return url;
}

export async function pollMuapi(
  apiKey: string,
  requestId: string,
  options: MuapiPollOptions = {}
): Promise<Record<string, unknown>> {
  const pollUrl = apiUrl(`predictions/${encodeURIComponent(requestId)}/result`);
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  const maxAttempts = options.maxAttempts ?? 360;

  return pollUntilTerminal<Record<string, unknown>>(
    async () => {
      const init: RequestInit = { headers: authHeaders(apiKey) };
      if (options.signal) init.signal = options.signal;
      const response = await fetchWithRetry(pollUrl, init, {
        maxAttempts: 6
      });
      const { body, text } = await readJsonResponse(response);
      if (!isRecord(body)) {
        throw new Error(
          `MuAPI poll returned a non-object response: ${text.slice(0, 500)}`
        );
      }

      const status = readString(body.status)?.toLowerCase();
      if (!response.ok && !MUAPI_FAILURE_STATES.has(status ?? "")) {
        throw new Error(`MuAPI poll failed: ${response.status} ${text.slice(0, 500)}`);
      }
      return body;
    },
    {
      intervalMs: pollIntervalMs,
      maxAttempts,
      signal: options.signal,
      success: TERMINAL_SUCCESS_STATES,
      failure: MUAPI_FAILURE_STATES,
      statusOf: (body) => {
        const status = readString(body.status)?.toLowerCase();
        if (status) return status;
        return findOutputUrl(body, new Set<object>(), 0)
          ? "completed"
          : "";
      },
      onFailure: (body) => {
        const detail =
          readString(body.error) ??
          readString(body.message) ??
          JSON.stringify(body).slice(0, 500);
        return new Error(`MuAPI generation failed: ${detail}`);
      },
      onTimeout: () =>
        new Error(
          `MuAPI request ${requestId} timed out after ${maxAttempts} poll attempts`
        )
    }
  );
}

/** Download an already-generated result with SSRF checks and GET retries. */
export async function downloadMuapiOutput(
  url: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const init: RequestInit = signal ? { signal } : {};
  const response = await fetchWithRetry(url, init, {
    maxAttempts: 6,
    fetchImpl: (input, requestInit) =>
      safeFetch(String(input), requestInit)
  });
  if (!response.ok) {
    throw new Error(`MuAPI output download failed: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("MuAPI returned an empty output file");
  return bytes;
}

export async function uploadMuapiImage(
  apiKey: string,
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<string> {
  if (bytes.length === 0) throw new Error("Input image is empty");

  const mimeType = detectImageMime(bytes);
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(bytes)], { type: mimeType }),
    `input.${mimeType.split("/")[1] ?? "bin"}`
  );
  const init: RequestInit = {
    method: "POST",
    headers: authHeaders(apiKey),
    body: form
  };
  if (signal) init.signal = signal;

  const response = await fetch(apiUrl("upload_file"), init);
  const { body, text } = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`MuAPI image upload failed: ${response.status} ${text.slice(0, 500)}`);
  }
  if (!isRecord(body)) {
    throw new Error(`MuAPI image upload returned an invalid response: ${text.slice(0, 500)}`);
  }

  const url = pickMuapiOutputUrl(body);
  // The URL is sent back to MuAPI and later downloaded locally; enforce the
  // same public HTTPS contract at the boundary instead of accepting a local URL.
  // `safeFetch` repeats this check when the generated media is downloaded.
  // Keeping it here also prevents sending an internal URL back to the provider.
  assertSafePublicHttpsUrl(url);
  return url;
}

export function videoRefFromBytes(bytes: Uint8Array): VideoRef {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(bytes).toString("base64"),
    format: "mp4"
  };
}

export function generateMuapiMedia(
  options: GenerateMuapiMediaOptions & { kind: "image" }
): Promise<ImageRef>;
export function generateMuapiMedia(
  options: GenerateMuapiMediaOptions & { kind: "video" }
): Promise<VideoRef>;
export async function generateMuapiMedia(
  options: GenerateMuapiMediaOptions
): Promise<ImageRef | VideoRef> {
  const requestId = await submitMuapi(
    options.apiKey,
    options.endpoint,
    options.payload,
    options.signal
  );
  const result = await pollMuapi(options.apiKey, requestId, {
    pollIntervalMs: options.pollIntervalMs,
    maxAttempts: options.maxAttempts,
    signal: options.signal
  });
  const outputUrl = pickMuapiOutputUrl(result);
  const bytes = await downloadMuapiOutput(outputUrl, options.signal);
  if (options.kind === "image") return imageRefFromBytes(bytes);
  return videoRefFromBytes(bytes);
}

export async function resolveInputImageBytes(
  image: Parameters<typeof loadMediaRefBytes>[0],
  context?: ProcessingContext
): Promise<Uint8Array> {
  const bytes = await loadMediaRefBytes(image, context);
  if (!bytes || bytes.length === 0) throw new Error("An input image is required");
  return bytes;
}
