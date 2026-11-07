/**
 * Shared Replicate node helpers: input building, uploads and output mapping.
 * The transport is the runtime `ReplicateProvider`, reached through the
 * processing context, so node code never holds the API key.
 */

import { fetchExternalMedia } from "@nodetool-ai/runtime";
import type { GenerationRequest } from "@nodetool-ai/runtime";
import { isCallable, isNonEmptyString, isString } from "@nodetool-ai/node-sdk";
import type { NodeValue } from "@nodetool-ai/node-sdk";

/** The runtime provider id the nodes call. */
export const REPLICATE_PROVIDER_ID = "replicate";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * The `input` bag a Replicate model receives. Every value comes off a node
 * property or a prompt-asset override, so `NodeValue` is the exact contract.
 */
export type ReplicateInput = Record<string, NodeValue>;

/** An asset ref held by a node property: `uri`, `data`, `asset_id`, `type`. */
export type ReplicateAssetRef = Record<string, NodeValue>;

/**
 * The generation capability a node's call is recorded under, chosen from the
 * manifest output type.
 */
export function replicateCapabilityForOutputType(
  outputType: string
): GenerationRequest["capability"] {
  switch (outputType.toLowerCase()) {
    case "video":
      return "text_to_video";
    case "audio":
      return "text_to_speech";
    case "str":
      return "generate_message";
    case "image":
    default:
      return "text_to_image";
  }
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
export function removeNulls(obj: ReplicateInput): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null || obj[k] === "") {
      delete obj[k];
    }
  }
}

/** Check if an asset ref has meaningful content (uri, data, or asset_id). */
export function isRefSet(ref: NodeValue): ref is ReplicateAssetRef {
  if (!isRefLike(ref)) return false;
  // A library-picked or freshly-generated ref carries only `asset_id` (with an
  // empty `uri`); it still resolves to bytes via the upload context, so treat a
  // non-empty `asset_id` as a source. `null`/`""` stay unset.
  return Boolean(ref.data || ref.uri || ref.asset_id);
}

/** Anything `typeof` calls "object" except `null` — arrays carry no ref keys. */
function isRefLike(ref: NodeValue): ref is ReplicateAssetRef {
  return ref !== null && typeof ref === "object";
}

interface UploadContext {
  storage?: {
    retrieve(uri: string): Promise<Uint8Array | null | undefined>;
  } | null;
  resolveAssetBytes?: (
    uri: string
  ) => Promise<{ bytes: Uint8Array | null }>;
  uploadProviderMedia?: (args: {
    provider: string;
    bytes: Uint8Array;
    mimeType: string;
    filename?: string;
  }) => Promise<string>;
}

type Upload = (bytes: Uint8Array, mimeType: string, filename: string) => Promise<string>;

/**
 * Convert an asset ref to a Replicate-accessible URL.
 *
 * Data URIs and Replicate-hosted URLs are passed through directly.
 * External URLs and local paths are fetched and uploaded to Replicate's
 * files API through the context's provider, so the model can access them.
 * Without an upload context they pass through unchanged.
 */
