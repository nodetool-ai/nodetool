/**
 * Shared Replicate API utilities.
 * Uses the official Replicate TypeScript SDK.
 */

import Replicate from "replicate";
import { fetchExternalMedia, withReplicateRetry } from "@nodetool-ai/runtime";
import { isCallable, isNonEmptyString, isString } from "@nodetool-ai/node-sdk";
import type { NodeValue } from "@nodetool-ai/node-sdk";

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
}

/**
 * Convert an asset ref to a Replicate-accessible URL.
 *
 * Data URIs and Replicate-hosted URLs are passed through directly.
 * External URLs and local paths are fetched and uploaded to Replicate's
 * files API via the SDK so the model can access them.
 */
export async function assetToUrl(
  ref: ReplicateAssetRef,
  apiKey?: string,
  context?: UploadContext
): Promise<string | null> {
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
  const data = isNonEmptyString(ref.data) ? ref.data : undefined;
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
  const blob = new Blob([bytes.slice().buffer], {
    type: contentType
  });
  const file = await client.files.create(blob, { filename });
  const fileUrl = file.urls;
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
  // sourceUrl comes off a media ref in the graph, so the media-ref egress
  // policy decides whether this host fetches it.
  const res = await fetchExternalMedia(sourceUrl);
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

/** The SDK's `FileOutput`: a `url()` method, or a plain `url` string. */
export interface ReplicateFileOutput {
  url: string | (() => URL | string);
}

/**
 * What a Replicate model resolves to. The SDK types `run()` as `object`, but a
 * text model resolves to a bare string and a number of models resolve to a
 * number or boolean, so the union covers every JSON value a model can produce
 * — including the SDK's own `FileOutput` (an object carrying `url`).
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

export interface ReplicateResult {
  output: ReplicateOutput;
}

/**
 * Run a Replicate model and return the output.
 *
 * Uses `replicate.run()` which handles prediction creation, polling,
 * and waiting for completion internally. The low-credit throttle (429) is
 * waited out instead of thrown — failing the node discards every generation
 * upstream in the run, which was already paid for.
 */
export async function replicateSubmit(
  apiKey: string,
  modelId: string,
  input: ReplicateInput
): Promise<ReplicateResult> {
  const client = getClient(apiKey);
  // SAFETY: `modelId` is a manifest `endpointId`, and every entry in
  // `replicate-manifest.json` is a single `owner/name` pair.
  const model = modelId as `${string}/${string}`;
  const raw = await withReplicateRetry(modelId, () =>
    client.run(model, { input })
  );
  // SAFETY: `run()` resolves to the model's decoded JSON response, with the
  // SDK's own `FileOutput` objects substituted for file URLs — every branch
  // `ReplicateOutput` names.
  return { output: raw as ReplicateOutput };
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
