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

/** Recursively delete null/undefined/empty/zero keys from an object. */
export function removeNulls(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null || obj[k] === "" || obj[k] === 0) {
      delete obj[k];
    } else if (typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      removeNulls(obj[k] as Record<string, unknown>);
    }
  }
}

/** Check if an asset ref has meaningful content (uri or data). */
export function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return Boolean(r.data || r.uri || r.asset_id);
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
  apiKey?: string
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
    // Local/relative paths: resolve via local server and upload
    if (apiKey && uri.startsWith("/")) {
      const port = process.env.PORT ?? "7777";
      const localUrl = `http://127.0.0.1:${port}${uri}`;
      try {
        return await uploadToReplicate(apiKey, localUrl);
      } catch {
        return uri;
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

  const client = getClient(apiKey);
  const file = await (client.files as any).create({
    content: new Blob([bytes], { type: contentType }),
    filename: `upload.${ext}`
  });
  const fileUrl = (file as unknown as Record<string, unknown>).urls as
    | Record<string, string>
    | undefined;
  if (fileUrl?.get) return fileUrl.get;
  throw new Error("No URL in upload response");
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

/** Extract the first URL from Replicate output (may be string, array, FileOutput, or object). */
function extractUrl(output: unknown): string | null {
  if (typeof output === "string") return output;

  // FileOutput (ReadableStream with .url() method that returns URL object)
  if (output && typeof output === "object" && "url" in output) {
    const urlFn = (output as { url: () => unknown }).url;
    if (typeof urlFn === "function") {
      const url = urlFn.call(output);
      if (url) return String(url);
    }
    // .url might be a string property instead
    const urlProp = (output as Record<string, unknown>).url;
    if (urlProp) return String(urlProp);
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractUrl(item);
      if (url) return url;
    }
    return null;
  }

  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (typeof o.output === "string") return o.output;
  }
  return null;
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
