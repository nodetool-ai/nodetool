/**
 * Shared Replicate API utilities.
 * Uses the official Replicate TypeScript SDK.
 */

import Replicate from "replicate";

// ---------------------------------------------------------------------------
// Client cache — one Replicate client instance per API key
// ---------------------------------------------------------------------------

const _clients = new Map<string, Replicate>();

function getClient(apiKey: string): Replicate {
  let client = _clients.get(apiKey);
  if (!client) {
    client = new Replicate({ auth: apiKey });
    _clients.set(apiKey, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// API Key extraction
// ---------------------------------------------------------------------------

export function getReplicateApiKey(secrets: Record<string, string>): string {
  const key =
    secrets?.REPLICATE_API_TOKEN || process.env.REPLICATE_API_TOKEN || "";
  if (!key) throw new Error("REPLICATE_API_TOKEN is not configured");
  return key;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Delete `null`/`undefined`/empty-string keys from the top level of an object.
 *
 * Intentionally NON-recursive: API args are a flat bag of parameters, and the
 * only nested objects are pass-through `dict[...]` inputs supplied by the user
 * (json_schema, response_format, …). Recursing would mutate those in place and
 * silently strip sub-keys the user meant to send. `0` and `false` are kept.
 */
export function removeNulls(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null || obj[k] === "") {
      delete obj[k];
    }
  }
}

/** Check if an asset ref has meaningful content (uri or data). */
export function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return Boolean(r.data || r.uri);
}

interface UploadContext {
  storage?: {
    retrieve(uri: string): Promise<Uint8Array | null | undefined>;
  } | null;
  resolveAssetBytes?: (
    uri: string
  ) => Promise<{ bytes: Uint8Array | null }>;
}

/**
 * Convert an asset ref to a Replicate-accessible URL.
 *
 * Data URIs and Replicate-hosted URLs are passed through directly.
 * External URLs and local paths are fetched and uploaded to Replicate's
 * files API via the SDK so the model can access them.
 */
export async function assetToUrl(
  ref: Record<string, unknown>,
  apiKey?: string,
  context?: UploadContext
): Promise<string | null> {
  const uri = ref.uri as string | undefined;
  if (uri) {
    // Replicate-hosted URLs can be used directly
    if (
      uri.startsWith("https://replicate.delivery/") ||
      uri.startsWith("https://api.replicate.com/")
    ) {
      return uri;
    }
    // Data URIs can be used directly
    if (uri.startsWith("data:")) {
      return uri;
    }
    // External URLs: fetch and upload to Replicate via SDK
    if (apiKey && (uri.startsWith("http://") || uri.startsWith("https://"))) {
      try {
        return await uploadToReplicate(apiKey, uri);
      } catch {
        return uri;
      }
    }
    // Asset/package references: resolve to bytes via the context and upload.
    // Storage adapters only understand their own URI schemes, so these refs
    // must go through resolveAssetBytes (asset://<id>, package://<pkg>/<path>).
    if (
      apiKey &&
      context?.resolveAssetBytes &&
      (uri.startsWith("asset://") || uri.startsWith("package://"))
    ) {
      const { bytes } = await context.resolveAssetBytes(uri);
      if (bytes) {
        return uploadBytesToReplicate(
          apiKey,
          bytes,
          inferMime(ref),
          filenameForMime(inferMime(ref))
        );
      }
    }
    // Local/relative paths: resolve via local server and upload
    if (apiKey && uri.startsWith("/")) {
      const bytes = await context?.storage?.retrieve(uri);
      if (bytes) {
        return uploadBytesToReplicate(
          apiKey,
          bytes,
          inferMime(ref),
          filenameForMime(inferMime(ref))
        );
      }
      const port = process.env.PORT ?? "7777";
      const localUrl = `http://127.0.0.1:${port}${uri}`;
      try {
        return await uploadToReplicate(apiKey, localUrl);
      } catch {
        // A relative path is useless to Replicate — omit it rather than
        // handing the model a URL it cannot fetch.
        return null;
      }
    }
    return uri;
  }
  const data = ref.data as string | undefined;
  if (data) {
    const mime = inferMime(ref);
    return `data:${mime};base64,${data}`;
  }
  return null;
}

async function uploadBytesToReplicate(
  apiKey: string,
  bytes: Uint8Array,
  contentType: string,
  filename: string
): Promise<string> {
  const client = getClient(apiKey);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: contentType
  });
  const file = await client.files.create(blob, { filename });
  const fileUrl = (file as unknown as Record<string, unknown>).urls as
    | Record<string, string>
    | undefined;
  if (fileUrl?.get) return fileUrl.get;
  throw new Error("No URL in upload response");
}

