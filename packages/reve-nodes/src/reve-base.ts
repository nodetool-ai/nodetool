/**
 * Shared Reve API utilities.
 *
 * Reve's image API (https://api.reve.com/console/docs) exposes three POST
 * endpoints that all share the same auth, postprocessing, and JSON response
 * shape:
 *  - POST /v1/image/create  — text → image
 *  - POST /v1/image/edit    — instruction + reference image → image
 *  - POST /v1/image/remix   — prompt + 1–6 reference images → image
 *
 * Wire spec:
 *  - Auth:    `Authorization: Bearer <REVE_API_KEY>`.
 *  - Accept:  `application/json` → response carries a base64 PNG in `image`.
 *  - Images:  `reference_image` / `reference_images[]` are base64-encoded
 *             strings (no data: prefix).
 *  - Response (200): { image, version, content_violation, request_id,
 *             credits_used, credits_remaining }.
 *
 * Uses native fetch (Node 18+). Asset → base64 resolution mirrors the other
 * media node packs: inline data, data URIs, the workflow storage backend,
 * `file://` paths, and remote `http(s)` URLs are all supported.
 */

import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

export const REVE_API_BASE = "https://api.reve.com";

/** Aspect ratios accepted by every Reve image endpoint. */
export const REVE_ASPECT_RATIOS = [
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "1:1"
] as const;

/** Optional postprocessing operations applied to the generated image. */
export const REVE_POSTPROCESSING = [
  "none",
  "upscale",
  "remove_background",
  "fit_image",
  "effect"
] as const;

export type ReveEndpoint = "create" | "edit" | "remix";

export interface ReveImageResponse {
  image: string;
  version?: string;
  content_violation?: boolean;
  request_id?: string;
  credits_used?: number;
  credits_remaining?: number;
}

type StorageLike = {
  retrieve: (uri: string) => Promise<Uint8Array | null> | Uint8Array | null;
} | null;

type AssetContext =
  | {
      storage?: StorageLike;
      resolveAssetBytes?: (
        uri: string
      ) => Promise<{ bytes: Uint8Array | null }>;
    }
  | undefined;

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

export function getReveApiKey(secrets: Record<string, string>): string {
  const key = secrets?.REVE_API_KEY || process.env.REVE_API_KEY || "";
  if (!key) throw new Error("REVE_API_KEY is not configured");
  return key;
}

// ---------------------------------------------------------------------------
// Asset → base64
// ---------------------------------------------------------------------------

function localFilePath(uri: string): string {
  try {
    return fileURLToPath(new URL(uri));
  } catch {
    return uri.slice("file://".length);
  }
}

/**
 * The `ImageRef` fields this pack resolves bytes from. Node props arrive
 * untyped from the graph, so the contract is stated here rather than at each
 * read: bytes inline, base64 (bare or as a data URI), or a URI to fetch.
 */
export interface ReveImageInput {
  uri?: string;
  data?: Uint8Array | string;
}

/** Whether an image payload arrived base64-encoded rather than as bytes. */
function isEncodedData(data: Uint8Array | string): data is string {
  return typeof data === "string";
}

/** Resolve an ImageRef-like value to raw bytes. */
export async function refToBytes(
  ref: ReveImageInput | null | undefined,
  context?: AssetContext
): Promise<Uint8Array> {
  if (!ref) {
    throw new Error("Image is required");
  }
  const r = ref;

  if (r.data) {
    if (isEncodedData(r.data)) {
      const inline = r.data.match(/^data:[^;]*;base64,(.+)$/s);
      const b64 = inline ? inline[1] : r.data;
      return new Uint8Array(Buffer.from(b64, "base64"));
    }
    return r.data;
  }

  const uri = r.uri;
  if (!uri) throw new Error("Image has no data or URI");

  const dataUriMatch = uri.match(/^data:[^;]*;base64,(.+)$/s);
  if (dataUriMatch) {
    return new Uint8Array(Buffer.from(dataUriMatch[1], "base64"));
  }

  if (
    (uri.startsWith("asset://") || uri.startsWith("package://")) &&
    context?.resolveAssetBytes
  ) {
    const { bytes } = await context.resolveAssetBytes(uri);
    if (bytes) return new Uint8Array(bytes);
  }

  if (context?.storage) {
    const stored = await context.storage.retrieve(uri);
    if (stored) return new Uint8Array(stored);
  }

  if (uri.startsWith("file://")) {
    return new Uint8Array(await fs.readFile(localFilePath(uri)));
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const resp = await fetch(uri);
    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
    return new Uint8Array(await resp.arrayBuffer());
  }

  throw new Error(`Cannot resolve image URI: ${uri}`);
}