export async function assetToUrl(
  ref: ReplicateAssetRef,
  context?: UploadContext
): Promise<string | null> {
  const uploadProviderMedia = context?.uploadProviderMedia;
  const upload: Upload | undefined = uploadProviderMedia
    ? (bytes, mimeType, filename) =>
        uploadProviderMedia.call(context, {
          provider: REPLICATE_PROVIDER_ID,
          bytes,
          mimeType,
          filename
        })
    : undefined;
  let uri = isString(ref.uri) ? ref.uri : undefined;
  // A library-picked or generated ref may carry only `asset_id` (empty `uri`).
  // Encode it as an `asset://<id>` URI so the trusted context-resolver branch
  // below uploads it instead of dropping the ref.
  if (!uri && isNonEmptyString(ref.asset_id)) {
    uri = `asset://${ref.asset_id}`;
  }
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
    // External URLs: fetch and upload to Replicate
    if (upload && (uri.startsWith("http://") || uri.startsWith("https://"))) {
      try {
        return await fetchAndUpload(upload, uri);
      } catch {
        return uri;
      }
    }
    // Asset/package references: resolve to bytes via the context and upload.
    // Storage adapters only understand their own URI schemes, so these refs
    // must go through resolveAssetBytes (asset://<id>, package://<pkg>/<path>).
    if (
      upload &&
      context?.resolveAssetBytes &&
      (uri.startsWith("asset://") || uri.startsWith("package://"))
    ) {
      const { bytes } = await context.resolveAssetBytes(uri);
      if (bytes) {
        return upload(bytes, inferMime(ref), filenameForMime(inferMime(ref)));
      }
    }
    // Local/relative paths: resolve via local server and upload
    if (upload && uri.startsWith("/")) {
      const bytes = await context?.storage?.retrieve(uri);
      if (bytes) {
        return upload(bytes, inferMime(ref), filenameForMime(inferMime(ref)));
      }
      const port = process.env.PORT ?? "7777";
      const localUrl = `http://127.0.0.1:${port}${uri}`;
      try {
        return await fetchAndUpload(upload, localUrl);
      } catch {
        // A relative path is useless to Replicate — omit it rather than
        // handing the model a URL it cannot fetch.
        return null;
      }
    }
    return uri;
  }
  const data = isNonEmptyString(ref.data) ? ref.data : undefined;
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
async function fetchAndUpload(upload: Upload, sourceUrl: string): Promise<string> {
  // sourceUrl comes off a media ref in the graph, so the media-ref egress
  // policy decides whether this host fetches it.
  const res = await fetchExternalMedia(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${res.status}`);

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType =
    res.headers.get("content-type") || "application/octet-stream";
  const ext = contentType.split("/")[1]?.split(";")[0] || "bin";

  return upload(bytes, contentType, `upload.${ext}`);
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** A file object: a plain `url` string, or the SDK's `FileOutput` `url()`. */
export interface ReplicateFileOutput {
  url: string | (() => URL | string);
}

/**
 * What a Replicate model resolves to. The provider returns the prediction's
 * JSON with file URLs as strings. A text model resolves to a bare string and
 * a number of models resolve to a number or boolean, so the union covers every
 * JSON value a model can produce, plus objects carrying `url`.
 */
export type ReplicateOutput =
  | string
  | number
  | boolean
  | null
  | ReplicateFileOutput
  | ReplicateOutput[]
  | { [key: string]: ReplicateOutput };

/** An object-valued output: a keyed bag of further outputs, or an array. */
type ReplicateOutputRecord = { [key: string]: ReplicateOutput };

function isOutputRecord(
  value: ReplicateOutput
): value is ReplicateOutputRecord {
  return value !== null && typeof value === "object";
}

function isOutputArray(value: ReplicateOutput): value is ReplicateOutput[] {
  return Array.isArray(value);
}

/** The media ref a converter builds; `uri` is absent when no URL was found. */
export type ReplicateMediaRef = {
  type: "image" | "video" | "audio";
  uri?: string;
};

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
function extractUrl(output: ReplicateOutput): string | null {
  // A bare string output is itself the URL (the model's contract).
  if (isString(output)) return output;
  return extractUrlFromValue(output);
}

function extractUrlFromValue(value: ReplicateOutput): string | null {
  if (!isOutputRecord(value)) return null;

  // FileOutput: a `.url()` method or a `.url` string property.
  if ("url" in value) {
    const u = value.url;
    if (isCallable(u)) {
      // The Replicate SDK's FileOutput exposes `url()`, which returns a URL.
      const resolved = u.call(value);
      if (resolved) return String(resolved);
    } else if (u) {
      return String(u);
    }
  }

  if (isOutputArray(value)) {
    for (const item of value) {
      const url = urlFromAny(item);
      if (url) return url;
    }
    return null;
  }

  for (const v of Object.values(value)) {
    const url = urlFromAny(v);
    if (url) return url;
  }
  return null;
}

/** A nested string only counts if it looks like a URL; otherwise recurse. */
function urlFromAny(value: ReplicateOutput): string | null {
  if (isString(value)) return URL_LIKE.test(value) ? value : null;
  return extractUrlFromValue(value);
}

export function outputToImageRef(output: ReplicateOutput): ReplicateMediaRef {
  const url = extractUrl(output);
  if (!url) return { type: "image" };
  return { type: "image", uri: url };
}

export function outputToVideoRef(output: ReplicateOutput): ReplicateMediaRef {
  const url = extractUrl(output);
  if (!url) return { type: "video" };
  return { type: "video", uri: url };
}

export function outputToAudioRef(output: ReplicateOutput): ReplicateMediaRef {
  const url = extractUrl(output);
  if (!url) return { type: "audio" };
  return { type: "audio", uri: url };
}

export function outputToString(output: ReplicateOutput): string {
  if (isString(output)) return output;
  if (Array.isArray(output)) return output.join("");
  if (output == null) return "";
  return JSON.stringify(output);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function inferMime(ref: ReplicateAssetRef): string {
  const t = isString(ref.type) ? ref.type : undefined;
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