/**
 * Fetch a URL and upload the content to Replicate's files API.
 * Returns the Replicate-hosted URL that models can access.
 */
async function uploadToReplicate(
  apiKey: string,
  sourceUrl: string
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType =
    res.headers.get("content-type") || "application/octet-stream";
  const ext = contentType.split("/")[1]?.split(";")[0] || "bin";

  return uploadBytesToReplicate(apiKey, bytes, contentType, `upload.${ext}`);
}

// ---------------------------------------------------------------------------
// Submit via SDK
// ---------------------------------------------------------------------------

export interface ReplicateResult {
  output: unknown;
}

/**
 * Run a Replicate model and return the output.
 *
 * Uses `replicate.run()` which handles prediction creation, polling,
 * and waiting for completion internally.
 */
export async function replicateSubmit(
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>
): Promise<ReplicateResult> {
  const client = getClient(apiKey);
  const output = await client.run(modelId as `${string}/${string}`, { input });
  return { output };
}

// ---------------------------------------------------------------------------
// Output converters
// ---------------------------------------------------------------------------

const URL_LIKE = /^(https?:|data:)/;

/**
 * Extract the first URL from Replicate output. Handles:
 *   - bare string URLs
 *   - FileOutput objects (a `.url()` method or a `.url` string property)
 *   - arrays (recursively, returning the first match)
 *   - objects that wrap the asset under a named key (e.g. `{ image: ... }`,
 *     `{ output: <FileOutput> }`), found by scanning values for the first
 *     URL-like string or nested FileOutput/array/object.
 */
function extractUrl(output: unknown): string | null {
  // A bare string output is itself the URL (the model's contract).
  if (typeof output === "string") return output;
  return extractUrlFromValue(output);
}

function extractUrlFromValue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  // FileOutput: a `.url()` method or a `.url` string property.
  if ("url" in value) {
    const u = (value as { url: unknown }).url;
    if (typeof u === "function") {
      const resolved = (u as () => unknown).call(value);
      if (resolved) return String(resolved);
    } else if (u) {
      return String(u);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = urlFromAny(item);
      if (url) return url;
    }
    return null;
  }

  for (const v of Object.values(value as Record<string, unknown>)) {
    const url = urlFromAny(v);
    if (url) return url;
  }
  return null;
}

/** A nested string only counts if it looks like a URL; otherwise recurse. */
function urlFromAny(value: unknown): string | null {
  if (typeof value === "string") return URL_LIKE.test(value) ? value : null;
  return extractUrlFromValue(value);
}

export function outputToImageRef(output: unknown): Record<string, unknown> {
  const url = extractUrl(output);
  if (!url) return { type: "image" };
  return { type: "image", uri: url };
}

export function outputToVideoRef(output: unknown): Record<string, unknown> {
  const url = extractUrl(output);
  if (!url) return { type: "video" };
  return { type: "video", uri: url };
}

export function outputToAudioRef(output: unknown): Record<string, unknown> {
  const url = extractUrl(output);
  if (!url) return { type: "audio" };
  return { type: "audio", uri: url };
}

export function outputToString(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.join("");
  if (output == null) return "";
  return JSON.stringify(output);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function inferMime(ref: Record<string, unknown>): string {
  const t = ref.type as string | undefined;
  switch (t) {
    case "image":
      return "image/png";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
}

function filenameForMime(mime: string): string {
  const ext = mime.split("/")[1]?.split(";")[0] || "bin";
  return `upload.${ext}`;
}
