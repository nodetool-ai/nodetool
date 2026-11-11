/**
 * Shared FAL node utilities. Requests and uploads go through the runtime
 * `fal_ai` provider by way of the processing context, so node code never
 * holds the API key.
 */

import {
  fetchExternalMedia,
  type GenerationRequest,
  type ProcessingContext
} from "@nodetool-ai/runtime";

/** The runtime provider every FAL node calls. */
export const FAL_PROVIDER = "fal_ai";

/**
 * Run a FAL endpoint through the provider, inside the generation seam, and
 * return the endpoint's JSON with its queue request id. `nodeType` becomes
 * the generation's node id.
 */
export async function callFalEndpoint(
  context: ProcessingContext | undefined,
  request: {
    readonly endpoint: string;
    readonly args: Record<string, unknown>;
    readonly nodeType: string;
    readonly capability: GenerationRequest["capability"];
  }
): Promise<{ data: Record<string, unknown>; requestId: string | null }> {
  if (!context) {
    throw new Error(`${request.nodeType} needs a processing context to call FAL`);
  }
  const { output, requestId } = await context.callProviderEndpoint({
    provider: FAL_PROVIDER,
    capability: request.capability,
    model: request.endpoint,
    input: request.args,
    nodeId: request.nodeType
  });
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    throw new Error(`FAL ${request.endpoint} returned no JSON object`);
  }
  // SAFETY: checked above to be a non-array object; it is the endpoint's JSON.
  return { data: output as Record<string, unknown>, requestId };
}

/** Map manifest output metadata to the closest protocol capability. */
export function falCapabilityForOutputType(
  outputType: string
): GenerationRequest["capability"] {
  switch (outputType.toLowerCase()) {
    case "video":
      return "text_to_video";
    case "audio":
      return "text_to_speech";
    case "model_3d":
      return "text_to_3d";
    case "image":
    default:
      return "text_to_image";
  }
}

// ---------------------------------------------------------------------------
// Resolve asset ref to FAL-accessible URL
// ---------------------------------------------------------------------------

/** What resolving a ref to bytes needs from the processing context. */
interface AssetBytesContext {
  storage?: {
    retrieve(uri: string): Promise<Uint8Array | null | undefined>;
  } | null;
  resolveAssetBytes?: (uri: string) => Promise<{ bytes: Uint8Array | null }>;
}

/** A context that can also upload bytes through the FAL provider. */
export interface FalUploadContext extends AssetBytesContext {
  uploadProviderMedia(args: {
    provider: string;
    bytes: Uint8Array;
    mimeType: string;
  }): Promise<string>;
}

/** Upload bytes to FAL storage through the provider and return the URL. */
export async function uploadToFal(
  context: FalUploadContext | undefined,
  bytes: Uint8Array,
  mimeType: string
): Promise<string> {
  if (!context) {
    throw new Error("Uploading media to FAL needs a processing context");
  }
  return context.uploadProviderMedia({ provider: FAL_PROVIDER, bytes, mimeType });
}

export async function assetToFalUrl(
  ref: Record<string, unknown>,
  context: FalUploadContext | undefined
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
    return uploadToFal(context, bytes, contentType);
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
        return uploadToFal(context, bytes, inferContentType(ref.type as string));
      }
    }

    const bytes = await context?.storage?.retrieve(uri);
    if (bytes) {
      return uploadToFal(context, bytes, inferContentType(ref.type as string));
    }

    try {
      // The uri is workflow data. Remote URLs go through the media-ref egress
      // policy (a refusal throws into the catch below). Only a plain storage
      // key path is resolved against the local server; any other relative or
      // non-http uri is not fetched at all.
      let res: Response;
      if (uri.startsWith("https://") || uri.startsWith("http://")) {
        res = await fetchExternalMedia(uri);
      } else if (/^\/api\/storage\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(uri)) {
        res = await fetch(`http://localhost:${process.env.PORT ?? 7777}${uri}`);
      } else {
        return null;
      }
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const contentType =
          res.headers.get("content-type") ??
          inferContentType(ref.type as string);
        return uploadToFal(context, bytes, contentType);
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
  context?: AssetBytesContext
): Promise<string | null> {
  const data = ref.data as string | undefined;
  const mime = inferMimeFromRef(ref) ?? "image/png";
  if (data) return `data:${mime};base64,${data}`;
  const uri = ref.uri as string | undefined;
  if (uri?.startsWith("https://")) {
    // The ref's uri is workflow data — the media-ref egress policy decides.
    const res = await fetchExternalMedia(uri);
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

export function falImageToRef(img: FalImageResult) {
  return {
    type: "image",
    uri: img.url,
    width: img.width,
    height: img.height,
    mimeType: img.content_type
  };
}

/**
 * Delete `null`/`undefined`/empty-string keys from the top level of an object.
 *
 * Intentionally NON-recursive, matching `replicate-base.ts`: a FAL arg bag is a
 * flat set of parameters, and its only nested objects are pass-through
 * `dict[...]` inputs the user supplied. Recursing mutated those in place and
 * silently stripped sub-keys they meant to send — a deliberate
 * `"negative_prompt": ""` inside one is a value, not an omission. `0` and
 * `false` are kept.
 */
export function removeNulls(obj: Record<string, unknown>): void {
  for (const k of Object.keys(obj)) {
    if (obj[k] == null || obj[k] === "") {
      delete obj[k];
    }
  }
}
