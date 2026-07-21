/**
 * Shared FAL AI API utilities.
 * Uses @fal-ai/client SDK for queue submit/poll and file uploads.
 */

import { createFalClient, type FalClient } from "@fal-ai/client";

// ---------------------------------------------------------------------------
// API Key extraction
// ---------------------------------------------------------------------------

export function getFalApiKey(secrets: Record<string, string>): string {
  const key = secrets?.FAL_API_KEY || process.env.FAL_API_KEY || "";
  if (!key) throw new Error("FAL_API_KEY is not configured");
  return key;
}

// ---------------------------------------------------------------------------
// Client cache — one client per API key
// ---------------------------------------------------------------------------

const clientCache = new Map<string, FalClient>();

function getClient(apiKey: string): FalClient {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = createFalClient({ credentials: apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Submit job to FAL queue, poll until complete, return result
// ---------------------------------------------------------------------------

export async function falSubmit(
  apiKey: string,
  endpoint: string,
  args: Record<string, unknown>,
  onProgress?: (message: string) => void
): Promise<Record<string, unknown>> {
  return (await falSubmitWithMeta(apiKey, endpoint, args, onProgress)).data;
}

/**
 * Like {@link falSubmit} but also surfaces the FAL queue `requestId`, used to
 * look up the request's actual billed cost via the billing-events API.
 */
export async function falSubmitWithMeta(
  apiKey: string,
  endpoint: string,
  args: Record<string, unknown>,
  onProgress?: (message: string) => void
): Promise<{ data: Record<string, unknown>; requestId: string | null }> {
  const client = getClient(apiKey);
  const result = await client.subscribe(endpoint, {
    input: args,
    logs: true,
    onQueueUpdate: onProgress
      ? (update: { status: string; logs?: Array<{ message: string }> }) => {
          if (update.status === "IN_PROGRESS") {
            for (const entry of update.logs ?? []) {
              onProgress(entry.message);
            }
          }
        }
      : undefined
  });
  const data = (result.data ?? result) as Record<string, unknown>;
  const requestId =
    (result as { requestId?: string } | undefined)?.requestId ?? null;
  return { data, requestId };
}

// ---------------------------------------------------------------------------
// Upload to FAL CDN via SDK
// ---------------------------------------------------------------------------

export async function falUpload(
  apiKey: string,
  data: Uint8Array,
  contentType: string
): Promise<string> {
  const client = getClient(apiKey);
  const blob = new Blob([data.slice().buffer as ArrayBuffer], {
    type: contentType
  });
  return client.storage.upload(blob);
}

// ---------------------------------------------------------------------------
// Resolve asset ref to FAL-accessible URL
// ---------------------------------------------------------------------------

interface UploadContext {
  storage?: {
    retrieve(uri: string): Promise<Uint8Array | null | undefined>;
  } | null;
  resolveAssetBytes?: (
    uri: string
  ) => Promise<{ bytes: Uint8Array | null }>;
}

export async function assetToFalUrl(
  apiKey: string,
  ref: Record<string, unknown>,
  context?: UploadContext
): Promise<string | null> {
  let uri = ref.uri as string | undefined;
  // A library-picked or generated ref may carry only `asset_id` (empty `uri`).
  // Encode it as an `asset://<id>` URI so the trusted context-resolver branch
  // below uploads it instead of dropping the ref.
  if (!uri && typeof ref.asset_id === "string" && ref.asset_id) {
    uri = `asset://${ref.asset_id}`;
  }
  // Only pass through URLs that FAL can definitely access (their own CDN)
  if (uri?.includes("fal.media") || uri?.includes("fal.run")) return uri;
  const data = ref.data as string | undefined;
  if (data) {
    const bytes = Uint8Array.from(Buffer.from(data, "base64"));
    const contentType = inferContentType(ref.type as string);
    return falUpload(apiKey, bytes, contentType);
  }
  // For non-HTTPS URIs (http://, file://, relative paths, etc.), try to fetch and upload
  if (uri) {
    // Asset/package reference URIs are resolved via the context's canonical
    // resolver — storage adapters only understand their own schemes and return
    // null for `asset://<id>` / `package://<pkg>/<path>` references.
    if (
      (uri.startsWith("asset://") || uri.startsWith("package://")) &&
      context?.resolveAssetBytes
    ) {
      const { bytes } = await context.resolveAssetBytes(uri);
      if (bytes) {
        return falUpload(apiKey, bytes, inferContentType(ref.type as string));
      }
    }

    const bytes = await context?.storage?.retrieve(uri);
    if (bytes) {
      return falUpload(apiKey, bytes, inferContentType(ref.type as string));
    }

    try {
      // Resolve relative paths (e.g. /api/storage/...) against local server
      const fetchUrl = uri.startsWith("/")
        ? `http://localhost:${process.env.PORT ?? 7777}${uri}`
        : uri;
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType =
          res.headers.get("content-type") ??
          inferContentType(ref.type as string);
        return falUpload(apiKey, bytes, contentType);
      }
    } catch {
      // URI not fetchable — fall through
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Convert image ref to data:image/...;base64,... URL
// ---------------------------------------------------------------------------

export async function imageToDataUrl(
  ref: Record<string, unknown>,
  context?: UploadContext
): Promise<string | null> {
  const data = ref.data as string | undefined;
  const mime = inferMimeFromRef(ref) ?? "image/png";
  if (data) return `data:${mime};base64,${data}`;
  const uri = ref.uri as string | undefined;
  if (uri?.startsWith("https://")) {
    const res = await fetch(uri);
    const contentType = res.headers?.get?.("content-type") ?? mime;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  }
  // Asset/package refs — including a library-picked ref carrying only
  // `asset_id` — resolve through the trusted context resolver, never a direct
  // fetch (storage adapters return null for these schemes).
  const assetUri =
    uri?.startsWith("asset://") || uri?.startsWith("package://")
      ? uri
      : typeof ref.asset_id === "string" && ref.asset_id
        ? `asset://${ref.asset_id}`
        : null;
  if (assetUri && context?.resolveAssetBytes) {
    const { bytes } = await context.resolveAssetBytes(assetUri);
    if (bytes) {
      return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    }
  }
  return null;
}

/** Infer MIME type from an asset ref's uri extension. */
function inferMimeFromRef(ref: Record<string, unknown>): string | null {
  const uri = ref.uri as string | undefined;
  if (uri) {
    const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp"
    };
    if (ext && map[ext]) return map[ext];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function inferContentType(assetType: string | undefined): string {
  switch (assetType) {
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

export function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  // A library-picked or freshly-generated ref carries only `asset_id` (with an
  // empty `uri`); it still resolves to bytes via the processing context, so
  // treat a non-empty `asset_id` as a source. `null`/`""` stay unset.
  return Boolean(r.data || r.uri || r.asset_id);
}

// ---------------------------------------------------------------------------
// Build a proper ImageRef from a FAL image response object
// ---------------------------------------------------------------------------

export interface FalImageResult {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

export function falImageToRef(img: FalImageResult): Record<string, unknown> {
  return {
    type: "image",
    uri: img.url,
    width: img.width,
    height: img.height,
    mimeType: img.content_type
  };
}

export function removeNulls(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null || obj[k] === "") {
      delete obj[k];
    } else if (typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      removeNulls(obj[k] as Record<string, unknown>);
    }
  }
}
