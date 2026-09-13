/**
 * Shared FAL AI API utilities.
 * Uses @fal-ai/client SDK for queue submit/poll and file uploads.
 */

import { createFalClient, type FalClient } from "@fal-ai/client";
import {
  createFalQueueOperations,
  currentGenerationProviderRequestOptions,
  falSubmitAndWait,
  recordGenerationBindingAsync,
  recordGenerationProviderResult,
  recordGenerationReceiptAsync,
  fetchExternalMedia,
  type FalQueueOperations,
  type FalQueueSubmission,
  type GenerationRequest,
  type ProcessingContext
} from "@nodetool-ai/runtime";

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
  onProgress?: (message: string) => void,
  options: {
    readonly webhookUrl?: string;
    readonly signal?: AbortSignal;
    readonly onAccepted?: (
      submission: FalQueueSubmission
    ) => void | Promise<void>;
    readonly onBound?: (binding: {
      readonly providerRequestId: string;
      readonly endpoint: string;
    }) => void | Promise<void>;
  } = {}
): Promise<{ data: Record<string, unknown>; requestId: string | null }> {
  const client = getClient(apiKey);
  // `subscribe()` performs submit, polling, and result retrieval as one opaque
  // operation. Prefer the explicit queue adapter so the paid POST is issued
  // exactly once and the request id is available before waiting. Older test
  // doubles and hosts may only expose subscribe(), so retain that fallback.
  if ("queue" in client && client.queue) {
    const operations: FalQueueOperations = createFalQueueOperations({ apiKey });
    const providerRequestOptions = currentGenerationProviderRequestOptions();
    const request: {
      endpoint: string;
      input: Record<string, unknown>;
      signal?: AbortSignal;
      webhookUrl?: string;
    } = {
      endpoint,
      input: args
    };
    const webhookUrl = options.webhookUrl ?? providerRequestOptions?.webhookUrl;
    if (webhookUrl) request.webhookUrl = webhookUrl;
    if (options.signal) request.signal = options.signal;
    const result = await falSubmitAndWait(operations, request, {
      signal: options.signal,
      onAccepted: async (submission) => {
        await recordGenerationReceiptAsync(
          { provider_request_id: submission.providerRequestId },
          submission
        );
        await options.onAccepted?.(submission);
      },
      onBound: async (binding) => {
        await recordGenerationBindingAsync(binding);
        await options.onBound?.(binding);
      },
      onUpdate: (observation) => {
        const rawStatus = observation.rawStatus;
        if (
          typeof rawStatus === "object" &&
          rawStatus !== null &&
          "logs" in rawStatus &&
          Array.isArray(rawStatus.logs)
        ) {
          for (const entry of rawStatus.logs) {
            if (
              typeof entry === "object" &&
              entry !== null &&
              "message" in entry &&
              typeof entry.message === "string"
            ) {
              onProgress?.(entry.message);
            }
          }
        }
      }
    });
    recordGenerationProviderResult(result.data);
    return { data: result.data, requestId: result.requestId };
  }
  const subscribeOptions: Parameters<FalClient["subscribe"]>[1] = onProgress
    ? {
        input: args,
        logs: true,
        onQueueUpdate: (update: {
          status: string;
          logs?: Array<{ message: string }>;
        }) => {
          if (update.status !== "IN_PROGRESS") return;
          for (const entry of update.logs ?? []) onProgress(entry.message);
        }
      }
    : { input: args, logs: true };
  if (options.signal) {
    Object.assign(subscribeOptions, { abortSignal: options.signal });
  }
  const result = await client.subscribe(endpoint, subscribeOptions);
  const data = (result.data ?? result) as Record<string, unknown>;
  recordGenerationProviderResult(data);
  const requestId =
    (result as { requestId?: string } | undefined)?.requestId ?? null;
  return { data, requestId };
}

/**
 * Submit a FAL request through the processing context's generation seam.
 *
 * FAL nodes are provider-specific nodes, so they cannot use one of the
 * capability helpers on ProcessingContext. Keeping the call here gives the
 * generated, raw, and schema-driven nodes the same acceptance and binding
 * ordering as the higher-level provider while preserving their endpoint
 * shaped output. When an enclosing durable seam already supplied provider
 * request options, the request is already inside that seam and must not open
 * a second ledger row.
 */
export async function falSubmitWithGeneration(
  apiKey: string,
  endpoint: string,
  args: Record<string, unknown>,
  context: ProcessingContext | undefined,
  nodeType: string,
  capability: GenerationRequest["capability"],
  onProgress?: (message: string) => void
): Promise<{ data: Record<string, unknown>; requestId: string | null }> {
  if (!context || currentGenerationProviderRequestOptions()) {
    return falSubmitWithMeta(apiKey, endpoint, args, onProgress);
  }

  const generation = await context.runGenerationWith<Record<string, unknown>>(
    {
      provider: "fal_ai",
      capability,
      model: endpoint,
      nodeId: nodeType,
      params: args,
      origin: { surface: "workflow", node_id: nodeType }
    },
    async (_provider, signal) =>
      (await falSubmitWithMeta(apiKey, endpoint, args, onProgress, { signal }))
        .data
  );

  return {
    data: generation.output,
    requestId: generation.receipt?.provider_request_id ?? null
  };
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
// Upload to FAL CDN via SDK
// ---------------------------------------------------------------------------

export async function falUpload(
  apiKey: string,
  data: Uint8Array,
  contentType: string
): Promise<string> {
  const client = getClient(apiKey);
  const blob = new Blob([data.slice().buffer], {
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
  resolveAssetBytes?: (uri: string) => Promise<{ bytes: Uint8Array | null }>;
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
