/**
 * Shared Replicate API utilities.
 * Uses plain fetch() — no SDK dependency.
 */

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReplicatePrediction {
  id: string;
  version: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  input: Record<string, unknown>;
  output: unknown;
  error: string | null;
  urls: { get: string; cancel: string };
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metrics?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API Key extraction
// ---------------------------------------------------------------------------

export function getReplicateApiKey(inputs: Record<string, unknown>): string {
  const key =
    (inputs._secrets as Record<string, string>)?.REPLICATE_API_TOKEN ||
    process.env.REPLICATE_API_TOKEN ||
    "";
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
    } else if (
      typeof obj[k] === "object" &&
      !Array.isArray(obj[k])
    ) {
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
 * External URLs (non-Replicate) are fetched and re-uploaded to
 * Replicate's files API so the model can access them. Data URIs
 * and Replicate-hosted URLs are passed through directly.
 */
export async function assetToUrl(
  ref: Record<string, unknown>,
  apiKey?: string
): Promise<string | null> {
  const uri = ref.uri as string | undefined;
  if (uri) {
    // Replicate-hosted URLs can be used directly
    if (uri.startsWith("https://replicate.delivery/") || uri.startsWith("https://api.replicate.com/")) {
      return uri;
    }
    // Data URIs can be used directly
    if (uri.startsWith("data:")) {
      return uri;
    }
    // External URLs: fetch and upload to Replicate
    if (apiKey && (uri.startsWith("http://") || uri.startsWith("https://"))) {
      try {
        return await uploadToReplicate(apiKey, uri);
      } catch {
        // Fall back to direct URL if upload fails
        return uri;
      }
    }
    // Local/relative paths (e.g. /api/storage/...): resolve via local server and upload
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
async function uploadToReplicate(apiKey: string, sourceUrl: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const ext = contentType.split("/")[1]?.split(";")[0] || "bin";

  const formData = new FormData();
  formData.append("content", new Blob([bytes], { type: contentType }), `upload.${ext}`);

  const uploadRes = await fetch(`${REPLICATE_API_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

  const data = (await uploadRes.json()) as { urls?: { get?: string }; id?: string };
  const replicateUrl = data.urls?.get;
  if (!replicateUrl) throw new Error("No URL in upload response");
  return replicateUrl;
}

/** Extract version hash from "owner/name:version" model identifier. */
export function extractVersion(modelId: string): {
  owner: string;
  name: string;
  version: string;
} {
  const colonIdx = modelId.lastIndexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Invalid model identifier "${modelId}": expected "owner/name:version"`
    );
  }
  const ownerName = modelId.slice(0, colonIdx);
  const version = modelId.slice(colonIdx + 1);
  const slashIdx = ownerName.indexOf("/");
  if (slashIdx === -1) {
    throw new Error(
      `Invalid model identifier "${modelId}": expected "owner/name:version"`
    );
  }
  return {
    owner: ownerName.slice(0, slashIdx),
    name: ownerName.slice(slashIdx + 1),
    version,
  };
}

// ---------------------------------------------------------------------------
// Submit + poll
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ITERATIONS = 900; // 900 * 2s = 30 min

function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

export async function replicateSubmit(
  apiKey: string,
  modelId: string,
  input: Record<string, unknown>
): Promise<ReplicatePrediction> {
  // Replicate accepts either {version: "hash"} for pinned versions
  // or {model: "owner/name"} for latest version.
  const body: Record<string, unknown> = { input };
  if (modelId.includes(":")) {
    body.version = modelId.split(":")[1];
  } else {
    body.model = modelId;
  }

  const res = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate API error ${res.status}: ${body}`);
  }

  let prediction: ReplicatePrediction = await res.json();

  if (isTerminal(prediction.status)) {
    if (prediction.status === "failed") {
      throw new Error(`Replicate prediction failed: ${prediction.error}`);
    }
    return prediction;
  }

  // Poll until terminal
  for (let i = 0; i < MAX_POLL_ITERATIONS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(
      `${REPLICATE_API_BASE}/predictions/${prediction.id}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!pollRes.ok) {
      const body = await pollRes.text();
      throw new Error(`Replicate poll error ${pollRes.status}: ${body}`);
    }

    prediction = await pollRes.json();

    if (isTerminal(prediction.status)) {
      if (prediction.status === "failed") {
        throw new Error(`Replicate prediction failed: ${prediction.error}`);
      }
      return prediction;
    }
  }

  throw new Error(
    `Replicate prediction ${prediction.id} timed out after ${MAX_POLL_ITERATIONS * POLL_INTERVAL_MS / 1000}s`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Output converters
// ---------------------------------------------------------------------------

/** Extract the first URL from Replicate output (may be string, array, or object). */
function extractUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        const url = (item as Record<string, unknown>).url as string | undefined;
        if (url) return url;
      }
    }
    return null;
  }
  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
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
