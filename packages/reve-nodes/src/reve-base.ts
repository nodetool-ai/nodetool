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
 *  - Images:  `reference_image` / `reference_images[]` are base64-encoded
 *             strings (no data: prefix).
 *  - Response (200): { image, version, content_violation, request_id,
 *             credits_used, credits_remaining }.
 *
 * Nodes reach Reve through `context.callProviderEndpoint` and the runtime
 * `ReveProvider`, which holds the API key and writes the generation record.
 * Asset → base64 resolution mirrors the other media node packs: inline data,
 * data URIs, the workflow storage backend, `file://` paths, and remote
 * `http(s)` URLs are all supported.
 */

import { isNonEmptyString, isRecord } from "@nodetool-ai/node-sdk";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { MediaRefValue, ProcessingContext } from "@nodetool-ai/runtime";
import { imageRefFromBytes } from "@nodetool-ai/runtime/provider-transport";
import type { EncodedImageRef } from "@nodetool-ai/runtime/provider-transport";

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

// ---------------------------------------------------------------------------
// Asset → base64
// ---------------------------------------------------------------------------

/**
 * The `ImageRef` fields this pack resolves bytes from. Node props arrive
 * untyped from the graph, so the contract is stated here rather than at each
 * read: bytes inline, base64 (bare or as a data URI), or a URI to fetch.
 */
export interface ReveImageInput {
  uri?: string;
  data?: Uint8Array | string;
  asset_id?: string | null;
}

/**
 * Resolve an ImageRef-like value to raw bytes. Delegates to the canonical
 * {@link loadMediaRefBytes}, which — unlike the copy this replaced — checks
 * `data.length > 0` rather than bare truthiness (a zero-length `Uint8Array` is
 * truthy and shadowed a perfectly good `uri`) and resolves an `asset_id`-only
 * ref. Throws rather than returning null: every caller here needs the bytes.
 */
export async function refToBytes(
  ref: ReveImageInput | null | undefined,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!ref) {
    throw new Error("Image is required");
  }
  // SAFETY: ReveImageInput is the union of the ref shapes loadMediaRefBytes
  // accepts; it is narrower than MediaRefValue, not a different shape.
  const bytes = await loadMediaRefBytes(ref as MediaRefValue, context);
  if (!bytes) throw new Error("Image has no data or URI");
  return bytes;
}

/** Resolve an ImageRef-like value to a base64 string (no data: prefix). */
export async function refToBase64(
  ref: ReveImageInput | null | undefined,
  context?: ProcessingContext
): Promise<string> {
  const bytes = await refToBytes(ref, context);
  return Buffer.from(bytes).toString("base64");
}

// ---------------------------------------------------------------------------
// Response → ImageRef
// ---------------------------------------------------------------------------

/** The `ImageRef` this pack emits: a base64 image, sized when sharp is present. */
export type ReveImageRef = EncodedImageRef;

/** Build an ImageRef from the base64 image Reve returns. */
export async function reveImageToRef(base64: string): Promise<ReveImageRef> {
  return imageRefFromBytes(new Uint8Array(Buffer.from(base64, "base64")));
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
export function postprocessingArray(
  value: string | null | undefined
): string[] {
  const v = String(value ?? "none");
  return v === "none" ? [] : [v];
}

/** The generation capability each endpoint records. */
const REVE_ENDPOINT_CAPABILITY = {
  create: "text_to_image",
  edit: "image_to_image",
  remix: "image_to_image"
} as const;

/**
 * Call a Reve image endpoint through the runtime provider and return the
 * generated image. The provider throws on a non-2xx response and on flagged
 * content. A reply without an image throws here.
 */
export async function reveGenerate(
  context: ProcessingContext,
  endpoint: ReveEndpoint,
  body: ReveRequestBody,
  nodeId?: string
): Promise<ReveImageResponse> {
  const result = await context.callProviderEndpoint({
    provider: "reve",
    capability: REVE_ENDPOINT_CAPABILITY[endpoint],
    model: `reve-${endpoint}`,
    input: { ...cleanBody(body) },
    nodeId,
    signal: context.signal
  });
  const output = result.output;
  const image = isRecord(output) ? output.image : undefined;
  if (!isNonEmptyString(image)) {
    throw new Error("Reve returned no image");
  }
  return { image };
}