/** Resolve an ImageRef-like value to a base64 string (no data: prefix). */
export async function refToBase64(
  ref: ReveImageInput | null | undefined,
  context?: AssetContext
): Promise<string> {
  const bytes = await refToBytes(ref, context);
  return Buffer.from(bytes).toString("base64");
}

// ---------------------------------------------------------------------------
// Response → ImageRef
// ---------------------------------------------------------------------------

/** The `ImageRef` this pack emits: a base64 PNG, sized when sharp is present. */
export interface ReveImageRef {
  type: "image";
  uri: string;
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/** Build an ImageRef from a base64 PNG, attaching dimensions when sharp is available. */
export async function reveImageToRef(base64: string): Promise<ReveImageRef> {
  const ref: ReveImageRef = {
    type: "image",
    uri: "",
    data: base64,
    mimeType: "image/png"
  };
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(base64, "base64")).metadata();
    if (meta.width) ref.width = meta.width;
    if (meta.height) ref.height = meta.height;
    if (meta.format) ref.mimeType = `image/${meta.format}`;
  } catch {
    // sharp is optional — fall back to the base64 payload without dimensions.
  }
  return ref;
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * The fields the three Reve image endpoints accept. Each node fills the subset
 * its endpoint uses, and `cleanBody` drops whatever it left unset.
 */
export interface ReveRequestBody {
  /** `create` and `remix`. */
  prompt?: string;
  /** `edit`. */
  edit_instruction?: string;
  /** `edit`: one base64 image, no data: prefix. */
  reference_image?: string;
  /** `remix`: 1–6 base64 images, no data: prefix. */
  reference_images?: string[];
  aspect_ratio?: string;
  version?: string;
  postprocessing?: string[];
  test_time_scaling?: number;
}

/** One request field's value, before the empty ones are dropped. */
type ReveRequestField = ReveRequestBody[keyof ReveRequestBody];

/** Drop null/undefined/empty fields and an all-"none" postprocessing array. */
function cleanBody(body: ReveRequestBody): ReveRequestBody {
  const out: Record<string, ReveRequestField> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Normalize a postprocessing enum selection into the API's array form. The
 * selection is a node prop, so it arrives as whatever the graph stored.
 */
export function postprocessingArray(value: string | null | undefined): string[] {
  const v = String(value ?? "none");
  return v === "none" ? [] : [v];
}

/**
 * POST to a Reve image endpoint and return the parsed JSON response. Throws on
 * non-2xx responses and on flagged content (a content violation yields no
 * usable image).
 */
export async function reveGenerate(
  apiKey: string,
  endpoint: ReveEndpoint,
  body: ReveRequestBody
): Promise<ReveImageResponse> {
  const response = await fetch(`${REVE_API_BASE}/v1/image/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(cleanBody(body))
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Reve API error (${response.status}): ${errorText}`);
  }

  // SAFETY: a 2xx from the documented Reve endpoints carries this JSON shape;
  // the two fields read below (`content_violation`, `image`) are checked
  // immediately, and a missing `image` throws rather than reaching a node.
  const result = (await response.json()) as ReveImageResponse;
  if (result.content_violation) {
    throw new Error("Reve flagged this request as a content policy violation");
  }
  if (!result.image) {
    throw new Error("Reve returned no image");
  }
  return result;
}
