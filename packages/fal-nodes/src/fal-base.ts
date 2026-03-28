/**
 * Shared FAL AI API utilities.
 * Uses @fal-ai/client SDK for queue submit/poll and file uploads.
 */

import { createFalClient, type FalClient } from "@fal-ai/client";

/** Unit list price for a model endpoint (from FAL Platform GET /v1/models/pricing, embedded at codegen). */
export interface FalUnitPricing {
  readonly endpointId: string;
  readonly unitPrice: number;
  readonly billingUnit: string;
  readonly currency: string;
}

// ---------------------------------------------------------------------------
// API Key extraction
// ---------------------------------------------------------------------------

export function getFalApiKey(secrets: Record<string, string>): string {
  const key =
    secrets?.FAL_API_KEY ||
    process.env.FAL_API_KEY ||
    "";
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
): Promise<Record<string, unknown>> {
  const client = getClient(apiKey);
  const result = await client.subscribe(endpoint, {
    input: args,
    logs: true,
  });
  return (result.data ?? result) as Record<string, unknown>;
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
  const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: contentType });
  return client.storage.upload(blob);
}

// ---------------------------------------------------------------------------
// Resolve asset ref to FAL-accessible URL
// ---------------------------------------------------------------------------

export async function assetToFalUrl(
  apiKey: string,
  ref: Record<string, unknown>
): Promise<string | null> {
  const uri = ref.uri as string | undefined;
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
    try {
      // Resolve relative paths (e.g. /api/storage/...) against local server
      const fetchUrl = uri.startsWith("/")
        ? `http://localhost:${process.env.PORT ?? 7777}${uri}`
        : uri;
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") ?? inferContentType(ref.type as string);
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
  ref: Record<string, unknown>
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
  return null;
}

/** Infer MIME type from an asset ref's uri extension. */
function inferMimeFromRef(ref: Record<string, unknown>): string | null {
  const uri = ref.uri as string | undefined;
  if (uri) {
    const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      bmp: "image/bmp",
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
  return Boolean(r.data || r.uri || r.asset_id);
}

export function removeNulls(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null || obj[k] === "") {
      delete obj[k];
    } else if (
      typeof obj[k] === "object" &&
      !Array.isArray(obj[k])
    ) {
      removeNulls(obj[k] as Record<string, unknown>);
    }
  }
}

// ---------------------------------------------------------------------------
// FAL media payloads → NodeTool asset refs (Preview / edges expect uri + type)
// ---------------------------------------------------------------------------

type FalAssetKind = "image" | "video" | "audio";

function makeEmptyAssetRef(mediaType: FalAssetKind): Record<string, unknown> {
  return {
    type: mediaType,
    uri: "",
    asset_id: null,
    data: null,
    metadata: null,
  };
}

/**
 * Map a FAL file object `{ url, width, height, content_type? }` to an asset ref.
 */
export function falFileObjectToAssetRef(
  payload: unknown,
  mediaType: FalAssetKind
): Record<string, unknown> {
  const empty = makeEmptyAssetRef(mediaType);
  if (!payload || typeof payload !== "object") {
    return empty;
  }
  const url = (payload as { url?: unknown }).url;
  if (typeof url === "string" && url.length > 0) {
    return { ...empty, uri: url };
  }
  return empty;
}

/**
 * Map a FAL file object `{ url, ... }` to an ImageRef.
 */
export function falMediaPayloadToImageRef(payload: unknown): Record<string, unknown> {
  return falFileObjectToAssetRef(payload, "image");
}

/**
 * Coerce one FAL response field to the shape declared by @prop / outputTypes.
 * Used by fal-codegen for multi-output nodes (dict / any with outputFields).
 */
export function coerceFalOutputForPropType(
  propType: string,
  raw: unknown
): unknown {
  const listMatch = /^list\[(.+)\]$/.exec(propType);
  if (listMatch) {
    const inner = listMatch[1].toLowerCase();
    if (inner === "image") {
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw.map((item) => falMediaPayloadToImageRef(item));
    }
    if (inner === "video") {
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw.map((item) => falFileObjectToAssetRef(item, "video"));
    }
    if (inner === "audio") {
      if (!Array.isArray(raw)) {
        return [];
      }
      return raw.map((item) => falFileObjectToAssetRef(item, "audio"));
    }
    return Array.isArray(raw) ? raw : [];
  }

  switch (propType) {
    case "image":
      return falMediaPayloadToImageRef(raw);
    case "video":
      return falFileObjectToAssetRef(raw, "video");
    case "audio":
      return falFileObjectToAssetRef(raw, "audio");
    case "str":
      if (raw == null) {
        return "";
      }
      if (typeof raw === "string") {
        return raw;
      }
      return JSON.stringify(raw);
    case "enum":
      return raw == null ? "" : String(raw);
    case "int":
      return typeof raw === "number" ? Math.trunc(raw) : Number(raw);
    case "float":
      return typeof raw === "number" ? raw : Number(raw);
    case "bool":
      return Boolean(raw);
    default:
      return raw;
  }
}
