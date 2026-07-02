import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { getSecret } from "@nodetool-ai/models";
import { getSetting } from "./settings-registry.js";
import { JobConcurrencyQueue } from "./job-queue.js";
import { pack, unpack } from "msgpackr";
import {
  createLogger,
  getDefaultAssetsPath,
  buildAssetUrl,
  getByteLimitEnv
} from "@nodetool-ai/config";
import { getAssetAdapter, getTempAdapter } from "./lib/storage.js";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { resourceEvents, type ResourceChangePayload } from "./resource-events.js";
import { createSystemStatsSampler } from "./system-stats.js";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";
import { resolveContentUrls, resolveContentForProvider } from "./resolve-media-urls.js";
import {
  Graph,
  WorkflowRunner,
  withExplicitNodeFlags,
  type NodeExecutor,
  type NodeTypeResolver,
  type NodeValidator
} from "@nodetool-ai/kernel";
import {
  Asset,
  ImageDocument,
  Job,
  Message,
  ModelChangeEvent,
  ModelObserver,
  Prediction,
  Thread,
  TimelineSequence,
  Workflow,
  type DBModel
} from "@nodetool-ai/models";
import type {
  ProviderTool,
  Message as ProviderMessage,
  MessageContent,
  BaseProvider,
  ProcessingContext,
  ProviderSession,
  ToolCall as ProviderToolCall,
  ImageModel as ProviderImageModel,
  VideoModel as ProviderVideoModel,
  TextToImageParams,
  TextToVideoParams,
  ImageToImageParams,
  InpaintingParams,
  ImageToVideoParams
} from "@nodetool-ai/runtime";
import {
  ProcessingContext as RuntimeProcessingContext,
  encodeRawRgbaToPng,
  getCostReconciler,
  isProviderSessionUpdate,
  isProviderMessageEvent
} from "@nodetool-ai/runtime";
import { isRawRgbaImage } from "@nodetool-ai/protocol";
import type {
  Chunk,
  GraphData,
  HydratedGraphData,
  NodeDescriptor,
  ProcessingMessage,
  ProviderCost
} from "@nodetool-ai/protocol";
import type {
  UnifiedCommandType,
  WebSocketCommandEnvelope,
  WebSocketMode,
  RpcErrorPayload
} from "@nodetool-ai/protocol";
import { Tool } from "@nodetool-ai/agents";
import { RunSubtaskTool, RunSearchTool } from "@nodetool-ai/agents";
import {
  getBuiltinTools,
  getAllMcpTools,
  registerBuiltinTools,
  ListCollectionsTool,
  QueryCollectionTool,
  gateTools,
  extractInjectableImages,
  type PermissionMode,
  type ApprovalDecision,
  type ApprovalRequest
} from "@nodetool-ai/agents";
import {
  createDefaultLongTermMemory,
  formatMemoryForPrompt,
  type LongTermMemory
} from "@nodetool-ai/agents";
import { RunNodeTool } from "./agent/run-node-tool.js";
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PythonBridge } from "@nodetool-ai/runtime";
import { appRouter } from "./trpc/router.js";
import { createCallerFactory } from "./trpc/index.js";
import type { HttpApiOptions } from "./http-api.js";

const log = createLogger("nodetool.websocket.runner");
const DATA_URI_PATTERN = /data:([^;,]+)?;base64,[A-Za-z0-9+/=\r\n]+/gi;
const MAX_ERROR_TEXT_LENGTH = 4000;

/**
 * Largest binary (MsgPack) frame accepted from a client before deserialization.
 * MsgPack can amplify a small payload into a huge in-memory structure, so the
 * raw byte length is bounded up front. Override with the
 * `NODETOOL_WS_MAX_MESSAGE_BYTES` environment variable (value in bytes);
 * default 256 MiB.
 */
const DEFAULT_MAX_WS_MESSAGE_BYTES = 256 * 1024 * 1024;
function getMaxWsMessageBytes(): number {
  return getByteLimitEnv(
    "NODETOOL_WS_MAX_MESSAGE_BYTES",
    DEFAULT_MAX_WS_MESSAGE_BYTES
  );
}

/**
 * How many recent messages to scan when probing for a resumable session before
 * deciding whether the full thread needs loading. Large enough to clear the
 * occasional errored turn between sessioned assistant replies, tiny next to a
 * full thread load.
 */
const SESSION_PROBE_WINDOW = 50;

/**
 * Find the continuation token to resume this thread with: the `provider_session`
 * of the most recent assistant message, but only if it was produced by the same
 * `provider` and `model` as the incoming request (a session is bound to both).
 * Returns null when there is nothing to resume, so the provider starts fresh.
 */
function lastMatchingProviderSession(
  dbMessages: Message[],
  providerId: string,
  model: string
): ProviderSession | null {
  for (let i = dbMessages.length - 1; i >= 0; i--) {
    const m = dbMessages[i];
    if (m.role !== "assistant") continue;
    const session = m.provider_session;
    if (!session) continue;
    return session.providerId === providerId && session.model === model
      ? session
      : null;
  }
  return null;
}

/**
 * Return `true` when the given http(s) URL appears to point at a public
 * destination (not a loopback, link-local, or RFC1918 private address).
 *
 * Used before `fetch`ing URLs supplied by chat clients to resolve source
 * images — without this gate, an authenticated user could coerce the server
 * into reading internal services via `http://169.254.169.254/...`,
 * `http://localhost:6379/...`, etc. The check is conservative: unparseable
 * URLs and literal IP addresses in private ranges are refused. DNS-based
 * bypass is still possible, so this is a defense-in-depth measure and not a
 * full SSRF mitigation; intended for complementing network-level egress
 * filtering.
 */
function isSafeExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  // Normalise IPv6 hostnames: WHATWG URL may return them with or without
  // surrounding brackets depending on the runtime.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (
    host === "localhost" ||
    host === "ip6-localhost" ||
    host === "ip6-loopback" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  // IPv4 literal check
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map((n) => parseInt(n, 10));
    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16,
    // 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10 (CGNAT)
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  // IPv6 literal — refuse loopback / ULA / link-local / unspecified ranges.
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return false;
    if (host.startsWith("fc") || host.startsWith("fd")) return false; // ULA fc00::/7
    if (host.startsWith("fe80:")) return false; // link-local
  }
  return true;
}

function sanitizeLargeText(
  text: string,
  maxLength = MAX_ERROR_TEXT_LENGTH
): string {
  const sanitized = text.replace(DATA_URI_PATTERN, (match, mimeType) => {
    const mime =
      typeof mimeType === "string" && mimeType !== "" ? mimeType : "data";
    return `[${mime} base64 omitted, ${match.length} chars]`;
  });

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  const truncatedChars = sanitized.length - maxLength;
  return `${sanitized.slice(0, maxLength)}... (truncated ${truncatedChars} chars)`;
}

function sanitizeErrorValue(
  value: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (typeof value === "string") {
    return sanitizeLargeText(value);
  }

  if (value instanceof Error) {
    return sanitizeLargeText(value.message);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorValue(item, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      result[key] = sanitizeErrorValue(nested, seen);
    }
    return result;
  }

  return value;
}

function formatSanitizedError(error: unknown): string {
  if (typeof error === "string") {
    return sanitizeLargeText(error);
  }

  if (error instanceof Error) {
    return sanitizeLargeText(error.message);
  }

  const sanitized = sanitizeErrorValue(error);
  if (typeof sanitized === "string") {
    return sanitized;
  }

  try {
    return sanitizeLargeText(JSON.stringify(sanitized));
  } catch {
    return sanitizeLargeText(String(error));
  }
}

function getAssetStoragePath(): string {
  return getDefaultAssetsPath();
}

/** Extract the object key from a cloud storage URI, or return null for file URIs. */
function extractCloudKey(uri: string): string | null {
  for (const scheme of ["supabase://", "s3://"]) {
    if (uri.startsWith(scheme)) {
      const rest = uri.slice(scheme.length);
      const slash = rest.indexOf("/");
      return slash >= 0 ? rest.slice(slash + 1) : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auto-save assets — persists generated media as Asset records
// ---------------------------------------------------------------------------

const ASSET_MEDIA_TYPES = new Set(["image", "audio", "video"]);

/** Byte cap for inline-preview text stored in a text generation's asset metadata. */
const TEXT_GENERATION_PREVIEW_CAP = 200_000;

/** Char cap for the prompt stored in a media asset's metadata. */
const PROMPT_METADATA_CAP = 8_000;

/**
 * Lift the prompt out of a generation's scalar input properties into asset
 * metadata. Returns `{ prompt }` when a non-empty `prompt` string is present
 * (capped), else an empty object. Other generation params are intentionally
 * left out — the prompt is the field the asset viewer surfaces.
 */
function promptMetadata(
  properties: Record<string, unknown> | undefined
): Record<string, unknown> {
  const prompt = properties?.prompt;
  if (typeof prompt !== "string") return {};
  const trimmed = prompt.trim();
  if (trimmed.length === 0) return {};
  return {
    prompt:
      trimmed.length > PROMPT_METADATA_CAP
        ? trimmed.slice(0, PROMPT_METADATA_CAP)
        : trimmed
  };
}

/**
 * Resolve a node's primary output name when it is a text/str type, so its value
 * can be persisted as a text generation. Mirrors the frontend's
 * `getPrimaryOutput` (honor `primary_output`, else first output). Returns
 * undefined for non-text primaries (media, structured data, …).
 */
export function primaryTextOutputName(
  meta:
    | {
        outputs?: Array<{ name: string; type?: { type?: string } }>;
        primary_output?: string;
      }
    | undefined
): string | undefined {
  const outputs = meta?.outputs ?? [];
  if (outputs.length === 0) return undefined;
  const named = meta?.primary_output;
  const primary =
    (named && outputs.find((o) => o.name === named)) || outputs[0];
  const t = primary?.type?.type;
  return t === "str" || t === "text" ? primary.name : undefined;
}

const ASSET_TYPE_MIME: Record<string, string> = {
  image: "image/png",
  audio: "audio/wav",
  video: "video/mp4"
};

const ASSET_TYPE_EXT: Record<string, string> = {
  image: "png",
  audio: "wav",
  video: "mp4"
};

function isAssetLikeValue(
  value: unknown
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    ASSET_MEDIA_TYPES.has(v.type as string) &&
    ("data" in v || "uri" in v)
  );
}

/**
 * A chunk whose content is the native in-process `Float32Array` sample
 * payload (see protocol `Chunk.content`). Must be encoded before crossing
 * the websocket: msgpack/JSON would mangle the typed array.
 */
function isNativeAudioChunk(
  value: unknown
): value is Record<string, unknown> & { content: Float32Array } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "chunk" && v.content instanceof Float32Array;
}

/** Encode a native audio chunk's samples to base64 f32le for the wire. */
function encodeAudioChunkForWire(
  chunk: Record<string, unknown> & { content: Float32Array }
): Record<string, unknown> {
  const samples = chunk.content;
  const bytes = Buffer.from(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength
  );
  return {
    ...chunk,
    content: bytes.toString("base64"),
    content_metadata: {
      ...(chunk.content_metadata as Record<string, unknown> | undefined),
      encoding: "f32le"
    }
  };
}

/**
 * Replace native-Float32Array chunk payloads in an outgoing message with
 * their base64 wire form. Chunks appear as the message itself (chat
 * streaming), as `value` (output_update), or as `result`/array elements
 * (node_update); nested generic walks are deliberately avoided — this runs
 * per message on the hot streaming path.
 */
function encodeNativeAudioChunks(
  message: Record<string, unknown>
): Record<string, unknown> {
  if (isNativeAudioChunk(message)) return encodeAudioChunkForWire(message);
  let out = message;
  for (const key of ["value", "result", "chunk"]) {
    const v = out[key];
    if (isNativeAudioChunk(v)) {
      out = { ...out, [key]: encodeAudioChunkForWire(v) };
    } else if (Array.isArray(v) && v.some(isNativeAudioChunk)) {
      out = {
        ...out,
        [key]: v.map((item) =>
          isNativeAudioChunk(item) ? encodeAudioChunkForWire(item) : item
        )
      };
    }
  }
  return out;
}

function decodeAssetBytes(data: unknown): Uint8Array | null {
  if (data === null || data === undefined) return null;
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (Array.isArray(data) && data.every((v) => Number.isInteger(v))) {
    return new Uint8Array(data as number[]);
  }
  if (typeof data === "string") {
    return Uint8Array.from(Buffer.from(data, "base64"));
  }
  return null;
}

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp"
};

/** Parse a `data:` URI into its mime type and decoded bytes. */
function parseImageDataUri(
  uri: string
): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri);
  if (!match) return null;
  const mimeType = match[1] || "image/png";
  const payload = match[3] ?? "";
  const bytes = match[2]
    ? Uint8Array.from(Buffer.from(payload, "base64"))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return { bytes, mimeType };
}

/**
 * Pull image bytes (+mime) out of an embedded image payload — `{ data, mimeType }`
 * or `{ uri }` — so it can be materialized into a temp asset. A non-data
 * remote/storage URI is surfaced as a passthrough handle (view_image fetches it).
 */
function extractEmbeddedImage(source: {
  data?: unknown;
  uri?: unknown;
  mimeType?: unknown;
}): { bytes: Uint8Array; mimeType: string } | { uri: string } | null {
  const declaredMime =
    typeof source.mimeType === "string" ? source.mimeType : undefined;
  const data = typeof source.data === "string" ? source.data : undefined;
  const uri = typeof source.uri === "string" ? source.uri : undefined;

  if (data) {
    if (data.startsWith("data:")) {
      const parsed = parseImageDataUri(data);
      if (parsed) {
        return { bytes: parsed.bytes, mimeType: declaredMime ?? parsed.mimeType };
      }
    } else {
      const bytes = decodeAssetBytes(data);
      if (bytes) return { bytes, mimeType: declaredMime ?? "image/png" };
    }
  }
  if (uri) {
    if (uri.startsWith("data:")) {
      const parsed = parseImageDataUri(uri);
      if (parsed) {
        return { bytes: parsed.bytes, mimeType: declaredMime ?? parsed.mimeType };
      }
    } else {
      return { uri };
    }
  }
  return null;
}

async function readBytesFromUri(uri: string): Promise<Uint8Array | null> {
  if (!uri) return null;
  try {
    if (uri.startsWith("file://")) {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      return new Uint8Array(await readFile(fileURLToPath(uri)));
    }
    if (uri.startsWith("data:")) {
      const commaIdx = uri.indexOf(",");
      if (commaIdx < 0) return null;
      return Uint8Array.from(Buffer.from(uri.slice(commaIdx + 1), "base64"));
    }
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      const resp = await fetch(uri);
      if (!resp.ok) return null;
      return new Uint8Array(await resp.arrayBuffer());
    }
  } catch {
    // Failed to read bytes — non-fatal
  }
  return null;
}

/**
 * Recursively find asset-like values in a result object and persist them as
 * Asset records in the database + on disk.
 *
 * Mutates the result in-place: sets `asset_id` and updates `uri` to
 * `asset://{id}.{ext}`.
 */
async function autoSaveAssets(
  result: Record<string, unknown>,
  opts: {
    userId: string;
    workflowId: string | null;
    jobId: string;
    nodeId: string;
    /**
     * Name of the node's primary output when it is a text/str type. When set and
     * the result carries a non-empty string there, it is persisted as a
     * `text/plain` asset so text content-card nodes (Agent, Summarizer,
     * Classifier) get the same reload-surviving, browsable generation history as
     * media nodes.
     */
    textOutputName?: string;
    /**
     * The relay-stamped arrival `index` of the `generation_complete` event that
     * triggered this save (RFC Decision 8 `(job_id, node_id, index)` key).
     * Stamped onto each created asset's `metadata.generation_index` so a replay
     * can dedupe by the exact slot — independent of how many assets a single
     * event yields (a `list[image]` output, or media + text together, persists
     * several rows for ONE arrival index).
     */
    generationIndex?: number;
    /**
     * Scalar input properties from the `generation_complete` event (the actor's
     * resolved declared/dynamic/edge inputs, filtered to scalars). The `prompt`
     * is persisted into each saved media asset's `metadata.prompt` so the asset
     * viewer can show what produced the image/audio/video.
     */
    properties?: Record<string, unknown>;
  }
): Promise<void> {
  // Generation params lifted into each media asset's metadata. Just the prompt
  // today — the field the asset viewer surfaces as "what produced this".
  const promptMeta = promptMetadata(opts.properties);
  const queue: Record<string, unknown>[] = [];

  // Collect all asset-like values from the result (may be nested)
  function collect(value: unknown): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (isAssetLikeValue(value)) {
      queue.push(value);
      return;
    }
    if (typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) {
        collect(v);
      }
    }
  }
  collect(result);

  // Whether this result carries media at all — used to gate the structured
  // (JSON) generation fallback below so a media node never also persists a
  // redundant JSON copy of its output dict (true even on replay, where the
  // media value already carries an asset_id and is skipped by the save loop).
  const hasMedia = queue.length > 0;

  for (const assetValue of queue) {
    // Skip if already saved
    if (assetValue.asset_id) continue;

    const assetType = String(assetValue.type);

    // Get bytes. Raw in-flight RGBA is encoded to PNG first so the stored
    // asset (and its thumbnail) is a real image.
    const isRaw = isRawRgbaImage(assetValue);
    let bytes: Uint8Array | null;
    if (isRaw) {
      bytes = await encodeRawRgbaToPng(
        assetValue.data as Uint8Array,
        assetValue.width as number,
        assetValue.height as number
      );
    } else {
      bytes = decodeAssetBytes(assetValue.data);
      if (!bytes && typeof assetValue.uri === "string") {
        bytes = await readBytesFromUri(assetValue.uri as string);
      }
    }
    if (!bytes) continue;

    // Determine mime/ext, preferring explicit content_type.
    const explicitMime = isRaw
      ? "image/png"
      : (assetValue.mime_type ?? assetValue.content_type);
    const contentType =
      typeof explicitMime === "string" && explicitMime
        ? explicitMime
        : (ASSET_TYPE_MIME[assetType] ?? "application/octet-stream");

    const ext = isRaw ? "png" : (ASSET_TYPE_EXT[assetType] ?? "bin");

    // Create Asset record
    const asset = new Asset({
      user_id: opts.userId,
      workflow_id: opts.workflowId ?? null,
      node_id: opts.nodeId,
      job_id: opts.jobId,
      name: `${assetType}_${opts.nodeId.slice(0, 8)}`,
      content_type: contentType,
      parent_id: null
    });
    const mediaMeta: Record<string, unknown> = { ...promptMeta };
    if (typeof opts.generationIndex === "number") {
      mediaMeta.generation_index = opts.generationIndex;
    }
    if (Object.keys(mediaMeta).length > 0) {
      asset.metadata = mediaMeta;
    }

    const fileName = `${asset.id}.${ext}`;
    try {
      await storeAssetWithThumbnail(asset.id, fileName, bytes, contentType);
      asset.size = bytes.length;
      await asset.save();

      // Mutate the result value in-place. For raw assets, also drop the raw
      // pixels and fix the mime so later normalization treats it as the saved
      // PNG, not raw RGBA.
      assetValue.asset_id = asset.id;
      assetValue.uri = `asset://${fileName}`;
      if (isRaw) {
        const mutable = assetValue as Record<string, unknown>;
        mutable.data = undefined;
        mutable.mimeType = "image/png";
      }
    } catch (err) {
      log.warn("Auto-save asset failed", {
        nodeId: opts.nodeId,
        error: String(err)
      });
    }
  }

  // Persist the primary text output as a generation (a text/plain asset), so
  // text content-card nodes get the same reload-surviving, browsable generation
  // history as media nodes. The text is stored both as the asset bytes and
  // (capped) inline in metadata so the UI can preview it without a fetch.
  let savedText = false;
  const textKey = opts.textOutputName;
  if (textKey) {
    const textVal = result[textKey];
    if (typeof textVal === "string" && textVal.length > 0) {
      savedText = true;
      const bytes = new TextEncoder().encode(textVal);
      const previewText = new TextDecoder().decode(
        bytes.slice(0, TEXT_GENERATION_PREVIEW_CAP)
      );
      const asset = new Asset({
        user_id: opts.userId,
        workflow_id: opts.workflowId ?? null,
        node_id: opts.nodeId,
        job_id: opts.jobId,
        name: `text_${opts.nodeId.slice(0, 8)}`,
        content_type: "text/plain",
        parent_id: null
      });
      asset.metadata =
        typeof opts.generationIndex === "number"
          ? { text: previewText, generation_index: opts.generationIndex }
          : { text: previewText };
      const fileName = `${asset.id}.txt`;
      try {
        await storeAssetWithThumbnail(asset.id, fileName, bytes, "text/plain");
        asset.size = bytes.length;
        await asset.save();
      } catch (err) {
        log.warn("Auto-save text generation failed", {
          nodeId: opts.nodeId,
          error: String(err)
        });
      }
    }
  }

  // Structured (JSON) generation fallback. Nodes whose primary output is neither
  // media nor a plain string — the generator family (List/Data/Chart/SVG/
  // StructuredOutput), which emit lists, dicts, dataframes, chart configs, etc.
  // — persist their whole output dict as an `application/json` asset so they get
  // the same reload-surviving, browsable generation history as media/text nodes.
  // The full value lives in the asset bytes; a copy is stored inline in
  // `metadata.json` (when small enough) for fetch-free reload. Gated on
  // !hasMedia && !savedText so media/text nodes never double-persist.
  if (!hasMedia && !savedText) {
    const structured: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      if (value !== null && value !== undefined) structured[key] = value;
    }
    if (Object.keys(structured).length > 0) {
      let serialized: string | null = null;
      try {
        serialized = JSON.stringify(structured);
      } catch {
        serialized = null;
      }
      if (serialized) {
        const bytes = new TextEncoder().encode(serialized);
        const asset = new Asset({
          user_id: opts.userId,
          workflow_id: opts.workflowId ?? null,
          node_id: opts.nodeId,
          job_id: opts.jobId,
          name: `json_${opts.nodeId.slice(0, 8)}`,
          content_type: "application/json",
          parent_id: null
        });
        // Inline the full value only when it fits — a truncated JSON string
        // would not parse on reload. Oversized values reload from the bytes.
        const inline =
          bytes.length <= TEXT_GENERATION_PREVIEW_CAP ? structured : undefined;
        asset.metadata = {
          ...(inline !== undefined ? { json: inline } : {}),
          ...(typeof opts.generationIndex === "number"
            ? { generation_index: opts.generationIndex }
            : {})
        };
        const fileName = `${asset.id}.json`;
        try {
          await storeAssetWithThumbnail(
            asset.id,
            fileName,
            bytes,
            "application/json"
          );
          asset.size = bytes.length;
          await asset.save();
        } catch (err) {
          log.warn("Auto-save JSON generation failed", {
            nodeId: opts.nodeId,
            error: String(err)
          });
        }
      }
    }
  }
}

function createRuntimeContext(opts: {
  jobId: string;
  workflowId?: string | null;
  threadId?: string | null;
  userId: string;
  workspaceDir: string | null;
  assetOutputMode?:
    | "native"
    | "data_uri"
    | "temp_url"
    | "storage_url"
    | "workspace"
    | "raw";
}): RuntimeProcessingContext {
  const storagePath = getAssetStoragePath();
  const tempAdapter = getTempAdapter();
  // The agent's "workspace" — where file_read / file_write / file_list land.
  // Local: a FileStorageAdapter rooted at workspaceDir. Cloud: callers can
  // wire a different StorageAdapter when constructing the runner; for now
  // we fall back to a workspaceDir-backed FileStorageAdapter when one is
  // present, leaving cloud wiring to the deployment-specific runner.
  const workspaceAdapter = opts.workspaceDir
    ? new FileStorageAdapter(opts.workspaceDir)
    : null;
  const ctx = new RuntimeProcessingContext({
    ...opts,
    secretResolver: getSecret,
    storage: tempAdapter,
    workspaceStorage: workspaceAdapter,
    tempUrlResolver: (uri: string) => {
      // Cloud backends: key becomes /api/storage/<key> — the HTTP handler
      // will redirect to a signed URL (once signed URL support is wired in).
      const cloudKey = extractCloudKey(uri);
      if (cloudKey !== null) {
        return buildAssetUrl(cloudKey);
      }
      // File: convert file:///path/to/storage/uuid.png → /api/storage/uuid.png
      const prefix = pathToFileURL(storagePath).toString();
      if (uri.startsWith(prefix)) {
        return buildAssetUrl(uri.slice(prefix.length + 1));
      }
      return uri;
    }
  });

  const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "image/bmp": "bmp", "image/svg+xml": "svg",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
    "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm",
    "application/pdf": "pdf", "text/plain": "txt", "text/html": "html",
    "model/gltf-binary": "glb"
  };

  ctx.setModelInterfaces({
    createAsset: async (args) => {
      const asset = new Asset({
        user_id: args.userId,
        workflow_id: args.workflowId ?? null,
        node_id: args.nodeId ?? null,
        job_id: args.jobId ?? null,
        name: args.name,
        content_type: args.contentType,
        parent_id: args.parentId ?? null
      });
      if (args.content) {
        const ext = MIME_TO_EXT[args.contentType] ?? "bin";
        const key = `${asset.id}.${ext}`;
        await storeAssetWithThumbnail(asset.id, key, args.content, args.contentType);
        asset.size = args.content.length;
      }
      await asset.save();
      return asset;
    },
    listFolderAssets: async ({ userId, folderId }) => {
      const folder = await Asset.find(userId, folderId);
      if (!folder || folder.content_type !== "folder") return null;
      const out: Array<{ id: string; content_type: string; name: string }> = [];
      const seen = new Set<string>();
      const visit = async (parentId: string): Promise<void> => {
        if (seen.has(parentId)) return; // guard against cyclic parent links
        seen.add(parentId);
        const children = await Asset.getChildren(userId, parentId, 1000);
        for (const child of children) {
          if (child.content_type === "folder") {
            await visit(child.id);
          } else {
            out.push({
              id: child.id,
              content_type: child.content_type,
              name: child.name
            });
          }
        }
      };
      await visit(folderId);
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    },
    getImageDocument: async ({ userId, id }) => {
      const doc = await ImageDocument.findById(id);
      if (!doc || doc.user_id !== userId) return null;
      return doc.toResponse();
    },
    createImageDocument: async ({
      userId,
      name,
      projectId,
      width,
      height,
      document
    }) => {
      const doc = new ImageDocument({
        user_id: userId,
        project_id: projectId ?? "default",
        name,
        width,
        height,
        document: JSON.stringify(document)
      });
      await doc.save();
      return doc.toResponse();
    },
    getTimelineSequence: async ({ userId, id }) => {
      const seq = await TimelineSequence.findById(id);
      if (!seq || seq.user_id !== userId) return null;
      return seq.toTimelineSequence();
    },
    createTimelineSequence: async ({ userId, sequence }) => {
      const seq = TimelineSequence.fromTimelineSequence(
        userId,
        sequence as Parameters<typeof TimelineSequence.fromTimelineSequence>[1]
      );
      await seq.save();
      return seq.toTimelineSequence();
    },
    updateTimelineSequence: async ({ userId, id, sequence }) => {
      const existing = await TimelineSequence.findById(id);
      if (!existing || existing.user_id !== userId) return null;
      const next = TimelineSequence.fromTimelineSequence(
        userId,
        sequence as Parameters<typeof TimelineSequence.fromTimelineSequence>[1]
      );
      const updated = await TimelineSequence.update(id, {
        name: next.name,
        fps: next.fps,
        width: next.width,
        height: next.height,
        duration_ms: next.duration_ms,
        document: next.document
      });
      return updated ? updated.toTimelineSequence() : null;
    }
  });

  return ctx;
}

/**
 * System prompt for the unified chat agent. The agent decides for itself how
 * deep to go: answer directly when it can, call a single tool when one
 * suffices, or call `run_subtask` to spin up a focused child loop for
 * multi-step / parallel work. Planning is not forced — it is one of the
 * choices the agent can make.
 */
const CHAT_AGENT_SYSTEM_PROMPT = `You are NodeTool's chat assistant. Reply in clear, concise prose.

# How to think about effort
- For simple questions, answer directly without any tool calls.
- When one tool suffices, call it and reply.
- When work needs a focused multi-step sub-execution (research a topic
  end-to-end, transform a document, gather structured data), call
  \`run_subtask\` with a tight \`title\` and \`instructions\`. The subtask runs
  as its own agent loop with the same tools.
- For independent parallel work, emit multiple \`run_subtask\` calls in one
  turn — they run concurrently. Siblings spawned in the same turn cannot
  read each other's results; sequence dependent work across turns.
- Subtasks can themselves call \`run_subtask\` (bounded recursion). Don't
  decompose work that you could just do directly.

# Your toolbelt
You always have a fixed toolbelt — there is no per-message tool selection.
- Run any node directly with \`run_node\`, or run a saved workflow with
  \`run_workflow\`. Discover node types and inputs via \`list_nodes\`,
  \`search_nodes\`, \`get_node_info\`, and workflows via \`list_workflows\`.
- Find and read knowledge collections yourself: \`list_collections\` to see
  what exists, then \`query_collection\` to search one.
- Read and write files, browse and search the web, and generate images and
  audio. Decompose work with \`run_subtask\`.

# Image and media
When tools return media URLs, embed them as markdown image / link tags.

# File types
References to documents, images, videos, or audio files have the shape:
- \`type\`: document | image | video | audio
- \`uri\`: \`file:///path/to/file\` or \`http(s)://...\`
`;

const PERMISSION_MODE_PROMPTS: Record<PermissionMode, string> = {
  plan:
    "\n# Permission mode: PLAN (read-only)\n" +
    "You may only use read-only tools (search, read, inspect, query " +
    "collections). Tools that write, run, or act are blocked. Do NOT attempt " +
    "them — instead investigate and produce a concrete, step-by-step plan the " +
    "user can run after switching out of plan mode.\n",
  default:
    "\n# Permission mode: DEFAULT\n" +
    "Read-only tools run automatically. Actions (writing files, running nodes " +
    "or workflows, generating media, browser interactions, external tools) " +
    "require user approval before each call. If the user denies a call, do not " +
    "retry it — explain or propose an alternative.\n",
  auto:
    "\n# Permission mode: AUTO\n" +
    "All tools run automatically without prompting. Be deliberate with actions " +
    "that write, run, or have external side effects.\n"
};

/** Build the chat-agent system prompt for the given permission mode. */
function buildChatAgentSystemPrompt(mode: PermissionMode): string {
  return CHAT_AGENT_SYSTEM_PROMPT + PERMISSION_MODE_PROMPTS[mode];
}

export interface WebSocketReceiveFrame {
  type: string;
  bytes?: Uint8Array | null;
  text?: string | null;
}

export interface WebSocketConnection {
  accept(): Promise<void>;
  receive(): Promise<WebSocketReceiveFrame>;
  sendBytes(data: Uint8Array): Promise<void>;
  sendText(data: string): Promise<void>;
  close(code?: number, reason?: string): Promise<void>;
  clientState?: "connected" | "disconnected";
  applicationState?: "connected" | "disconnected";
}

export interface RunJobRequest {
  job_id?: string;
  workflow_id?: string;
  /** Allow this run to start even if its workflow already has a run in flight. */
  concurrent?: boolean;
  user_id?: string;
  auth_token?: string;
  /** Human-readable run title; persisted as the job name. */
  job_name?: string;
  params?: Record<string, unknown>;
  graph?: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
  explicit_types?: boolean;
  settings?: Record<string, unknown>;
}

interface ActiveJob {
  jobId: string;
  workflowId: string | null;
  context: ProcessingContext;
  runner: WorkflowRunner;
  graph: HydratedGraphData;
  finished: boolean;
  status: "running" | "completed" | "failed" | "cancelled" | "suspended";
  error?: string;
  /** Suspension detail when status is "suspended" (node + saved state). */
  suspend?: {
    node_id: string;
    reason: string;
    state: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  streamTask?: Promise<void>;
  /** Running sum of node-level provider charges (e.g. kie credits) for this run. */
  providerCostTotal?: number;
}

class ToolBridge {
  private waiters = new Map<
    string,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
    }
  >();

  createWaiter(
    toolCallId: string,
    timeoutMs = 300_000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.waiters.delete(toolCallId);
      };
      const wrappedResolve = (value: Record<string, unknown>) => {
        cleanup();
        resolve(value);
      };
      const wrappedReject = (reason: Error) => {
        cleanup();
        reject(reason);
      };
      this.waiters.set(toolCallId, {
        resolve: wrappedResolve,
        reject: wrappedReject
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (this.waiters.has(toolCallId)) {
            wrappedReject(
              new Error(
                `Tool call ${toolCallId} timed out after ${timeoutMs}ms`
              )
            );
          }
        }, timeoutMs);
      }
    });
  }

  resolveResult(toolCallId: string, payload: Record<string, unknown>): void {
    const waiter = this.waiters.get(toolCallId);
    if (!waiter) return;
    waiter.resolve(payload);
  }

  cancelAll(): void {
    const error = new Error("All pending tool calls cancelled");
    for (const waiter of this.waiters.values()) {
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}

export interface UnifiedWebSocketRunnerOptions {
  userId?: string;
  authToken?: string;
  defaultModel?: string;
  defaultProvider?: string;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
  resolveNodeType?: NodeTypeResolver;
  resolveProvider?: (
    providerId: string,
    userId: string
  ) => Promise<BaseProvider>;
  getSystemStats?: () => Record<string, unknown>;
  workspaceResolver?: (
    workflowId: string,
    userId: string
  ) => Promise<string | null>;
  /** Called before a workflow job starts — used to lazily connect the Python bridge. */
  beforeRunJob?: (graph: {
    nodes: ReadonlyArray<NodeDescriptor>;
  }) => Promise<void>;
  /** Resolve node metadata by type — used for auto_save_asset detection. */
  getNodeMetadata?: (nodeType: string) => NodeMetadata | undefined;
  /**
   * Optional pre-flight per-node validator. Forwarded to WorkflowRunner so
   * missing required fields and unset model selections abort the run before
   * any actor is spawned. `NodeRegistry.createNodeValidator()` from
   * `@nodetool-ai/node-sdk` produces a compatible callback.
   */
  validateNode?: NodeValidator;
  /**
   * Optional NodeRegistry. When supplied, MCP node tools surfaced to the
   * chat agent (`list_nodes`, `search_nodes`, etc.) read from this registry.
   */
  nodeRegistry?: NodeRegistry;
  /**
   * Python stdio bridge. Required to serve the read-only RPC commands
   * (list_workflows / get_workflow / list_assets / get_asset / list_nodes /
   * get_node) which delegate to the existing tRPC routers; those routers
   * accept the bridge in their context. Plain workflow execution and chat
   * keep working without it.
   */
  pythonBridge?: PythonBridge;
  /** Whether the Python bridge has finished hydrating. Same wiring as the tRPC HTTP context. */
  getPythonBridgeReady?: () => boolean;
  /** API options forwarded into the tRPC context (metadata roots, registry, etc.). */
  apiOptions?: HttpApiOptions;
}

export class UnifiedWebSocketRunner {
  websocket: WebSocketConnection | null = null;
  mode: WebSocketMode = "binary";
  userId: string | null;
  authToken: string | null;

  private defaultModel: string;
  private defaultProvider: string;
  private resolveExecutor: UnifiedWebSocketRunnerOptions["resolveExecutor"];
  private resolveNodeType?: UnifiedWebSocketRunnerOptions["resolveNodeType"];
  private resolveProvider?: UnifiedWebSocketRunnerOptions["resolveProvider"];
  private getSystemStats: () => Record<string, unknown>;
  private workspaceResolver?: UnifiedWebSocketRunnerOptions["workspaceResolver"];
  private beforeRunJob?: UnifiedWebSocketRunnerOptions["beforeRunJob"];
  private getNodeMetadata?: UnifiedWebSocketRunnerOptions["getNodeMetadata"];
  private validateNode?: UnifiedWebSocketRunnerOptions["validateNode"];
  private nodeRegistry?: NodeRegistry;
  private pythonBridge?: PythonBridge;
  private getPythonBridgeReady?: () => boolean;
  private apiOptions?: HttpApiOptions;
  private configuredProvidersCache: Map<string, Record<string, BaseProvider>> =
    new Map();

  private sendLock: Promise<void> = Promise.resolve();
  private activeJobs = new Map<string, ActiveJob>();
  /**
   * Runs that arrived while {@link MAX_CONCURRENT_JOBS} runs were already in
   * flight. They start automatically (FIFO) as active jobs finish.
   */
  private jobQueue = new JobConcurrencyQueue<RunJobRequest>();
  /**
   * Count of jobs that have passed the concurrency gate but haven't been added
   * to {@link activeJobs} yet (startJob awaits graph hydration first). Counted
   * toward the cap synchronously so two run_job commands arriving back-to-back
   * can't both slip past `activeJobs.size` and exceed MAX_CONCURRENT_JOBS.
   */
  private startingJobs = 0;
  private currentTask: Promise<void> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private statsTimer: NodeJS.Timeout | null = null;
  private chatRequestSeq = 0;
  private clientToolsManifest: Record<string, Record<string, unknown>> = {};
  private toolBridge = new ToolBridge();
  /** Round-trips permission approvals for gated tool calls. */
  private approvalBridge = new ToolBridge();
  /**
   * Per-thread set of tool names the user approved for the rest of the chat
   * via "Allow for this chat". Persists across messages within a thread.
   */
  private chatSessionAllow = new Map<string, Set<string>>();
  private observerRegistered = false;

  private logError(context: string, error: unknown): void {
    log.error(context, formatSanitizedError(error));
  }

  /**
   * Extract text from message content that may be a string or array of content items.
   * Mirrors Python's _extract_query_text / _extract_objective / _extract_text_content.
   */
  private extractTextContent(content: unknown, fallback = ""): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const texts = (content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string);
      return texts.length > 0 ? texts.join(" ") : fallback;
    }
    return fallback;
  }

  private inferOutputType(value: unknown): string {
    if (value === null || value === undefined) return "any";
    if (typeof value === "string") return "str";
    if (typeof value === "number")
      return Number.isInteger(value) ? "int" : "float";
    if (typeof value === "boolean") return "bool";
    if (Array.isArray(value)) return "list";
    if (value && typeof value === "object") return "dict";
    return "any";
  }

  private resolveOutputNodeForKey(
    active: ActiveJob,
    outputKey: string
  ): { id: string; name: string } | null {
    let fallback: { id: string; name: string } | null = null;
    for (const raw of active.graph.nodes) {
      const node = raw as { id?: unknown; name?: unknown; type?: unknown };
      const id = typeof node.id === "string" ? node.id : null;
      if (!id) continue;
      const name = typeof node.name === "string" ? node.name : id;
      const type = typeof node.type === "string" ? node.type : "";
      if (name === outputKey || id === outputKey) return { id, name };
      if (type === "nodetool.output.Output" && !fallback)
        fallback = { id, name };
    }
    return fallback;
  }

  private async sendOutputUpdates(
    active: ActiveJob,
    outputs: Record<string, unknown[]>
  ): Promise<void> {
    for (const [outputKey, values] of Object.entries(outputs)) {
      const nodeRef = this.resolveOutputNodeForKey(active, outputKey) ?? {
        id: outputKey,
        name: outputKey
      };
      const seq = Array.isArray(values) ? values : [];
      for (const rawValue of seq) {
        const value = await active.context.normalizeOutputValue(rawValue);
        await this.sendMessage({
          type: "output_update",
          node_id: nodeRef.id,
          node_name: nodeRef.name,
          output_name: "output",
          value,
          output_type: this.inferOutputType(value),
          metadata: {},
          workflow_id: active.workflowId,
          job_id: active.jobId
        });
      }
    }
  }

  constructor(options: UnifiedWebSocketRunnerOptions) {
    this.userId = options.userId ?? null;
    this.authToken = options.authToken ?? null;
    this.defaultModel = options.defaultModel ?? "gpt-oss:20b";
    this.defaultProvider = options.defaultProvider ?? "ollama";
    this.resolveExecutor = options.resolveExecutor;
    this.resolveNodeType = options.resolveNodeType;
    this.resolveProvider = options.resolveProvider;
    this.workspaceResolver = options.workspaceResolver;
    this.beforeRunJob = options.beforeRunJob;
    this.getNodeMetadata = options.getNodeMetadata;
    this.validateNode = options.validateNode;
    this.nodeRegistry = options.nodeRegistry;
    this.pythonBridge = options.pythonBridge;
    this.getPythonBridgeReady = options.getPythonBridgeReady;
    this.apiOptions = options.apiOptions;
    this.getSystemStats = options.getSystemStats ?? createSystemStatsSampler();
  }

  async connect(
    websocket: WebSocketConnection,
    userId?: string,
    authToken?: string
  ): Promise<void> {
    if (userId) this.userId = userId;
    if (authToken) this.authToken = authToken;
    this.userId = this.userId ?? "1";

    await websocket.accept();
    this.websocket = websocket;
    log.info("Client connected", { userId: this.userId });

    this.startHeartbeat();
    // Only broadcast system stats in development — unnecessary overhead in production
    if (process.env.NODE_ENV !== "production") {
      this.startStatsBroadcast();
    }
    this.registerObserver();
  }

  async disconnect(): Promise<void> {
    log.info("Client disconnected");
    this.stopHeartbeat();
    this.stopStatsBroadcast();
    this.unregisterObserver();
    this.toolBridge.cancelAll();
    this.approvalBridge.cancelAll();

    this.currentTask = null;
    for (const [jobId, job] of this.activeJobs) {
      if (job.runner) {
        job.runner.cancel();
      }
      this.activeJobs.delete(jobId);
    }

    // Drain runs that were still queued (never started): the client is gone,
    // so they will never run. Mark their persisted rows cancelled instead of
    // leaving them as orphaned "scheduled" jobs in jobs.list.
    for (
      let queued = this.jobQueue.dequeue();
      queued;
      queued = this.jobQueue.dequeue()
    ) {
      const queuedId = queued.job_id;
      if (!queuedId) continue;
      try {
        const job = await Job.get(queuedId);
        if (job) {
          job.markCancelled();
          await job.save();
        }
      } catch (err) {
        this.logError("disconnect queue cancellation failed", err);
      }
    }

    if (this.websocket) {
      try {
        await this.websocket.close();
      } catch (error) {
        this.logError("disconnect websocket.close failed", error);
      }
    }
    this.websocket = null;
  }

  private serializeForJson(value: unknown): unknown {
    if (value instanceof Uint8Array) return Array.from(value);
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((v) => this.serializeForJson(v));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = this.serializeForJson(v);
      }
      return out;
    }
    return value;
  }

  async sendMessage(message: Record<string, unknown>): Promise<void> {
    if (!this.websocket) return;
    if (
      this.websocket.clientState === "disconnected" ||
      this.websocket.applicationState === "disconnected"
    ) {
      return;
    }

    // Resolve storage keys in content to browser-accessible URLs before
    // sending over the wire.  This keeps DB storage URL-agnostic while
    // delivering ready-to-use URLs to the client.
    if (Array.isArray(message.content)) {
      message = {
        ...message,
        content: resolveContentUrls(message.content as unknown[])
      };
    }

    // In-process audio/CV chunks carry samples as a native Float32Array,
    // which neither msgpack nor JSON represents. Encode them to base64
    // f32le here — the one and only conversion on the path to the client.
    message = encodeNativeAudioChunks(message);

    const payload =
      this.mode === "text"
        ? (this.serializeForJson(message) as Record<string, unknown>)
        : message;

    const prev = this.sendLock;
    let release!: () => void;
    this.sendLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      if (this.mode === "binary") {
        await this.websocket.sendBytes(pack(payload));
      } else {
        await this.websocket.sendText(JSON.stringify(payload));
      }
    } finally {
      release();
    }
  }

  async receiveMessage(): Promise<Record<string, unknown> | null> {
    if (!this.websocket) {
      throw new Error("WebSocket is not connected");
    }

    const message = await this.websocket.receive();
    if (message.type === "websocket.disconnect") return null;

    if (message.bytes) {
      const maxBytes = getMaxWsMessageBytes();
      if (message.bytes.length > maxBytes) {
        throw new Error(
          `Incoming WebSocket message exceeds maximum size: ` +
            `${message.bytes.length} > ${maxBytes} bytes ` +
            `(set NODETOOL_WS_MAX_MESSAGE_BYTES to raise the limit)`
        );
      }
      return unpack(message.bytes) as Record<string, unknown>;
    }
    if (message.text) {
      const maxBytes = getMaxWsMessageBytes();
      const textBytes = Buffer.byteLength(message.text, "utf8");
      if (textBytes > maxBytes) {
        throw new Error(
          `Incoming WebSocket message exceeds maximum size: ` +
            `${textBytes} > ${maxBytes} bytes ` +
            `(set NODETOOL_WS_MAX_MESSAGE_BYTES to raise the limit)`
        );
      }
      return JSON.parse(message.text) as Record<string, unknown>;
    }
    return null;
  }

  /**
   * If `event` is a tool_call_update, also emit a synthetic assistant message
   * whose `tool_calls` array contains this call. The chat UI renders a
   * persistent ToolCallCard from messages with tool_calls; tool_call_update
   * by itself only drives transient "now running" state. We skip events that
   * already carry `agent_execution_id` because those are routed to
   * ExecutionTree via the agent_execution path.
   */
  private async emitSyntheticToolCallCard(
    event: Record<string, unknown>
  ): Promise<void> {
    if (event["type"] !== "tool_call_update") return;
    const toolCallId = event["tool_call_id"];
    const name = event["name"];
    if (typeof toolCallId !== "string" || typeof name !== "string") return;
    if (!toolCallId || !name) return;
    const args =
      event["args"] && typeof event["args"] === "object"
        ? (event["args"] as Record<string, unknown>)
        : {};
    const message =
      typeof event["message"] === "string" ? event["message"] : null;
    await this.sendMessage({
      type: "message",
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCallId,
          name,
          args,
          message,
          result: null
        }
      ],
      parent_tool_call_id: event["parent_tool_call_id"] ?? null,
      subtask_depth: event["subtask_depth"] ?? null,
      thread_id: event["thread_id"] ?? null,
      workflow_id: event["workflow_id"] ?? null
    });
  }

  /**
   * Normalize a raw graph so that the kernel's NodeDescriptor contract is met.
   * The web-UI / Python serialisation stores node properties under `data`;
   * the kernel expects them under `properties`.
   */
  private normalizeGraph(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }): {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  } {
    const nodes = graph.nodes.map((n) => {
      if (n.properties === undefined && n.data !== undefined) {
        const { data, ...rest } = n;
        return { ...rest, properties: data };
      }
      return n;
    });
    const edges = graph.edges.map((edge) => {
      const rawEdgeType = edge.edge_type ?? edge.type;
      const edge_type = rawEdgeType === "control" ? "control" : "data";
      const { type, ...rest } = edge;
      return { ...rest, edge_type };
    });
    return { nodes, edges };
  }

  private async hydrateGraph(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }): Promise<HydratedGraphData> {
    const normalized = this.normalizeGraph(graph);
    if (!this.resolveNodeType) {
      // No registry resolver configured — behavior flags can only come from
      // the saved graph itself; absent ones are explicitly defaulted off.
      return withExplicitNodeFlags(normalized as unknown as GraphData);
    }

    const hydrated = await Graph.loadFromDict(normalized, {
      resolver: this.resolveNodeType
    });
    return {
      nodes: [...hydrated.nodes],
      edges: [...hydrated.edges]
    };
  }

  private getRawGraph(req: RunJobRequest):
    | Promise<{
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      }>
    | {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      } {
    if (req.graph) {
      return this.normalizeGraph(req.graph);
    }
    if (req.workflow_id && this.userId) {
      const userId = this.userId;
      const workflowId = req.workflow_id;
      return (async () => {
        const workflow = await Workflow.find(userId, workflowId);
        if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
        return this.normalizeGraph(
          workflow.graph as {
            nodes: Array<Record<string, unknown>>;
            edges: Array<Record<string, unknown>>;
          }
        );
      })();
    }
    throw new Error("workflow_id or graph is required");
  }

  /**
   * Surface a clean terminal job_update when pre-run setup fails (typically
   * because the Python bridge could not start). Without this the error would
   * bubble up to handleCommand and be sent as a generic `invalid_command`
   * envelope, which the UI does not associate with the job — the workflow
   * appears to spin forever instead of failing.
   */
  private async emitBeforeRunFailure(
    jobId: string,
    workflowId: string | null,
    err: unknown
  ): Promise<void> {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logError("beforeRunJob failed", err);
    await this.sendMessage({
      type: "job_update",
      status: "failed",
      job_id: jobId,
      workflow_id: workflowId,
      error: errorMessage
    });
    try {
      const job = (await Job.get(jobId)) as Job | null;
      if (job) {
        job.markFailed(errorMessage);
        await job.save();
      }
    } catch (persistErr) {
      this.logError("beforeRunJob failure persistence failed", persistErr);
    }
  }

  /** Default cap when `MAX_CONCURRENT_JOBS` is unset/invalid. */
  private static readonly DEFAULT_MAX_CONCURRENT_JOBS = 4;
  /** Default per-workflow cap when `MAX_CONCURRENT_RUNS_PER_WORKFLOW` is unset/invalid. */
  private static readonly DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW = 4;
  /** How long a resolved concurrency-setting value is reused before re-reading. */
  private static readonly MAX_CONCURRENT_JOBS_TTL_MS = 5000;
  private maxConcurrentJobsCache: { value: number; at: number } | null = null;
  private maxRunsPerWorkflowCache: { value: number; at: number } | null = null;

  /**
   * Resolve the per-client concurrency cap from settings (>= 1), cached for a
   * few seconds so back-to-back run_job/drainQueue calls don't hit the settings
   * store every time. The setting changes rarely, so a short TTL is fine.
   */
  private async getMaxConcurrentJobs(): Promise<number> {
    const cached = this.maxConcurrentJobsCache;
    const value = await this.resolvePositiveIntSetting(
      "MAX_CONCURRENT_JOBS",
      UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_JOBS,
      cached
    );
    this.maxConcurrentJobsCache = value;
    return value.value;
  }

  /**
   * Resolve the per-workflow concurrency cap (>= 1) for runs that opt into
   * concurrency. When this many runs of the same workflow are already in
   * flight, further opted-in runs queue. Cached like {@link getMaxConcurrentJobs}.
   */
  private async getMaxConcurrentRunsPerWorkflow(): Promise<number> {
    const cached = this.maxRunsPerWorkflowCache;
    const value = await this.resolvePositiveIntSetting(
      "MAX_CONCURRENT_RUNS_PER_WORKFLOW",
      UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW,
      cached
    );
    this.maxRunsPerWorkflowCache = value;
    return value.value;
  }

  /**
   * Read a positive-integer setting, reusing the cached value while it's still
   * within the TTL. Falls back to `fallback` when the setting is unset/invalid
   * or the settings store is unavailable (e.g. DB not initialized) rather than
   * blocking the run, matching the runner's other best-effort DB access.
   */
  private async resolvePositiveIntSetting(
    key: string,
    fallback: number,
    cached: { value: number; at: number } | null
  ): Promise<{ value: number; at: number }> {
    const now = Date.now();
    if (cached && now - cached.at < UnifiedWebSocketRunner.MAX_CONCURRENT_JOBS_TTL_MS) {
      return cached;
    }
    let raw: string | null = null;
    try {
      raw = await getSetting(key);
    } catch {
      // Settings store unavailable — fall back to the default.
    }
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return { value, at: now };
  }

  /** Jobs occupying a concurrency slot: live + reserved-but-not-yet-registered. */
  private get inFlightJobCount(): number {
    return this.activeJobs.size + this.startingJobs;
  }

  /**
   * Number of live (unfinished) runs currently executing for a workflow. Used
   * to enforce the per-workflow concurrency limit so non-concurrent runs stay
   * sequential and their live node updates don't clobber each other in the
   * editor. Safe to check against `activeJobs` alone: commands are processed
   * one-at-a-time and `startJobInner` registers the job before returning.
   */
  private countActiveJobsForWorkflow(
    workflowId: string | null | undefined
  ): number {
    if (!workflowId) {
      return 0;
    }
    let count = 0;
    for (const job of this.activeJobs.values()) {
      if (job.workflowId === workflowId && !job.finished) {
        count++;
      }
    }
    return count;
  }

  /**
   * The per-workflow concurrency limit a given run is subject to: concurrency
   * opt-in runs share the configurable {@link getMaxConcurrentRunsPerWorkflow}
   * cap; everything else stays strictly sequential (one run per workflow) so
   * live node updates don't clobber the editor.
   */
  private perWorkflowLimitFor(req: { concurrent?: boolean }): Promise<number> {
    return req.concurrent
      ? this.getMaxConcurrentRunsPerWorkflow()
      : Promise.resolve(1);
  }

  /**
   * Entry point for the "run_job" command. Starts the run immediately when the
   * client is under its concurrency cap, otherwise queues it (FIFO) and emits a
   * `queued` job update. Queued runs start automatically as active jobs finish.
   */
  async runJob(req: RunJobRequest): Promise<void> {
    const max = await this.getMaxConcurrentJobs();
    const perWorkflowMax = await this.perWorkflowLimitFor(req);
    // Queue the run when over the global cap, or when this workflow already has
    // its per-workflow limit of runs in flight — 1 for normal runs, or the
    // configurable MAX_CONCURRENT_RUNS_PER_WORKFLOW for runs that opt into
    // concurrency. Reserve the slot synchronously (after the awaits above) so
    // two run_job commands can't both observe a free slot before either registers.
    if (
      this.inFlightJobCount >= max ||
      this.countActiveJobsForWorkflow(req.workflow_id) >= perWorkflowMax
    ) {
      await this.enqueueJob(req);
      return;
    }
    this.startingJobs++;
    await this.startJob(req);
  }

  /** Queue a run that can't start yet, persist it, and notify the client. */
  private async enqueueJob(req: RunJobRequest): Promise<void> {
    const jobId = req.job_id ?? randomUUID();
    req.job_id = jobId;
    const position = this.jobQueue.enqueue(req);
    log.info("Job queued", { jobId, position });
    // Persist the queued run so it shows in jobs.list (Queue panel, reload,
    // other tabs). Best-effort, mirroring startJobInner's persistence. It flips
    // to "running" in startJobInner when a slot frees.
    try {
      const existing = await Job.get(jobId);
      if (!existing) {
        await Job.create({
          id: jobId,
          workflow_id: req.workflow_id ?? "",
          user_id: req.user_id ?? this.userId ?? "1",
          status: "queued",
          name: req.job_name ?? "",
          params: req.params ?? {},
          graph: req.graph ?? { nodes: [], edges: [] }
        });
      }
    } catch (err) {
      this.logError("enqueue persistence failed", err);
    }
    void this.sendMessage({
      type: "job_update",
      status: "queued",
      job_id: jobId,
      workflow_id: req.workflow_id ?? null,
      queue_position: position,
      message: `Queued (#${position})`
    });
  }

  /**
   * Start the next queued run (if any) after a job slot frees up, and refresh
   * the reported positions of the runs still waiting.
   */
  private drainQueue(): void {
    void (async () => {
      const max = await this.getMaxConcurrentJobs().catch(
        () => UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_JOBS
      );
      const perWorkflowMax = await this.getMaxConcurrentRunsPerWorkflow().catch(
        () => UnifiedWebSocketRunner.DEFAULT_MAX_CONCURRENT_RUNS_PER_WORKFLOW
      );
      // Fill free slots with the first queued run whose workflow is still under
      // its per-workflow limit (1 for normal runs, perWorkflowMax for opted-in
      // concurrent runs). startJob registers the job before it returns, so the
      // next iteration sees it as in-flight.
      while (this.inFlightJobCount < max) {
        const candidate = this.jobQueue
          .positions()
          .find(
            (p) =>
              this.countActiveJobsForWorkflow(p.workflowId) <
              (p.concurrent ? perWorkflowMax : 1)
          );
        if (!candidate) {
          break;
        }
        const next = this.jobQueue.remove(candidate.jobId);
        if (!next) {
          break;
        }
        // Reserve the slot synchronously, mirroring runJob, so a concurrent
        // run_job/drain can't also claim it before startJob registers.
        this.startingJobs++;
        try {
          await this.startJob(next);
        } catch (err) {
          // The dequeued job threw before it could register/stream. Don't
          // silently lose it: tell the client this run failed, then keep
          // draining so the rest of the queue still progresses.
          this.logError("startJob (from queue) failed", err);
          await this.sendMessage({
            type: "job_update",
            status: "failed",
            job_id: next.job_id ?? null,
            workflow_id: next.workflow_id ?? null,
            error: formatSanitizedError(err)
          });
        }
      }
      this.broadcastQueuePositions();
    })();
  }

  /** Push updated queue positions to every still-waiting run. */
  private broadcastQueuePositions(): void {
    for (const { jobId, workflowId, position } of this.jobQueue.positions()) {
      void this.sendMessage({
        type: "job_update",
        status: "queued",
        job_id: jobId,
        workflow_id: workflowId,
        queue_position: position,
        message: `Queued (#${position})`
      });
    }
  }

  private async startJob(req: RunJobRequest): Promise<void> {
    // The caller (runJob/drainQueue) reserved a concurrency slot via
    // startingJobs++. Release it exactly once here: the slot is handed off to
    // activeJobs on successful registration, or freed on early return/throw.
    let slotReleased = false;
    const releaseSlot = () => {
      if (!slotReleased) {
        slotReleased = true;
        this.startingJobs = Math.max(0, this.startingJobs - 1);
      }
    };
    try {
      await this.startJobInner(req, releaseSlot);
    } finally {
      // Safety net: if startJobInner returned/threw without registering, the
      // slot is freed so it doesn't leak and permanently shrink the cap.
      releaseSlot();
    }
  }

  private async startJobInner(
    req: RunJobRequest,
    releaseSlot: () => void
  ): Promise<void> {
    const userId = req.user_id ?? this.userId ?? "1";
    const workflowId = req.workflow_id ?? null;
    const jobId = req.job_id ?? randomUUID();

    const rawGraph = await this.getRawGraph(req);

    // Hydrate the graph (resolves node types from the registry)
    const graph = await this.hydrateGraph(rawGraph);

    if (this.beforeRunJob) {
      try {
        await this.beforeRunJob(graph);
      } catch (err) {
        await this.emitBeforeRunFailure(jobId, workflowId, err);
        return;
      }
    }

    const workspaceDir =
      workflowId && this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : null;

    const context = createRuntimeContext({
      jobId,
      workflowId,
      userId,
      workspaceDir,
      assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
    });

    // Expose executor/node-type resolution on the context so that
    // sub-workflow nodes (WorkflowNode) can create child runners.
    context.setResolveExecutor((node) => this.resolveExecutor(node));
    if (this.resolveNodeType) {
      const resolverObj =
        typeof this.resolveNodeType === "function"
          ? { resolveNodeType: this.resolveNodeType }
          : this.resolveNodeType;
      context.setResolveNodeType(
        (nodeType) =>
          resolverObj.resolveNodeType(nodeType) as Promise<{
            nodeType: string;
            propertyTypes?: Record<string, string>;
            outputs?: Record<string, string>;
            supportsDynamicInputs?: boolean;
            descriptorDefaults?: Record<string, unknown>;
          } | null>
      );
    }

    const runner = new WorkflowRunner(jobId, {
      resolveExecutor: (node) =>
        this.resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      executionContext: context,
      validateNode: this.validateNode
    });

    const active: ActiveJob = {
      jobId,
      workflowId,
      context,
      runner,
      graph,
      finished: false,
      status: "running"
    };
    this.activeJobs.set(jobId, active);
    // Slot ownership transfers from startingJobs to activeJobs now that the
    // job is registered and counted by activeJobs.size.
    releaseSlot();
    log.info("Job started", { jobId, workflowId });

    try {
      const existing = await Job.get(jobId);
      if (existing) {
        // The run may have been cancelled via the DB-only cancel path (tRPC
        // `jobs.cancel`) while it was still sitting in the in-memory queue —
        // that path doesn't remove it from `jobQueue`, so drainQueue can still
        // hand it to us. Honor the cancellation instead of resurrecting it:
        // undo the start, surface the cancelled status, and free the slot.
        if (existing.status === "cancelled") {
          log.info("Skipping start of cancelled job", { jobId });
          this.activeJobs.delete(jobId);
          void this.sendMessage({
            type: "job_update",
            status: "cancelled",
            job_id: jobId,
            workflow_id: workflowId
          });
          return;
        }
        // Was persisted as "queued" while waiting for a slot — flip it to
        // running now that it's actually starting.
        if (existing.status !== "running") {
          existing.markRunning();
          await existing.save();
        }
      } else {
        await Job.create({
          id: jobId,
          workflow_id: workflowId ?? "",
          user_id: userId,
          status: "running",
          name: req.job_name ?? "",
          started_at: new Date().toISOString(),
          params: req.params ?? {},
          graph
        });
      }
    } catch (error) {
      this.logError("runJob persistence failed", error);
      // Persistence is best-effort in TS runtime mode.
    }

    const executePromise = runner.run(
      {
        job_id: jobId,
        workflow_id: workflowId ?? undefined,
        params: req.params ?? {}
      },
      graph
    );

    active.streamTask = this.streamJobMessages(active, executePromise);
  }

  private async streamJobMessages(
    active: ActiveJob,
    executePromise: Promise<{
      status: "completed" | "failed" | "cancelled" | "suspended";
      error?: string;
      outputs?: Record<string, unknown[]>;
      suspend?: {
        node_id: string;
        reason: string;
        state: Record<string, unknown>;
        metadata: Record<string, unknown>;
      };
    }>
  ): Promise<void> {
    let terminalSeen = false;
    let terminalWithResultSeen = false;
    let outputUpdateSeen = false;
    let finalOutputs: Record<string, unknown[]> = {};
    // Per-node arrival counter for `generation_complete.index` within this job.
    // The function is scoped to one job, so keying by node_id alone yields a
    // per-(job_id, node_id) monotonic index. DB-ordering reconciliation is a
    // later step (RFC Decision 8); this is the in-memory arrival order.
    const generationIndexByNode = new Map<string, number>();
    // Arrival positions already autosaved in THIS run, keyed `${nodeId} ${index}`.
    // A single generation_complete can persist several assets (a `list[image]`
    // output, or media + text), so dedupe by the event's arrival index — NOT by
    // a total asset count, which would under-save the next event (RFC D8).
    const autosavedSlots = new Set<string>();
    // Cross-run replay dedupe: the `generation_index` values already persisted
    // for a node by a PRIOR run. Warmed with ONE `Asset.paginate` on a node's
    // first generation_complete, then reused for every later variant — so an
    // N-variant run does one query per node, not one per variant (RFC D8).
    const persistedIndexByNode = new Map<string, Set<number>>();
    await this.sendMessage({
      type: "job_update",
      status: "running",
      job_id: active.jobId,
      workflow_id: active.workflowId
    });

    void executePromise
      .then((result) => {
        active.status = result.status;
        active.error = result.error;
        active.suspend = result.suspend;
        finalOutputs = result.outputs ?? {};
      })
      .catch((err) => {
        this.logError("job execution failed", err);
        active.status = "failed";
        active.error = formatSanitizedError(err);
      })
      .finally(() => {
        active.finished = true;
      });

    while (!active.finished || active.context.hasMessages()) {
      while (active.context.hasMessages()) {
        const msg = active.context.popMessage();
        if (!msg) break;
        const outbound: Record<string, unknown> = {
          ...(msg as unknown as Record<string, unknown>),
          job_id:
            (msg as unknown as Record<string, unknown>).job_id ?? active.jobId,
          workflow_id:
            (msg as unknown as Record<string, unknown>).workflow_id ??
            active.workflowId
        };
        if (outbound.error !== undefined) {
          outbound.error = formatSanitizedError(outbound.error);
        }
        if (
          outbound.type === "notification" &&
          typeof outbound.content === "string"
        ) {
          outbound.content = sanitizeLargeText(outbound.content);
        }
        if (outbound.type === "node_update" && outbound.status === "error") {
          log.error("Node error", {
            jobId: active.jobId,
            nodeId: outbound.node_id,
            error: outbound.error
          });
        } else if (
          outbound.type === "job_update" &&
          outbound.status === "failed"
        ) {
          log.error("Job failed", {
            jobId: active.jobId,
            error: outbound.error
          });
        }

        // Skip messages for constant/input nodes — they produce trivial
        // outputs that don't need to be relayed to the frontend.
        if (
          outbound.type === "output_update" ||
          outbound.type === "node_update" ||
          outbound.type === "generation_complete"
        ) {
          const nodeId = String(outbound.node_id ?? "");
          const graphNodes =
            (
              active.graph as {
                nodes?: Array<{ id?: unknown; type?: unknown }>;
              }
            ).nodes ?? [];
          const node = graphNodes.find((n) => n.id === nodeId);
          const nodeType = typeof node?.type === "string" ? node.type : "";

          // Skip constant and input nodes entirely
          if (
            nodeType.startsWith("nodetool.constant.") ||
            nodeType.startsWith("nodetool.input.")
          ) {
            continue;
          }

          const meta = this.getNodeMetadata?.(nodeType);

          // Stamp an arrival-order `index` on generation_complete, keyed per
          // (job_id, node_id) (the function is job-scoped, so node_id alone
          // suffices). job_id/workflow_id were already backfilled by the
          // outbound spread above.
          if (outbound.type === "generation_complete") {
            const arrivalIndex = generationIndexByNode.get(nodeId) ?? 0;
            outbound.index = arrivalIndex;
            generationIndexByNode.set(nodeId, arrivalIndex + 1);

            // Autosave one generation per generation_complete on the RAW outputs
            // (before the normalize at the bottom of this block strips inline
            // bytes), tagged { jobId, nodeId, index }. This is the autosave
            // cutover (RFC §7, D3): persistence is driven per generation event,
            // not by the terminal node_update{completed} — so an N-execution
            // run persists N distinct generations.
            //
            // Replay dedupe (D8) is keyed on the event's arrival `index`, NOT on
            // a total asset count: a single generation_complete can persist
            // several assets (a `list[image]` output, or media + a text asset),
            // so a count-vs-index gate would under-save the very first run. Two
            // guards, both keyed by (nodeId, index):
            //   - in-run: skip if this arrival slot was already saved this run;
            //   - cross-run: skip if an asset for (jobId, nodeId) already carries
            //     metadata.generation_index === arrivalIndex (a reconnect replay
            //     re-streams the same events with arrivalIndex back at 0..N-1).
            // Server-only (D9): this is the websocket runner; the browser never
            // reaches runJob, so no browser autosave is introduced here.
            if (meta?.auto_save_asset && outbound.outputs != null) {
              const userId = this.userId ?? "1";
              const slotKey = `${nodeId} ${arrivalIndex}`;
              // Warm the cross-run replay set once per node (on its first
              // generation_complete), then reconcile every later variant
              // against the in-memory set — one DB read per node, not per slot.
              let persistedIndices = persistedIndexByNode.get(nodeId);
              if (persistedIndices === undefined) {
                const [persisted] = await Asset.paginate(userId, {
                  jobId: active.jobId,
                  nodeId,
                  limit: 1000
                });
                persistedIndices = new Set<number>();
                for (const a of persisted) {
                  const gi = (
                    a.metadata as { generation_index?: unknown } | null
                  )?.generation_index;
                  if (typeof gi === "number") persistedIndices.add(gi);
                }
                persistedIndexByNode.set(nodeId, persistedIndices);
              }

              if (
                !autosavedSlots.has(slotKey) &&
                !persistedIndices.has(arrivalIndex)
              ) {
                autosavedSlots.add(slotKey);
                try {
                  await autoSaveAssets(
                    outbound.outputs as Record<string, unknown>,
                    {
                      userId,
                      workflowId: active.workflowId,
                      jobId: active.jobId,
                      nodeId,
                      textOutputName: primaryTextOutputName(meta),
                      generationIndex: arrivalIndex,
                      properties:
                        (outbound.properties as Record<
                          string,
                          unknown
                        > | null) ?? undefined
                    }
                  );
                } catch (err) {
                  log.warn("autoSaveAssets error", { error: String(err) });
                }
              }
            }
          }

          // Relay output_update for display-sink nodes (Output, Preview) and
          // for streaming or auto-saving generative nodes (FAL / Replicate /
          // Kie / …) so the client receives one event per yielded item — the
          // UI accumulates and renders each generation as it arrives. The
          // Preview node re-emits each chunk it receives on its own terminal
          // `output` handle; relaying those is what lets the preview stream
          // incrementally instead of collapsing to the final value.
          if (outbound.type === "output_update") {
            const isDisplaySink =
              nodeType.includes("Output") ||
              nodeType.endsWith(".Preview");
            const isStreamingLeaf =
              Boolean(meta?.is_streaming_output) ||
              Boolean(meta?.auto_save_asset);
            if (!isDisplaySink && !isStreamingLeaf) continue;
            outputUpdateSeen = true;
          }

          await this._handleNodeProviderCost(active, outbound, nodeType);

          // Materialize binary assets to temp URLs before sending over WebSocket
          if (outbound.type === "node_update" && outbound.result != null) {
            outbound.result = await active.context.normalizeOutputValue(
              outbound.result
            );
          }
          if (outbound.type === "output_update" && outbound.value != null) {
            outbound.value = await active.context.normalizeOutputValue(
              outbound.value
            );
          }
          // Normalize generation_complete.outputs the same way node_update.result
          // is treated (raw bytes → temp URLs) before sending over the wire.
          if (outbound.type === "generation_complete" && outbound.outputs != null) {
            outbound.outputs = await active.context.normalizeOutputValue(
              outbound.outputs
            );
          }
        }
        await this.sendMessage(outbound);
        if (outbound.type === "job_update") {
          const status = String(outbound.status ?? "");
          if (
            ["completed", "failed", "cancelled", "error", "suspended"].includes(
              status
            )
          ) {
            terminalSeen = true;
            if (outbound.result !== undefined) {
              terminalWithResultSeen = true;
            }
          }
        }
      }
      if (!active.finished) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    if (!outputUpdateSeen && Object.keys(finalOutputs).length > 0) {
      await this.sendOutputUpdates(active, finalOutputs);
    }

    log.info("Job completed", { jobId: active.jobId, status: active.status });

    if (
      !terminalSeen ||
      (!terminalWithResultSeen && Object.keys(finalOutputs).length > 0)
    ) {
      await this.sendMessage({
        type: "job_update",
        status: active.status,
        job_id: active.jobId,
        workflow_id: active.workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });
    }

    // Persist final job status
    try {
      const job = (await Job.get(active.jobId)) as Job | null;
      // A DB-only cancel (tRPC `jobs.cancel`) can finalize the row as cancelled
      // while the job is still executing in memory. Don't overwrite that with a
      // completed/failed status when the in-flight run finishes.
      if (job) {
        if (job.status !== "cancelled") {
          if (active.status === "completed") {
            job.markCompleted();
          } else if (active.status === "failed") {
            job.markFailed(active.error ?? "Unknown error");
          } else if (active.status === "cancelled") {
            job.markCancelled();
          } else if (active.status === "suspended") {
            // A node paused the run (e.g. human-in-the-loop). Persist the
            // saved state so the job can be resumed later.
            job.markSuspended(
              active.suspend?.node_id ?? "",
              active.suspend?.reason ?? "",
              active.suspend?.state,
              active.suspend?.metadata
            );
          }
        }
        job.cost =
          (active.providerCostTotal ?? 0) > 0
            ? (active.providerCostTotal ?? null)
            : null;
        await job.save();
      }
    } catch (error) {
      this.logError("job persistence (final status) failed", error);
    }

    this.activeJobs.delete(active.jobId);
    this.drainQueue();
  }

  async reconnectJob(jobId: string, workflowId?: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) {
      throw new Error(`Job ${jobId} not found`);
    }

    await this.sendMessage({
      type: "job_update",
      status: active.status,
      job_id: jobId,
      workflow_id: workflowId ?? active.workflowId
    });

    for (const status of Object.values(active.context.getNodeStatuses())) {
      await this.sendMessage({
        ...(status as unknown as Record<string, unknown>),
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
    for (const status of Object.values(active.context.getEdgeStatuses())) {
      await this.sendMessage({
        ...(status as unknown as Record<string, unknown>),
        job_id: jobId,
        workflow_id: workflowId ?? active.workflowId
      });
    }
  }

  async resumeJob(jobId: string, workflowId?: string): Promise<void> {
    await this.reconnectJob(jobId, workflowId);
  }

  async cancelJob(
    jobId: string,
    workflowId?: string
  ): Promise<Record<string, unknown>> {
    if (!jobId) {
      return { error: "No job_id provided" };
    }

    // A run that's still queued has no ActiveJob yet — drop it from the queue
    // and tell the client it's cancelled before it ever starts.
    const queued = this.jobQueue.remove(jobId);
    if (queued) {
      const cancelledWorkflowId = queued.workflow_id ?? workflowId ?? null;
      // Mark the persisted queued row cancelled so it leaves the queue in
      // jobs.list too (not just the in-memory queue).
      try {
        const job = await Job.get(jobId);
        if (job) {
          job.markCancelled();
          await job.save();
        }
      } catch (err) {
        this.logError("cancel persistence failed", err);
      }
      await this.sendMessage({
        type: "job_update",
        status: "cancelled",
        job_id: jobId,
        workflow_id: cancelledWorkflowId
      });
      this.broadcastQueuePositions();
      return {
        message: "Queued job cancelled",
        job_id: jobId,
        workflow_id: cancelledWorkflowId
      };
    }

    const active = this.activeJobs.get(jobId);
    if (!active) {
      return {
        error: "Job not found or already completed",
        job_id: jobId,
        workflow_id: workflowId ?? ""
      };
    }

    if (active.runner) {
      active.runner.cancel();
    }
    active.status = "cancelled";

    // Persist the cancellation to the DB and announce it right away, mirroring
    // the queued branch and the tRPC jobs.cancel path. The runner's own cleanup
    // can lag (it drains in-flight messages before its .finally() persists), so
    // without this the persisted row stays "running" and jobs.list — which the
    // Queue panel reads from — keeps reporting the job as running even though
    // the toolbar Stop already fired. Marking it cancelled here, plus the
    // job_update below, lets clients refetch and reflect the stop immediately.
    const cancelledWorkflowId = workflowId ?? active.workflowId ?? null;
    try {
      const job = await Job.get(jobId);
      if (job && job.status !== "cancelled") {
        job.markCancelled();
        await job.save();
      }
    } catch (err) {
      this.logError("cancel persistence failed", err);
    }
    await this.sendMessage({
      type: "job_update",
      status: "cancelled",
      job_id: jobId,
      workflow_id: cancelledWorkflowId
    });

    // Do NOT set active.finished = true here. Let the runner's cancellation
    // propagate through executePromise's .finally() callback so that
    // streamJobMessages can drain remaining messages and persist job state.
    return {
      message: "Job cancellation requested",
      job_id: jobId,
      workflow_id: cancelledWorkflowId ?? ""
    };
  }

  getStatus(jobId?: string): Record<string, unknown> {
    if (jobId) {
      const active = this.activeJobs.get(jobId);
      if (!active) {
        return { status: "not_found", job_id: jobId };
      }
      return {
        status: active.status,
        job_id: active.jobId,
        workflow_id: active.workflowId
      };
    }

    return {
      active_jobs: Array.from(this.activeJobs.values()).map((job) => ({
        job_id: job.jobId,
        workflow_id: job.workflowId,
        status: job.status
      }))
    };
  }

  async clearModels(): Promise<Record<string, unknown>> {
    return {
      message:
        "Model clearing is managed by provider implementations in TS runtime"
    };
  }

  private async ensureThreadExists(
    threadId?: string,
    workflowId?: string | null
  ): Promise<string> {
    const userId = this.userId ?? "1";
    if (!threadId) {
      const thread = await Thread.create({
        user_id: userId,
        workflow_id: workflowId ?? null,
        title: ""
      });
      return thread.id;
    }
    const existing = await Thread.find(userId, threadId);
    if (existing) return existing.id;
    const thread = await Thread.create({
      id: threadId,
      user_id: userId,
      workflow_id: workflowId ?? null,
      title: ""
    });
    return thread.id;
  }

  private dbMessageToProviderMessage(m: Message): ProviderMessage | null {
    const role = m.role as ProviderMessage["role"];
    // Filter out non-standard roles (e.g. "agent_execution") that providers can't handle
    if (!role || !["user", "assistant", "system", "tool"].includes(role)) {
      return null;
    }
    const rawContent = Array.isArray(m.content)
      ? (resolveContentForProvider(m.content as unknown[]) as MessageContent[])
      : (m.content as string | null);
    return {
      role,
      content: rawContent ?? "",
      toolCallId: typeof m.tool_call_id === "string" ? m.tool_call_id : null,
      toolCalls: Array.isArray(m.tool_calls)
        ? (m.tool_calls as Array<{
            id: string;
            name: string;
            args: Record<string, unknown>;
          }>)
        : null,
      threadId: m.thread_id
    };
  }

  /**
   * Save a message dict to the database.
   * Mirrors Python's _save_message_to_db_async: pops id, type, user_id before create.
   */
  private async saveMessageToDb(
    messageData: Record<string, unknown>
  ): Promise<void> {
    const data = { ...messageData };
    delete data.id;
    delete data.type;
    const threadId = typeof data.thread_id === "string" ? data.thread_id : "";
    delete data.thread_id;
    const userId = this.userId ?? "1";
    delete data.user_id;

    await Message.create({
      thread_id: threadId,
      user_id: userId,
      ...data
    });
  }

  /**
   * Recursively process tool results, handling asset-like objects.
   * Mirrors Python's RegularChatProcessor._process_tool_result().
   *
   * - Asset-like objects (have type + uri/data): materialized via storage
   * - Date/datetime: converted to ISO string
   * - Arrays/objects: recursed into
   * - Primitives: returned as-is
   */
  private async processToolResult(
    obj: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (obj === null || obj === undefined) return obj;

    // Asset-like objects: { type: "image"|"audio"|"video"|..., uri?: string, data?: ... }
    if (typeof obj === "object" && !Array.isArray(obj)) {
      const record = obj as Record<string, unknown>;

      // Check if it's an asset-like object (has type + uri or data)
      if (
        "type" in record &&
        ("uri" in record || "data" in record || "asset_id" in record)
      ) {
        // Use ProcessingContext's normalizeOutputValue to handle asset materialization
        return ctx.normalizeOutputValue(record, "storage_url");
      }

      // Date objects
      if (obj instanceof Date) {
        return obj.toISOString();
      }

      // Regular objects — recurse into values
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        result[key] = await this.processToolResult(value, ctx);
      }
      return result;
    }

    // Arrays — recurse into items
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.processToolResult(item, ctx)));
    }

    // Uint8Array/Buffer — store as asset
    if (obj instanceof Uint8Array) {
      if (!ctx.storage) return obj;
      const key = `assets/${randomUUID()}.bin`;
      const uri = await ctx.storage.store(key, obj);
      return { type: "asset", uri };
    }

    // Primitives
    return obj;
  }

  /**
   * Persist image bytes to temp storage and return a handle `view_image` can
   * resolve — a bare `<uuid>.<ext>` storage key. No DB asset row is created, so
   * these captures never clutter the user's asset library; the bytes live only
   * in the request's temp storage. Returns null if there is no storage adapter
   * or the write fails.
   */
  private async storeTempImageAsset(
    ctx: ProcessingContext,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<string | null> {
    if (!ctx.storage) return null;
    const ext = IMAGE_MIME_TO_EXT[mimeType] ?? "png";
    const key = `${randomUUID()}.${ext}`;
    try {
      await ctx.storage.store(key, bytes, mimeType);
      return key;
    } catch (err) {
      log.error("Failed to store temp image asset", {
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  }

  /**
   * Replace embedded image pixels in a tool result — timeline `frames[]` or an
   * `image_content` blob (e.g. `ui_3d_capture_view`) — with temp-asset handles.
   * The model receives a handle and an instruction to call `view_image`, which
   * is the single mechanism that pulls pixels into context. Keeps image bytes
   * out of the standing chat history. Non-image results pass through untouched.
   */
  private async materializeToolResultImages(
    toolResult: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (
      !toolResult ||
      typeof toolResult !== "object" ||
      Array.isArray(toolResult)
    ) {
      return toolResult;
    }
    const record = toolResult as Record<string, unknown>;

    const handleFor = async (
      payload: { bytes: Uint8Array; mimeType: string } | { uri: string } | null
    ): Promise<string | null> => {
      if (!payload) return null;
      if ("uri" in payload) return payload.uri;
      return this.storeTempImageAsset(ctx, payload.bytes, payload.mimeType);
    };

    // Timeline frames → one image handle per frame.
    if (Array.isArray(record.frames)) {
      const handles: unknown[] = [];
      let stored = 0;
      for (const frame of record.frames) {
        if (!frame || typeof frame !== "object") {
          handles.push(frame);
          continue;
        }
        const f = { ...(frame as Record<string, unknown>) };
        const payload = extractEmbeddedImage({
          uri: f.dataUrl,
          mimeType: "image/jpeg"
        });
        delete f.dataUrl;
        const id = await handleFor(payload);
        if (id) {
          f.image_id = id;
          stored++;
        }
        handles.push(f);
      }
      const out: Record<string, unknown> = { ...record, frames: handles };
      if (stored > 0) {
        out.note = `Captured ${stored} timeline frame(s) as image assets. Call view_image({ image_id }) to inspect a frame.`;
      }
      return out;
    }

    // Single image_content blob → one image handle.
    if (record.image_content && typeof record.image_content === "object") {
      const payload = extractEmbeddedImage(
        record.image_content as Record<string, unknown>
      );
      const id = await handleFor(payload);
      const out: Record<string, unknown> = { ...record };
      delete out.image_content;
      if (id) {
        out.image_id = id;
        const base =
          typeof record.note === "string" ? record.note : "Captured an image.";
        out.note = `${base} Saved as image asset "${id}". Call view_image({ image_id: "${id}" }) to inspect it.`;
      }
      return out;
    }

    return toolResult;
  }

  /**
   * The displayable text for a tool result that may be image content. Used for
   * the persisted/echoed tool message so chat history stays a light note
   * instead of a base64 blob (the image only rides the in-flight provider
   * message for the turn that captured it).
   */
  private toolResultDisplayText(content: MessageContent[]): string {
    const text = content
      .filter((c): c is MessageContent & { type: "text"; text: string } =>
        c.type === "text"
      )
      .map((c) => c.text)
      .join("\n");
    return text || "[image result]";
  }


  private addCollectionContext(
    messages: ProviderMessage[],
    collectionContext: string
  ): ProviderMessage[] {
    // Find the last user message index
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex >= 0) {
      const contextMessage: ProviderMessage = {
        role: "system",
        content: `Context from knowledge base:\n${collectionContext}`,
        toolCallId: null,
        toolCalls: null,
        threadId: null
      };
      return [
        ...messages.slice(0, lastUserIndex),
        contextMessage,
        ...messages.slice(lastUserIndex)
      ];
    }
    return messages;
  }

  /**
   * Round-trip a permission approval to the client and resolve with the
   * user's decision. Emits a `tool_approval_request`, then waits for the
   * matching `tool_approval_response` (resolved via {@link approvalBridge}).
   * A cancelled wait (stop) is treated as a denial.
   */
  private async requestToolApproval(
    threadId: string,
    request: ApprovalRequest
  ): Promise<ApprovalDecision> {
    const approvalId = `appr_${randomUUID()}`;
    await this.sendMessage({
      type: "tool_approval_request",
      thread_id: threadId,
      approval_id: approvalId,
      tool_name: request.toolName,
      category: request.category,
      message: request.message,
      args: request.args
    });
    try {
      // No timeout — the user may take a while; `stop` cancels via cancelAll.
      const response = await this.approvalBridge.createWaiter(approvalId, 0);
      const decision = response.decision;
      if (
        decision === "allow" ||
        decision === "allow_for_chat" ||
        decision === "deny"
      ) {
        return decision;
      }
      return "deny";
    } catch {
      // Cancelled (generation stopped) — treat as a denial.
      return "deny";
    }
  }

  /**
   * Execute a single node by type and return its output. Builds a one-node
   * graph and runs it through a fresh {@link WorkflowRunner}, then returns the
   * node's completed result. Backs the `run_node` chat tool.
   */
  private async runSingleNode(
    nodeType: string,
    inputs: Record<string, unknown>,
    userId: string
  ): Promise<unknown> {
    const jobId = randomUUID();
    const nodeId = "node_0";
    const rawGraph = {
      nodes: [{ id: nodeId, type: nodeType, data: inputs ?? {} }],
      edges: [] as Array<Record<string, unknown>>
    };

    let graph: HydratedGraphData;
    try {
      graph = await this.hydrateGraph(rawGraph);
    } catch (err) {
      return {
        error: `Failed to prepare node '${nodeType}': ${
          err instanceof Error ? err.message : String(err)
        }`
      };
    }

    if (this.beforeRunJob) {
      try {
        await this.beforeRunJob(graph);
      } catch (err) {
        return {
          error: `Node prerequisites failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        };
      }
    }

    const context = createRuntimeContext({
      jobId,
      workflowId: null,
      userId,
      workspaceDir: tmpdir(),
      assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
    });
    context.setResolveExecutor((node) => this.resolveExecutor(node));
    if (this.resolveNodeType) {
      const resolverObj =
        typeof this.resolveNodeType === "function"
          ? { resolveNodeType: this.resolveNodeType }
          : this.resolveNodeType;
      context.setResolveNodeType(
        (type) =>
          resolverObj.resolveNodeType(type) as Promise<{
            nodeType: string;
            propertyTypes?: Record<string, string>;
            outputs?: Record<string, string>;
            isDynamic?: boolean;
            descriptorDefaults?: Record<string, unknown>;
          } | null>
      );
    }

    const runner = new WorkflowRunner(jobId, {
      resolveExecutor: (node) =>
        this.resolveExecutor(
          node as { id: string; type: string; [key: string]: unknown }
        ),
      executionContext: context,
      validateNode: this.validateNode
    });

    const result = await runner.run({ job_id: jobId, params: {} }, graph);

    // Capture the node's completed result from the streamed updates.
    let nodeResult: unknown;
    while (context.hasMessages()) {
      const msg = context.popMessage() as Record<string, unknown> | undefined;
      if (
        msg &&
        msg.type === "node_update" &&
        msg.node_id === nodeId &&
        msg.status === "completed" &&
        msg.result != null
      ) {
        nodeResult = msg.result;
      }
    }

    if (result.status === "failed") {
      return { error: result.error ?? `Node '${nodeType}' failed` };
    }
    if (nodeResult === undefined) {
      // Fall back to the runner's collected outputs (e.g. Output nodes).
      return result.outputs ?? { status: result.status };
    }
    return this.processToolResult(nodeResult, context);
  }

  /**
   * Handle an incoming chat message.
   *
   * Mirrors Python's full 3-layer flow:
   *   handle_chat_message → handle_message_impl → process_messages
   *     → _run_processor + RegularChatProcessor.process()
   *
   * The processor sends messages to a queue. _run_processor reads them:
   *   - type === "message" → persist to DB AND forward to client
   *   - anything else → forward to client only
   *
   * RegularChatProcessor.process():
   *   1. Prepend system prompt if first message isn't system role
   *   2. while True: messages_to_send = chat_history + unprocessed_messages
   *   3. Stream chunks (type: "chunk") — forwarded to client (not persisted)
   *   4. On tool call: build assistant Message + tool result Message (type: "message")
   *      → persisted to DB AND forwarded to client
   *   5. If unprocessed_messages empty, break
   *   6. Send done chunk + final assistant Message
   */
  async handleChatMessage(
    data: Record<string, unknown>,
    requestSeq?: number
  ): Promise<void> {
    const messageWorkflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const threadId = await this.ensureThreadExists(
      typeof data.thread_id === "string" ? data.thread_id : undefined,
      messageWorkflowId
    );
    data.thread_id = threadId;

    // Apply defaults — matches Python's handle_chat_message
    if (!data.model) data.model = this.defaultModel;
    if (!data.provider) data.provider = this.defaultProvider;

    const providerId = data.provider as string;
    const model = data.model as string;
    const workflowId = messageWorkflowId;
    const userId = this.userId ?? "1";
    log.debug("Chat message", { threadId, model, provider: providerId });

    // Save user message to DB — matches Python's _save_message_to_db_async(data)
    await this.saveMessageToDb(data);

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    // Route to the workflow processor ONLY when the client explicitly opts in
    // via `workflow_target: "workflow"`. A bare `workflow_id` is context, not a
    // routing signal: the editor binds the open workflow so `ui_*` tools target
    // it, and that ambient id must not hijack the turn into running the
    // workflow as a chatbot. Genuine workflow-chatbot runs set `workflow_target`
    // (and carry `workflow_id`/`graph` for the processor to load/execute).
    const workflowTarget =
      typeof data.workflow_target === "string" ? data.workflow_target : null;
    if (workflowTarget === "workflow") {
      await this.handleWorkflowMessage(data, requestSeq);
      return;
    }

    // Route to media generation when the client requests a text-to-image or
    // text-to-video turn. The composer attaches a `media_generation` field
    // with mode + params; when mode is a media mode we invoke the provider's
    // textToImage / textToVideo instead of a regular LLM round and return an
    // assistant message containing MessageImageContent / MessageVideoContent.
    const mediaGeneration =
      data.media_generation && typeof data.media_generation === "object"
        ? (data.media_generation as Record<string, unknown>)
        : null;
    if (
      mediaGeneration &&
      typeof mediaGeneration.mode === "string" &&
      mediaGeneration.mode !== "chat"
    ) {
      await this.handleMediaGenerationMessage(
        data,
        mediaGeneration,
        requestSeq
      );
      return;
    }

    const provider = await this.resolveProvider(providerId, userId);

    // Permission mode for this turn. Governs whether gated tool calls run,
    // ask for approval, or are blocked. Defaults to "default".
    const permissionMode: PermissionMode =
      data.permission_mode === "plan" ||
      data.permission_mode === "auto" ||
      data.permission_mode === "default"
        ? data.permission_mode
        : "default";

    // Long-term memory mines the whole conversation, so it needs the full
    // history; the resume fast path below is skipped when it is enabled.
    const memoryEnabled =
      data.memory_enabled === true || data.memory_enabled === "true";

    // History load. Session-based providers (e.g. claude_agent) keep the
    // conversation upstream, so when a resumable session exists for this
    // provider+model we do NOT reload the whole thread: we probe a bounded
    // recent window, send only the turns since the session, and hand the
    // provider a `loadFullHistory` thunk it calls only if it must prime context
    // (resume failed / system prompt changed). Otherwise we load the full
    // history and use the standard slice-based resume. The DB column is the
    // source of truth; the provider also keeps an in-process cache.
    const systemChatMessage = (): ProviderMessage => ({
      role: "system",
      content: buildChatAgentSystemPrompt(permissionMode),
      toolCallId: null,
      toolCalls: null,
      threadId: null
    });
    const convertDbMessages = (rows: Message[]): ProviderMessage[] => {
      const out: ProviderMessage[] = [];
      for (const m of rows) {
        const pm = this.dbMessageToProviderMessage(m);
        if (pm) out.push(pm);
      }
      return out;
    };

    let chatHistory: ProviderMessage[];
    let priorSession: ProviderSession | null = null;
    // The provider calls this only on a priming fallback; null on the full path.
    let loadFullHistory: (() => Promise<ProviderMessage[]>) | null = null;
    // Absolute checkpoint to persist on the assistant message when the fast path
    // sent only a delta (so the stored value matches the full-load path); null
    // when the provider's own checkpoint is already absolute.
    let sessionCheckpointOverride: number | null = null;
    {
      const [recent] = await Message.paginate(threadId, {
        reverse: true,
        limit: SESSION_PROBE_WINDOW
      });
      const probeHasWholeThread = recent.length < SESSION_PROBE_WINDOW;
      // `recent` is newest-first. Walk to the most recent assistant carrying a
      // session token — that message is the resume boundary.
      let probeSession: ProviderSession | null = null;
      const sinceSessionNewestFirst: Message[] = [];
      for (const m of recent) {
        if (m.role === "assistant" && m.provider_session) {
          const s = m.provider_session;
          if (s.providerId === providerId && s.model === model) probeSession = s;
          break;
        }
        sinceSessionNewestFirst.push(m);
      }

      if (probeSession && !memoryEnabled) {
        // RESUME fast path: the SDK already holds the prior turns, so send only
        // the messages since the session — no full-thread load.
        const newTurns = convertDbMessages(sinceSessionNewestFirst.reverse());
        chatHistory = newTurns;
        // The single system message prepended below sits at index 0, so the new
        // turns begin at index 1 (the provider's relative resume checkpoint).
        priorSession = {
          providerId,
          model,
          token: probeSession.token,
          systemHash: probeSession.systemHash,
          checkpoint: 1
        };
        // Absolute position to persist: prior prefix + the prior assistant + the
        // new turns — identical to what the full-load path would store.
        sessionCheckpointOverride =
          probeSession.checkpoint + 1 + newTurns.length;
        loadFullHistory = async () => {
          const [rows] = await Message.paginate(threadId, { limit: 1000 });
          const full = convertDbMessages(rows);
          full.unshift(systemChatMessage());
          return full;
        };
      } else if (probeHasWholeThread) {
        // The whole thread fit in the probe window — reuse it, no second query.
        const rows = [...recent].reverse();
        chatHistory = convertDbMessages(rows);
        priorSession = lastMatchingProviderSession(rows, providerId, model);
      } else {
        // Long thread without a resumable session in the recent window: load it
        // all (a far-back session still resumes via the slice path).
        const [rows] = await Message.paginate(threadId, { limit: 1000 });
        chatHistory = convertDbMessages(rows);
        priorSession = lastMatchingProviderSession(rows, providerId, model);
      }
    }

    // Expose the read-only `run_search` fan-out primitive by default. A client
    // can opt out by sending `enable_read_only_search: false`.
    const enableReadOnlySearch = data.enable_read_only_search !== false;

    // Assemble the fixed, always-on toolbelt. There is no per-message tool
    // selection anymore — the agent reasons over the full toolbelt and the
    // permission gate (below) governs execution.
    registerBuiltinTools();
    const chatProviders = await this.getConfiguredProviders(userId);
    const rawToolbelt: Tool[] = [
      ...getBuiltinTools(),
      ...getAllMcpTools({
        registry: this.nodeRegistry,
        providers: chatProviders
      }),
      new ListCollectionsTool(),
      new QueryCollectionTool(),
      new RunNodeTool((nodeType, inputs) =>
        this.runSingleNode(nodeType, inputs, userId)
      )
    ];
    // De-duplicate by name (builtins / mcp / extras may overlap); first wins.
    const dedupedToolbelt: Tool[] = [];
    const seenToolNames = new Set<string>();
    for (const tool of rawToolbelt) {
      if (seenToolNames.has(tool.name)) continue;
      seenToolNames.add(tool.name);
      dedupedToolbelt.push(tool);
    }

    // Wrap the toolbelt in the permission gate. The wrapper is transparent
    // except for `process()`, so the chat loop AND any `run_subtask` child
    // loop inherit gating by simply calling `tool.process()`. The session
    // allow-set is shared per thread so "Allow for this chat" sticks.
    const sessionAllow =
      this.chatSessionAllow.get(threadId) ?? new Set<string>();
    this.chatSessionAllow.set(threadId, sessionAllow);
    const requestApproval = (
      request: ApprovalRequest
    ): Promise<ApprovalDecision> =>
      this.requestToolApproval(threadId, request);
    const baseTools = gateTools(dedupedToolbelt, {
      mode: permissionMode,
      sessionAllow,
      requestApproval
    });

    // Inject the recursive-decomposition primitive (ungated — it spawns a
    // child loop whose own tools are the gated `baseTools`). Child events
    // stream back tagged with `parent_tool_call_id` so the UI can nest cards.
    const serverTools: Tool[] = baseTools.slice();
    {
      const subtaskThreadId = threadId;
      const subtaskWorkflowId = workflowId;
      const forwardSubtaskMessage = async (msg: ProcessingMessage) => {
        const enriched: Record<string, unknown> = {
          ...(msg as unknown as Record<string, unknown>)
        };
        if (enriched.thread_id == null) enriched.thread_id = subtaskThreadId;
        if (enriched.workflow_id == null) enriched.workflow_id = subtaskWorkflowId;
        try {
          await this.sendMessage(enriched);
          // Tool calls inside a subtask only arrive here as transient
          // tool_call_update events; the chat UI needs a persistent assistant
          // message with tool_calls to render a ToolCallCard. Emit a synthetic
          // one so child tool calls show up as cards nested below the parent
          // run_subtask card.
          await this.emitSyntheticToolCallCard(enriched);
        } catch (err) {
          log.warn("Failed to forward subtask event", {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      };
      serverTools.unshift(
        new RunSubtaskTool({
          provider,
          model,
          parentTools: () => baseTools,
          forwardMessage: forwardSubtaskMessage
        })
      );

      // Read-only fan-out search (opt-in). Reuses the same forwarder and the
      // baseTools snapshot — RunSearchTool internally filters baseTools to its
      // read-only allowlist, so passing the full snapshot is correct.
      if (enableReadOnlySearch) {
        serverTools.unshift(
          new RunSearchTool({
            provider,
            model,
            parentTools: () => baseTools,
            forwardMessage: forwardSubtaskMessage
          })
        );
      }
    }

    const serverToolMap = new Map(serverTools.map((t) => [t.name, t]));
    log.info("Resolved server tools", {
      permissionMode,
      resolved: serverTools.map((t) => t.name)
    });

    // Build provider-format tool schemas from resolved Tool instances + client tools
    const providerToolSchemas: ProviderTool[] = serverTools.map((t) =>
      t.toProviderTool()
    );
    // Only include client tools (ui_*) when a workflow is active
    const clientToolNames = workflowId
      ? Object.keys(this.clientToolsManifest)
      : [];
    if (workflowId) {
      for (const [name, manifest] of Object.entries(this.clientToolsManifest)) {
        // The frontend manifest carries the JSON schema under `parameters`
        // (FrontendToolRegistry.getManifest); accept `inputSchema` too for any
        // client that uses the provider-tool field name.
        const schema =
          typeof manifest.parameters === "object"
            ? (manifest.parameters as Record<string, unknown>)
            : typeof manifest.inputSchema === "object"
              ? (manifest.inputSchema as Record<string, unknown>)
              : undefined;
        providerToolSchemas.push({
          name,
          description:
            typeof manifest.description === "string"
              ? manifest.description
              : undefined,
          inputSchema: schema
        });
      }
    }
    log.info("Provider tool schemas", {
      serverToolCount: serverTools.length,
      clientToolCount: clientToolNames.length,
      clientTools: clientToolNames,
      totalSchemas: providerToolSchemas.length,
      schemaNames: providerToolSchemas.map((t) => t.name)
    });

    // Create a processing context for tool execution
    const chatWorkspaceDir =
      workflowId && this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : tmpdir();
    const ctx = createRuntimeContext({
      jobId: randomUUID(),
      threadId: threadId || null,
      userId,
      workspaceDir: chatWorkspaceDir
    });

    // Prepend system prompt if first message isn't system role — matches Python
    if (chatHistory.length === 0 || chatHistory[0].role !== "system") {
      chatHistory.unshift({
        role: "system",
        content: buildChatAgentSystemPrompt(permissionMode),
        toolCallId: null,
        toolCalls: null,
        threadId: null
      });
    }

    // The agent now discovers and queries collections itself via the
    // list_collections / query_collection tools, so there is no client-driven
    // RAG pre-query here.
    const userContent = this.extractTextContent(data.content);

    // Resolve long-term memory if the renderer opted in for this turn. The
    // helper is default-off; we only build it when the wire flag is true so
    // a missing/false flag matches the legacy behaviour exactly. Failures
    // are logged and swallowed — a memory hiccup must not break the turn.
    // (`memoryEnabled` is computed earlier, before the history load.)
    let longTermMemory: LongTermMemory | null = null;
    if (memoryEnabled) {
      try {
        longTermMemory = await createDefaultLongTermMemory({
          userId,
          namespace: "chat",
          workspaceId: threadId || undefined,
          extractionProvider: provider,
          extractionModel: model,
          enabled: true
        });
      } catch (err) {
        log.warn("Long-term memory init failed for chat turn", {
          threadId,
          error: err instanceof Error ? err.message : String(err)
        });
        longTermMemory = null;
      }
    }
    let memoryContext = "";
    if (longTermMemory && longTermMemory.isReady() && userContent) {
      try {
        const recalled = await longTermMemory.recall(userContent);
        memoryContext = formatMemoryForPrompt(recalled);
      } catch (err) {
        log.warn("Long-term memory recall failed", {
          threadId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Final assistant text, for the memory snapshot below. Updated as the
    // provider emits assistant messages; the last one wins.
    let content = "";
    // The session token to persist onto the assistant message. Seeds from the
    // prior turn's token (so a session-based provider resumes) and is refreshed
    // whenever the provider emits a new ProviderSessionUpdate this turn.
    let capturedSession: ProviderSession | null = priorSession;
    // What to persist onto the assistant message: the provider's token, but with
    // the absolute checkpoint when the fast path sent only a delta (the
    // provider's emitted checkpoint is relative to the trimmed view).
    const sessionForPersist = (): ProviderSession | null =>
      sessionCheckpointOverride != null && capturedSession
        ? { ...capturedSession, checkpoint: sessionCheckpointOverride }
        : capturedSession;

    // Cap on tool-calling rounds before the loop stops.
    const MAX_TOOL_ROUNDS = 10;
    const useTools = providerToolSchemas.length > 0;

    // The wire messages: chat history + the ephemeral memory block (which goes
    // to the provider but is never persisted). The provider's generateLoop owns
    // the tool-calling rounds and message assembly from here.
    let messagesToSend = [...chatHistory];
    if (memoryContext) {
      messagesToSend = this.addCollectionContext(messagesToSend, memoryContext);
      memoryContext = "";
    }

    // Expand any `asset://<id>.<ext>` references the composer or a prior turn
    // attached and dereference the URIs to data the provider can consume.
    // Image / audio mentions typed inline in a text part get split into proper
    // blocks first (mirroring what the workflow agent node does in
    // `buildUserMessage`), then every block with an `asset://` / storage URI is
    // resolved to a data URI. Text-document mentions are inlined as their
    // decoded contents. Without this step the provider would see literal
    // `asset://…` text and never look at the referenced media.
    messagesToSend = await ctx.resolveMessageMediaUris(messagesToSend);

    // Run one tool call and return the result to feed back to the model. Owns
    // server/client tool routing, side effects (client round-trips via the
    // ToolBridge), and asset materialization; the provider's loop orchestrates.
    // Image results (e.g. ui_3d_capture_view) return MessageContent blocks so
    // vision providers can see them; everything else returns result text.
    const executeTool = async (
      toolCall: ProviderToolCall
    ): Promise<string | MessageContent[]> => {
      let toolResult: unknown;
      const serverTool = serverToolMap.get(toolCall.name);
      if (serverTool) {
        try {
          toolResult = await serverTool.process(ctx, toolCall.args);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log.error("Tool execution failed", {
            tool: toolCall.name,
            error: errMsg
          });
          toolResult = { error: errMsg };
        }
      } else if (this.clientToolsManifest[toolCall.name]) {
        // Client-side tool — round-trip through the UI via the ToolBridge.
        await this.sendMessage({
          type: "tool_call",
          thread_id: threadId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        });
        const clientResult = await this.toolBridge.createWaiter(
          toolCall.id,
          300_000
        );
        toolResult =
          clientResult.result ?? clientResult.content ?? clientResult;
      } else {
        toolResult = { error: `Tool "${toolCall.name}" not available` };
      }

      // view_image is the ONE mechanism that puts pixels into the model's
      // context: its image_content rides the tool message so the model sees the
      // image this turn. (The chat loop builds tool messages inside
      // provider.generateLoop, so the tool return value is the only hook.)
      if (toolCall.name === "view_image") {
        const injected = extractInjectableImages(toolResult);
        if (injected) {
          return [
            { type: "text", text: injected.text },
            ...injected.images
          ];
        }
      }

      // Every other tool that produced pixels (timeline frames, 3D capture, …)
      // gets them persisted as temp image assets; the model receives only a
      // handle and calls view_image when it wants to look.
      toolResult = await this.materializeToolResultImages(toolResult, ctx);

      const processed = await this.processToolResult(toolResult, ctx);
      return typeof processed === "string"
        ? processed
        : JSON.stringify(processed);
    };

    // Tool name by call id, so persisted tool messages keep their name (the
    // provider Message carries only the id).
    const toolNames = new Map<string, string>();

    try {
      for await (const item of provider.generateLoop({
        messages: messagesToSend,
        model,
        tools: useTools ? providerToolSchemas : undefined,
        threadId,
        providerSession: capturedSession,
        loadFullHistory: loadFullHistory ?? undefined,
        executeTool: useTools ? executeTool : undefined,
        maxIterations: MAX_TOOL_ROUNDS
      })) {
        if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
          return;

        if (isProviderSessionUpdate(item)) {
          // Internal continuity token — capture for persistence, never wired.
          capturedSession = item.session;
          continue;
        }

        if (isProviderMessageEvent(item)) {
          const m = item.message;
          if (m.role === "assistant") {
            if (typeof m.content === "string") content = m.content;
            const toolCalls = Array.isArray(m.toolCalls)
              ? m.toolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  args: tc.args,
                  result: null
                }))
              : null;
            const assistantMsgData: Record<string, unknown> = {
              type: "message",
              role: "assistant",
              content: m.content ?? null,
              ...(toolCalls ? { tool_calls: toolCalls } : {}),
              thread_id: threadId,
              workflow_id: workflowId,
              provider: providerId,
              model,
              provider_session: sessionForPersist()
            };
            await this.saveMessageToDb(assistantMsgData);
            await this.sendMessage(assistantMsgData);
          } else if (m.role === "tool") {
            // Image tool results carry MessageContent blocks; persist/echo only
            // their note text so chat history stays light (the base64 rode the
            // in-flight provider message, never the DB).
            const toolContent = Array.isArray(m.content)
              ? this.toolResultDisplayText(m.content)
              : typeof m.content === "string"
                ? m.content
                : "";
            const toolMsgData: Record<string, unknown> = {
              type: "message",
              role: "tool",
              tool_call_id: m.toolCallId ?? null,
              name: m.toolCallId ? toolNames.get(m.toolCallId) ?? null : null,
              content: toolContent,
              thread_id: threadId,
              workflow_id: workflowId,
              provider: providerId,
              model
            };
            await this.saveMessageToDb(toolMsgData);
            await this.sendMessage(toolMsgData);
          }
          continue;
        }

        if ("type" in item && (item as Chunk).type === "chunk") {
          // --- Text chunk --- forward to client (not persisted)
          const chunk = item as Chunk;
          if (!chunk.thread_id) chunk.thread_id = threadId;
          await this.sendMessage({ ...chunk });
        } else if ("name" in item && "id" in item) {
          // --- Tool call from the provider (informational; executed by the
          // loop via executeTool) ---
          const tc = item as ProviderToolCall;
          toolNames.set(tc.id, tc.name);
          log.info("Tool call", { tool: tc.name, args: tc.args });
        }
      }

      // Log provider call for cost tracking — matches Python's _log_provider_call()
      await this._logProviderCall(
        userId,
        provider,
        providerId,
        model,
        workflowId
      );

      // Signal completion — matches Python's done chunk.
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });

      // Mine the completed turn for new long-term memories. Fire-and-forget
      // so a slow extraction call never blocks the renderer; failures are
      // already logged inside rememberConversation.
      if (longTermMemory && longTermMemory.isReady() && content) {
        const snapshot: ProviderMessage[] = [
          ...chatHistory,
          {
            role: "assistant",
            content,
            toolCalls: null,
            toolCallId: null,
            threadId
          }
        ];
        void longTermMemory
          .rememberConversation(snapshot, { source: "chat" })
          .catch(() => {
            /* already logged inside rememberConversation */
          });
      }

      log.debug("Chat complete", { threadId, chars: content.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Chat processing error", { threadId, error: errMsg });

      // Detect error type — matches Python's separate ConnectError / HTTPStatusError handlers
      let errorType = "error";
      let statusCode: number | undefined;
      let formattedMsg = errMsg;

      // Connection errors (ECONNREFUSED, ENOTFOUND, etc.)
      if (
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("ENOTFOUND") ||
        errMsg.includes("fetch failed") ||
        errMsg.includes("nodename nor servname")
      ) {
        errorType = "connection_error";
        if (
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("nodename nor servname")
        ) {
          formattedMsg =
            "Connection error: Unable to resolve hostname. Please check your network connection and API endpoint configuration.";
        } else {
          formattedMsg = `Connection error: ${errMsg}`;
        }
      }
      // HTTP status errors — check for status code in error
      else if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number }).status;
        errorType = "http_status_error";
        statusCode = status;

        // Try to extract error message from response body
        let bodyMsg: string | null = null;
        try {
          if ("body" in err || "response" in err) {
            const body = (err as any).body ?? (err as any).response;
            if (body && typeof body === "object" && "error" in body) {
              const errorDetail = body.error;
              if (
                typeof errorDetail === "object" &&
                errorDetail &&
                "message" in errorDetail
              ) {
                bodyMsg = String(errorDetail.message);
              }
            }
          }
        } catch {
          // Intentional: best-effort extraction of error message from response body
        }

        if (bodyMsg) {
          formattedMsg = bodyMsg;
        } else if (status === 400) {
          formattedMsg = `Bad request: ${errMsg}`;
        } else if (status === 401) {
          formattedMsg = "Authentication failed: Invalid API key or token";
        } else if (status === 403) {
          formattedMsg =
            "Access forbidden: You don't have permission for this resource";
        } else if (status === 404) {
          formattedMsg = "Not found: The requested resource was not found";
        } else if (status === 429) {
          formattedMsg = "Rate limited: Too many requests, please slow down";
        } else if (status >= 500) {
          formattedMsg = `Server error (${status}): The service is temporarily unavailable`;
        } else {
          formattedMsg = `HTTP error (${status}): ${errMsg}`;
        }
      }

      await this.sendMessage({
        type: "error",
        message: formattedMsg,
        error_type: errorType,
        ...(statusCode !== undefined ? { status_code: statusCode } : {}),
        thread_id: threadId,
        workflow_id: workflowId
      });
      // Signal completion even on error — matches Python
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });
      const errorMsgData: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content:
          errorType === "connection_error"
            ? `I encountered a connection error: ${formattedMsg}. Please check your network connection and try again.`
            : errorType === "http_status_error"
              ? `I encountered an API error (HTTP ${statusCode}): ${formattedMsg}`
              : `I encountered an error: ${formattedMsg}`,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };
      await this.saveMessageToDb(errorMsgData);
      await this.sendMessage(errorMsgData);
    }
  }

  /** Persist and accumulate provider cost from a completed node_update. */
  private async _handleNodeProviderCost(
    active: ActiveJob,
    outbound: Record<string, unknown>,
    nodeType: string
  ): Promise<void> {
    if (
      outbound.type !== "node_update" ||
      outbound.status !== "completed" ||
      outbound.provider_cost == null
    ) {
      return;
    }
    const providerCost = outbound.provider_cost as ProviderCost;
    await this._persistNodeProviderCost(
      providerCost,
      String(outbound.node_id ?? ""),
      nodeType,
      active.workflowId
    );
    const amount = (providerCost as { amount?: unknown }).amount;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      active.providerCostTotal = (active.providerCostTotal ?? 0) + amount;
    }
  }

  /**
   * Persist a node-reported provider cost into the prediction ledger.
   * Covers generative nodes (FAL, Kie, …) that call
   * `context.setProviderCost()`. Best-effort: never throws.
   */
  private async _persistNodeProviderCost(
    cost: ProviderCost,
    nodeId: string,
    nodeType: string,
    workflowId: string | null
  ): Promise<void> {
    if (typeof cost.amount !== "number" || !Number.isFinite(cost.amount)) {
      return;
    }
    try {
      const prediction = await Prediction.create<Prediction>({
        user_id: this.userId ?? "1",
        provider: cost.provider,
        model: cost.model ?? nodeType,
        node_type: nodeType,
        cost: cost.amount,
        currency: cost.currency ?? cost.unit ?? null,
        billing_unit: cost.billing_unit ?? null,
        quantity: cost.quantity ?? null,
        unit_price: cost.unit_price ?? null,
        provider_request_id: cost.provider_request_id ?? null,
        workflow_id: workflowId,
        node_id: nodeId,
        status: "completed"
      });
      log.debug("Persisted node provider cost", {
        provider: cost.provider,
        model: cost.model ?? nodeType,
        cost: cost.amount
      });
      // The amount above is an estimate for providers that bill out-of-band.
      // If the provider exposes a request-keyed billing API, refine it to the
      // actual charge in the background (best-effort, never blocks the run).
      if (cost.provider_request_id) {
        void this._reconcileProviderCost(
          prediction,
          cost.provider,
          cost.provider_request_id,
          cost.model ?? null
        );
      }
    } catch (err) {
      log.warn("Failed to persist node provider cost", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Replace an estimated provider cost with the provider's actual billed
   * amount, looked up by request id. Runs detached; swallows all errors and
   * leaves the estimate in place when no actual is available.
   */
  private async _reconcileProviderCost(
    prediction: Prediction,
    provider: string,
    requestId: string,
    endpointId: string | null
  ): Promise<void> {
    const reconciler = getCostReconciler(provider);
    if (!reconciler) return;
    try {
      const apiKey = await getSecret(
        `${provider.toUpperCase()}_API_KEY`,
        this.userId ?? undefined
      );
      const actual = await reconciler({
        requestId,
        endpointId,
        secrets: apiKey ? { [`${provider.toUpperCase()}_API_KEY`]: apiKey } : {}
      });
      if (!actual) return;
      await prediction.update({
        cost: actual.cost,
        currency: actual.currency ?? prediction.currency,
        quantity: actual.quantity ?? prediction.quantity,
        unit_price: actual.unit_price ?? prediction.unit_price
      });
      log.debug("Reconciled provider cost to actual", {
        provider,
        requestId,
        cost: actual.cost
      });
    } catch (err) {
      log.warn("Failed to reconcile provider cost", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Log a provider call for cost tracking — mirrors Python's _log_provider_call().
   * Best-effort: never throws, logs warnings on failure.
   */
  private async _logProviderCall(
    userId: string,
    provider: BaseProvider,
    providerId: string,
    model: string,
    workflowId: string | null
  ): Promise<void> {
    if (!providerId || !model) {
      log.warn("Cannot log provider call: missing provider or model");
      return;
    }
    try {
      const cost = provider.cost;
      await Prediction.create({
        user_id: userId,
        provider: providerId,
        model,
        cost,
        workflow_id: workflowId,
        status: "completed",
        node_id: ""
      });
      log.debug("Logged provider call", { provider: providerId, model, cost });
    } catch (err) {
      if (err instanceof TypeError || err instanceof ReferenceError) {
        log.warn("Failed to log provider call due to invalid data", {
          error: err instanceof Error ? err.message : String(err)
        });
      } else {
        log.error("Unexpected error logging provider call", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /**
   * Detect message input node names from a workflow graph.
   * Mirrors Python's WorkflowMessageProcessor._detect_message_input_names().
   *
   * Scans graph nodes for types ending in .MessageInput / .MessageListInput
   * and returns their data.name values.
   */
  private detectMessageInputNames(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: unknown[];
  }): { messageName: string | null; messagesName: string | null } {
    let messageName: string | null = null;
    let messagesName: string | null = null;

    for (const node of graph.nodes) {
      const nodeType = typeof node.type === "string" ? node.type : "";
      const data =
        typeof node.data === "object" && node.data !== null
          ? (node.data as Record<string, unknown>)
          : {};
      const nodeName = typeof data.name === "string" ? data.name.trim() : "";
      if (!nodeName) continue;

      if (
        messageName === null &&
        (nodeType === "nodetool.input.MessageInput" ||
          nodeType.endsWith(".MessageInput"))
      ) {
        messageName = nodeName;
      }
      if (
        messagesName === null &&
        (nodeType === "nodetool.input.MessageListInput" ||
          nodeType.endsWith(".MessageListInput"))
      ) {
        messagesName = nodeName;
      }
    }

    return { messageName, messagesName };
  }

  /**
   * Convert workflow result dict into a response message with typed content.
   * Mirrors Python's WorkflowMessageProcessor._create_response_message().
   *
   * Converts outputs to MessageContent items:
   *  - string → { type: "text", text }
   *  - list → { type: "text", text: joined }
   *  - dict with type "image"/"video"/"audio" → media content
   *  - other → { type: "text", text: stringified }
   */
  private createWorkflowResponseContent(
    result: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    const content: Array<Record<string, unknown>> = [];

    for (const [, value] of Object.entries(result)) {
      if (value === null || value === undefined) continue;

      if (typeof value === "string") {
        content.push({ type: "text", text: value });
      } else if (Array.isArray(value)) {
        content.push({ type: "text", text: value.map(String).join(" ") });
      } else if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const assetType = typeof obj.type === "string" ? obj.type : "";
        if (assetType === "image") {
          content.push({
            type: "image",
            image: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else if (assetType === "video") {
          content.push({
            type: "video",
            video: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else if (assetType === "audio") {
          content.push({
            type: "audio",
            audio: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
          });
        } else {
          content.push({ type: "text", text: JSON.stringify(obj) });
        }
      } else {
        content.push({ type: "text", text: String(value) });
      }
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "Workflow completed successfully." });
    }

    return content;
  }

  /**
   * Handle a chat message that targets a workflow.
   *
   * Mirrors Python's process_messages_for_workflow → WorkflowMessageProcessor/
   * ChatWorkflowMessageProcessor flow:
   *   1. Load workflow from DB
   *   2. Detect message input node names from graph
   *   3. Prepare params (serialized message + history)
   *   4. Run workflow via WorkflowRunner
   *   5. Stream events (job_update, node_update, output_update)
   *   6. Collect output_update results
   *   7. Send done chunk + response message with typed content
   */
  /**
   * Handle a chat_message with a `media_generation` payload by invoking the
   * selected provider's textToImage / textToVideo API, storing the resulting
   * asset(s), and returning them to the client as an assistant `Message`
   * whose `content` is an array of `MessageImageContent` / `MessageVideoContent`
   * blocks.
   *
   * The generated bytes are persisted via `ctx.storage.store()` so each
   * output receives a stable URI the client can resolve as a server asset.
   * The `media_generation` echo on the assistant message lets the UI render
   * the generation header (model, variation count, resolution, etc.) in the
   * conversation stream.
   */
  private async handleMediaGenerationMessage(
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    requestSeq?: number
  ): Promise<void> {
    const threadId =
      typeof data.thread_id === "string" ? data.thread_id : "";
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const userId = this.userId ?? "1";
    const mode = String(mediaGeneration.mode ?? "");
    const providerId = String(
      mediaGeneration.provider ?? data.provider ?? this.defaultProvider
    );
    const modelId = String(
      mediaGeneration.model ?? data.model ?? this.defaultModel
    );
    const prompt = this.extractTextContent(data.content);

    log.info("Media generation", {
      threadId,
      mode,
      provider: providerId,
      model: modelId,
      promptLen: prompt.length
    });

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    if (!modelId || modelId === "undefined") {
      await this.sendMessage({
        type: "error",
        message: `Please select a ${mode} model before generating`,
        thread_id: threadId
      });
      return;
    }

    if (!prompt) {
      await this.sendMessage({
        type: "error",
        message: "Please enter a prompt",
        thread_id: threadId
      });
      return;
    }

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    const provider = await this.resolveProvider(providerId, userId);
    // Wire up progress forwarding so provider.emitMessage() reaches the client.
    provider.setMessageEmitter((msg) =>
      void this.sendMessage(msg as Record<string, unknown>)
    );

    // Store generated media as a proper Asset record and return the
    // asset ID.  The DB message stores only `asset_id` — URLs are
    // resolved at serve time by resolveContentUrls / sendMessage.
    const storeMediaAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const asset = new Asset({
        user_id: userId,
        workflow_id: workflowId ?? null,
        name: `${mode}_${Date.now()}`,
        content_type: contentType,
        parent_id: null
      });
      const fileName = `${asset.id}.${ext}`;
      await storeAssetWithThumbnail(asset.id, fileName, bytes, contentType);
      asset.size = bytes.length;
      await asset.save();
      return asset.id;
    };

    try {
      if (mode === "image") {
        const variations = Math.max(
          1,
          Math.min(Number(mediaGeneration.variations ?? 1), 8)
        );
        const width =
          typeof mediaGeneration.width === "number"
            ? mediaGeneration.width
            : undefined;
        const height =
          typeof mediaGeneration.height === "number"
            ? mediaGeneration.height
            : undefined;
        const imageModel: ProviderImageModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: TextToImageParams = {
          model: imageModel,
          prompt,
          width,
          height
        };

        // Surface a progress chunk so the UI can show the request flight
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
          return;
        const imageBytesList = await provider.textToImages(params, variations);
        const imageContents: Array<Record<string, unknown>> = [];
        for (const bytes of imageBytesList) {
          const assetId = await storeMediaAsset(bytes, "image/png", "png");
          imageContents.push({
            type: "image_url",
            image: { type: "image", asset_id: assetId, mimeType: "image/png" }
          });
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: imageContents,
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "video") {
        const aspectRatio =
          typeof mediaGeneration.aspect_ratio === "string"
            ? (mediaGeneration.aspect_ratio as string)
            : null;
        const resolution =
          typeof mediaGeneration.resolution === "string"
            ? (mediaGeneration.resolution as string)
            : null;
        const duration =
          typeof mediaGeneration.duration === "number"
            ? (mediaGeneration.duration as number)
            : null;
        const videoModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        // If the user referenced/attached an image, they want it animated:
        // route to image-to-video so the image actually reaches the provider.
        // Many "video" models (e.g. fal-ai/stable-video) in fact require an
        // image and reject a text-only request with an opaque 422.
        const sourceBytes = await this.resolveSourceImageBytes(
          data,
          mediaGeneration,
          userId
        );
        let bytes: Uint8Array;
        if (sourceBytes && sourceBytes.length > 0) {
          const i2vParams: ImageToVideoParams = {
            model: videoModel,
            prompt,
            aspectRatio,
            resolution,
            durationSeconds: duration,
            numInferenceSteps: null
          };
          bytes = await provider.imageToVideo([sourceBytes], i2vParams);
        } else {
          const params: TextToVideoParams = {
            model: videoModel,
            prompt,
            aspectRatio,
            resolution,
            durationSeconds: duration
          };
          bytes = await provider.textToVideo(params);
        }
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration: duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "audio") {
        const voice =
          typeof mediaGeneration.voice === "string"
            ? (mediaGeneration.voice as string)
            : undefined;
        const speed =
          typeof mediaGeneration.speed === "number"
            ? (mediaGeneration.speed as number)
            : 1.0;
        const requestedFormatRaw =
          typeof mediaGeneration.audio_format === "string"
            ? (mediaGeneration.audio_format as string).toLowerCase()
            : null;
        const supportedFormats = new Set([
          "mp3",
          "wav",
          "pcm",
          "opus",
          "flac",
          "aac"
        ]);
        const requestedFormat =
          requestedFormatRaw && supportedFormats.has(requestedFormatRaw)
            ? requestedFormatRaw
            : null;
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        let assetId: string;
        let audioMimeType: string;

        // Some providers (e.g. HuggingFace, OpenAI) can return fully-encoded
        // audio. Prefer that path when available and honor the requested
        // container when the provider supports it.
        const encoded = await provider.textToSpeechEncoded({
          text: prompt,
          model: modelId,
          voice,
          speed,
          audioFormat: requestedFormat ?? undefined
        });

        if (encoded) {
          const mimeToExt: Record<string, string> = {
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/ogg": "ogg",
            "audio/flac": "flac",
            "audio/aac": "aac"
          };
          const ext = mimeToExt[encoded.mimeType] ?? "flac";
          if (
            requestedFormat &&
            requestedFormat !== ext &&
            requestedFormat !== "pcm"
          ) {
            log.warn(
              "Requested audio_format not supported by provider; returning native format",
              { providerId, modelId, requestedFormat, returnedMime: encoded.mimeType }
            );
          }
          assetId = await storeMediaAsset(encoded.data, encoded.mimeType, ext);
          audioMimeType = encoded.mimeType;
        } else {
          // Streaming PCM path (OpenAI, Gemini, etc.)
          const pcmChunks: Uint8Array[] = [];
          let totalBytes = 0;
          let chunkSampleRate = 24000;
          for await (const chunk of provider.textToSpeech({
            text: prompt,
            model: modelId,
            voice,
            speed,
            audioFormat: requestedFormat ?? undefined
          })) {
            if (
              requestSeq !== undefined &&
              requestSeq !== this.chatRequestSeq
            )
              return;
            if (chunk?.samples) {
              if (chunk.sampleRate) chunkSampleRate = chunk.sampleRate;
              const view = new Uint8Array(
                chunk.samples.buffer,
                chunk.samples.byteOffset,
                chunk.samples.byteLength
              );
              const copy = new Uint8Array(view);
              pcmChunks.push(copy);
              totalBytes += copy.byteLength;
            }
          }
          const merged = new Uint8Array(totalBytes);
          let off = 0;
          for (const c of pcmChunks) {
            merged.set(c, off);
            off += c.byteLength;
          }

          if (requestedFormat === "pcm") {
            // Return raw PCM Int16 bytes (no container).
            assetId = await storeMediaAsset(merged, "audio/pcm", "pcm");
            audioMimeType = "audio/pcm";
          } else {
            if (
              requestedFormat &&
              requestedFormat !== "wav" &&
              requestedFormat !== "pcm"
            ) {
              log.warn(
                "Requested audio_format cannot be produced from streaming PCM; falling back to WAV",
                { providerId, modelId, requestedFormat }
              );
            }
            // Wrap raw PCM Int16 in a WAV container so browsers can play it.
            const sampleRate = chunkSampleRate;
            const numChannels = 1;
            const bitsPerSample = 16;
            const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
            const blockAlign = numChannels * (bitsPerSample / 8);
            const wavHeader = new ArrayBuffer(44);
            const dv = new DataView(wavHeader);
            const writeStr = (pos: number, str: string) => {
              for (let i = 0; i < str.length; i++)
                dv.setUint8(pos + i, str.charCodeAt(i));
            };
            writeStr(0, "RIFF");
            dv.setUint32(4, 36 + merged.byteLength, true);
            writeStr(8, "WAVE");
            writeStr(12, "fmt ");
            dv.setUint32(16, 16, true);
            dv.setUint16(20, 1, true);
            dv.setUint16(22, numChannels, true);
            dv.setUint32(24, sampleRate, true);
            dv.setUint32(28, byteRate, true);
            dv.setUint16(32, blockAlign, true);
            dv.setUint16(34, bitsPerSample, true);
            writeStr(36, "data");
            dv.setUint32(40, merged.byteLength, true);

            const wav = new Uint8Array(44 + merged.byteLength);
            wav.set(new Uint8Array(wavHeader), 0);
            wav.set(merged, 44);

            assetId = await storeMediaAsset(wav, "audio/wav", "wav");
            audioMimeType = "audio/wav";
          }
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "audio",
              audio: {
                type: "audio",
                asset_id: assetId,
                mimeType: audioMimeType
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      if (mode === "image_edit" || mode === "image_to_video") {
        // Resolve the source image from either the message content (most
        // common path: user dropped an image into the composer) or from the
        // explicit `source_asset_id` echo on the media_generation payload.
        const sourceBytes = await this.resolveSourceImageBytes(
          data,
          mediaGeneration,
          userId
        );
        // A zero-length buffer (e.g. a storage read that resolved but came
        // back empty) is truthy — without the length check it sails past this
        // guard, then silently drops out of `attachAssets`'s image field
        // downstream, so fal gets a request with no image at all and rejects
        // it with an opaque 422 instead of the friendly error below.
        if (!sourceBytes || sourceBytes.length === 0) {
          await this.sendMessage({
            type: "error",
            message:
              "A source image is required — drop or attach an image first",
            thread_id: threadId
          });
          return;
        }

        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        if (mode === "image_edit") {
          const variations = Math.max(
            1,
            Math.min(Number(mediaGeneration.variations ?? 1), 8)
          );
          const targetWidth =
            typeof mediaGeneration.width === "number"
              ? (mediaGeneration.width as number)
              : undefined;
          const targetHeight =
            typeof mediaGeneration.height === "number"
              ? (mediaGeneration.height as number)
              : undefined;
          const strength =
            typeof mediaGeneration.strength === "number"
              ? (mediaGeneration.strength as number)
              : undefined;
          const numInferenceSteps =
            typeof mediaGeneration.num_inference_steps === "number"
              ? (mediaGeneration.num_inference_steps as number)
              : undefined;
          const editModel: ProviderImageModel = {
            id: modelId,
            name: modelId,
            provider: providerId
          };
          const params: ImageToImageParams = {
            model: editModel,
            prompt,
            targetWidth: targetWidth ?? null,
            targetHeight: targetHeight ?? null,
            strength: strength ?? null,
            numInferenceSteps: numInferenceSteps ?? null
          };
          if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
            return;
          const imageBytesList = await provider.imageToImages(
            [sourceBytes],
            params,
            variations
          );
          const imageContents: Array<Record<string, unknown>> = [];
          for (const bytes of imageBytesList) {
            const assetId = await storeMediaAsset(bytes, "image/png", "png");
            imageContents.push({
              type: "image_url",
              image: {
                type: "image",
                asset_id: assetId,
                mimeType: "image/png"
              }
            });
          }
          await this.sendMessage({
            type: "chunk",
            thread_id: threadId,
            content: "",
            done: true
          });
          const assistantMsgData: Record<string, unknown> = {
            type: "message",
            role: "assistant",
            content: imageContents,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model: modelId,
            media_generation: mediaGeneration
          };
          await this.saveMessageToDb(assistantMsgData);
          await this.sendMessage(assistantMsgData);
          return;
        }

        // image_to_video
        const aspectRatio =
          typeof mediaGeneration.aspect_ratio === "string"
            ? (mediaGeneration.aspect_ratio as string)
            : null;
        const resolution =
          typeof mediaGeneration.resolution === "string"
            ? (mediaGeneration.resolution as string)
            : null;
        const duration =
          typeof mediaGeneration.duration === "number"
            ? (mediaGeneration.duration as number)
            : null;
        const numInferenceSteps =
          typeof mediaGeneration.num_inference_steps === "number"
            ? (mediaGeneration.num_inference_steps as number)
            : null;
        const i2vModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: ImageToVideoParams = {
          model: i2vModel,
          prompt,
          aspectRatio,
          resolution,
          durationSeconds: duration,
          numInferenceSteps
        };
        const bytes = await provider.imageToVideo([sourceBytes], params);
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");
        await this.sendMessage({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });
        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        await this.saveMessageToDb(assistantMsgData);
        await this.sendMessage(assistantMsgData);
        return;
      }

      // Modes not yet implemented on the backend — fall back to an informative
      // error so the client can render the unsupported state cleanly.
      await this.sendMessage({
        type: "error",
        message: `Media generation mode "${mode}" is not yet supported`,
        thread_id: threadId
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Media generation error", { threadId, mode, error: errMsg });
      await this.sendMessage({
        type: "error",
        message: `Generation failed: ${errMsg}`,
        thread_id: threadId
      });
    }
  }

  /**
   * Resolve the source image bytes for image-edit / image-to-video calls.
   * Searches in priority order:
   *   1. `media_generation.source_asset_id`  → load from Asset storage
   *   2. The first `image_url` content block on the user message
   *      (supports asset_id, http(s) uri, and inline data:base64 payloads)
   * Returns `null` when no usable source image can be found.
   */
  private async resolveSourceImageBytes(
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    userId: string
  ): Promise<Uint8Array | null> {
    const tryLoadAsset = async (
      assetId: string
    ): Promise<Uint8Array | null> => {
      if (!assetId) return null;
      try {
        const asset = await Asset.find(userId, assetId);
        if (!asset) return null;
        const ext = (asset.content_type ?? "image/png").split("/")[1] ?? "png";
        const adapter = getAssetAdapter();
        return await adapter.retrieve(adapter.uriForKey(`${assetId}.${ext}`));
      } catch (err) {
        log.warn("resolveSourceImageBytes: asset load failed", {
          assetId,
          error: err instanceof Error ? err.message : String(err)
        });
        return null;
      }
    };

    const explicitId =
      typeof mediaGeneration.source_asset_id === "string"
        ? (mediaGeneration.source_asset_id as string)
        : null;
    if (explicitId) {
      const fromAsset = await tryLoadAsset(explicitId);
      if (fromAsset && fromAsset.length > 0) return fromAsset;
    }

    const content = data.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== "object") continue;
        const block = c as Record<string, unknown>;
        if (block.type !== "image_url") continue;
        const image = (block.image ?? {}) as Record<string, unknown>;
        const assetId =
          typeof image.asset_id === "string"
            ? (image.asset_id as string)
            : null;
        if (assetId) {
          const bytes = await tryLoadAsset(assetId);
          if (bytes && bytes.length > 0) return bytes;
        }
        const uri =
          typeof image.uri === "string" ? (image.uri as string) : null;
        if (uri) {
          if (uri.startsWith("asset://")) {
            // `@`-mentioned or library-dragged asset: `asset://<id>.<ext>`.
            const withoutScheme = uri.slice("asset://".length);
            const dotIdx = withoutScheme.lastIndexOf(".");
            const mentionedId =
              dotIdx > -1 ? withoutScheme.slice(0, dotIdx) : withoutScheme;
            const bytes = await tryLoadAsset(mentionedId);
            if (bytes && bytes.length > 0) return bytes;
          } else if (uri.startsWith("data:")) {
            const commaIdx = uri.indexOf(",");
            if (commaIdx > -1) {
              const b64 = uri.slice(commaIdx + 1);
              try {
                return new Uint8Array(Buffer.from(b64, "base64"));
              } catch {
                /* fall through */
              }
            }
          } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
            if (!isSafeExternalUrl(uri)) {
              log.warn(
                "resolveSourceImageBytes: refusing to fetch non-public URL",
                { uri }
              );
            } else {
              try {
                const resp = await fetch(uri);
                if (resp.ok) {
                  return new Uint8Array(await resp.arrayBuffer());
                }
              } catch (err) {
                log.warn("resolveSourceImageBytes: fetch failed", {
                  uri,
                  error: err instanceof Error ? err.message : String(err)
                });
              }
            }
          }
        }
        const data64 =
          typeof image.data === "string" ? (image.data as string) : null;
        if (data64) {
          try {
            return new Uint8Array(Buffer.from(data64, "base64"));
          } catch {
            /* ignore */
          }
        }
      }
    }
    return null;
  }

  private async handleWorkflowMessage(
    data: Record<string, unknown>,
    _requestSeq?: number
  ): Promise<void> {
    const threadId = typeof data.thread_id === "string" ? data.thread_id : "";
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : null;
    const providerId =
      typeof data.provider === "string" ? data.provider : this.defaultProvider;
    const model =
      typeof data.model === "string" ? data.model : this.defaultModel;
    const userId = this.userId ?? "1";
    const jobId = randomUUID();

    log.info("Workflow message", { threadId, workflowId, jobId });

    try {
      if (!workflowId) {
        throw new Error("workflow_id is required for workflow processing");
      }

      // Load workflow from DB
      const workflow = await Workflow.find(userId, workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const rawGraph = workflow.graph as {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      };

      // Detect message input names from raw graph (reads node.data) — matches Python
      const { messageName, messagesName } =
        this.detectMessageInputNames(rawGraph);
      const graph = await this.hydrateGraph(rawGraph);

      if (this.beforeRunJob) {
        await this.beforeRunJob(graph);
      }
      const messageInputName =
        (typeof data.workflow_message_input_name === "string"
          ? data.workflow_message_input_name
          : null) ??
        messageName ??
        "message";
      const messagesInputName =
        (typeof data.workflow_messages_input_name === "string"
          ? data.workflow_messages_input_name
          : null) ??
        messagesName ??
        "messages";

      // Build chat history for params — matches Python
      const [dbMessages] = await Message.paginate(threadId, { limit: 1000 });
      const chatHistorySerialized = dbMessages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        thread_id: m.thread_id
      }));

      // Serialize current message
      const currentMessage = {
        role: typeof data.role === "string" ? data.role : "user",
        content: data.content,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };

      // Prepare params — matches Python's WorkflowMessageProcessor
      const params: Record<string, unknown> = {
        [messageInputName]: currentMessage,
        [messagesInputName]: [...chatHistorySerialized, currentMessage],
        ...(typeof data.params === "object" && data.params !== null
          ? (data.params as Record<string, unknown>)
          : {})
      };

      // If chat workflow, add legacy params — matches Python's ChatWorkflowMessageProcessor
      if (workflow.run_mode === "chat") {
        const legacyChatInput = chatHistorySerialized.map((m) => ({
          role: m.role,
          content: this.extractTextContent(m.content),
          created_at: m.created_at
        }));
        params["chat_input"] = legacyChatInput;
        if (messagesInputName !== "messages") {
          params["messages"] = legacyChatInput;
        }
      }

      // Create processing context
      const workspaceDir = this.workspaceResolver
        ? await this.workspaceResolver(workflowId, userId)
        : null;
      const context = createRuntimeContext({
        jobId,
        workflowId,
        userId,
        workspaceDir,
        assetOutputMode: this.mode === "text" ? "data_uri" : "temp_url"
      });

      // Expose executor/node-type resolution for sub-workflow nodes
      context.setResolveExecutor((node) => this.resolveExecutor(node));
      if (this.resolveNodeType) {
        const resolverObj =
          typeof this.resolveNodeType === "function"
            ? { resolveNodeType: this.resolveNodeType }
            : this.resolveNodeType;
        context.setResolveNodeType(
          (nodeType) =>
            resolverObj.resolveNodeType(nodeType) as Promise<{
              nodeType: string;
              propertyTypes?: Record<string, string>;
              outputs?: Record<string, string>;
              supportsDynamicInputs?: boolean;
              descriptorDefaults?: Record<string, unknown>;
            } | null>
        );
      }

      // Create and run workflow
      const runner = new WorkflowRunner(jobId, {
        resolveExecutor: (node) =>
          this.resolveExecutor(
            node as { id: string; type: string; [key: string]: unknown }
          ),
        executionContext: context,
        validateNode: this.validateNode
      });

      const active: ActiveJob = {
        jobId,
        workflowId,
        context,
        runner,
        graph,
        finished: false,
        status: "running"
      };
      this.activeJobs.set(jobId, active);

      // Persist job to DB (best-effort)
      try {
        await Job.create({
          id: jobId,
          workflow_id: workflowId,
          user_id: userId,
          status: "running",
          params,
          graph
        });
      } catch (error) {
        this.logError("workflow job persistence failed", error);
      }

      // Execute workflow and stream messages
      const executePromise = runner.run(
        { job_id: jobId, workflow_id: workflowId, params },
        graph
      );

      // Stream events, collect output_update results
      const result: Record<string, unknown> = {};
      await this.sendMessage({
        type: "job_update",
        status: "running",
        job_id: jobId,
        workflow_id: workflowId
      });

      let finalOutputs: Record<string, unknown[]> = {};
      void executePromise
        .then((r) => {
          active.status = r.status;
          active.error = r.error;
          active.suspend = r.suspend;
          finalOutputs = r.outputs ?? {};
        })
        .catch((err) => {
          active.status = "failed";
          active.error = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          active.finished = true;
        });

      while (!active.finished || active.context.hasMessages()) {
        while (active.context.hasMessages()) {
          const msg = active.context.popMessage();
          if (!msg) break;
          const outbound: Record<string, unknown> = {
            ...(msg as unknown as Record<string, unknown>),
            job_id: (msg as unknown as Record<string, unknown>).job_id ?? jobId,
            workflow_id:
              (msg as unknown as Record<string, unknown>).workflow_id ??
              workflowId
          };

          if (
            outbound.type === "node_update" ||
            outbound.type === "output_update"
          ) {
            const nodeId = String(outbound.node_id ?? "");
            const graphNodes = graph.nodes ?? [];
            const node = graphNodes.find((n) => n.id === nodeId);
            const nodeType = typeof node?.type === "string" ? node.type : "";

            await this._handleNodeProviderCost(active, outbound, nodeType);

            // Capture output_update values for the response message
            if (outbound.type === "output_update") {
              if (nodeType.includes("Output")) {
                const nodeName =
                  typeof outbound.node_name === "string"
                    ? outbound.node_name
                    : nodeType;
                result[nodeName] = outbound.value;
              } else {
                continue; // Skip non-output node output_updates
              }
            }
          }

          await this.sendMessage(outbound);
        }
        if (!active.finished) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Collect any outputs from the runner result — only Output-type nodes
      // The kernel considers all leaf nodes as "output nodes", but for the
      // response message we only want nodes whose type includes "Output"
      // (matching Python's WorkflowMessageProcessor behavior).
      for (const [nodeType, values] of Object.entries(finalOutputs)) {
        if (!nodeType.includes("Output")) continue;
        if (!result[nodeType] && Array.isArray(values) && values.length > 0) {
          result[nodeType] = values.length === 1 ? values[0] : values;
        }
      }

      // Send terminal job_update if not already sent
      await this.sendMessage({
        type: "job_update",
        status: active.status,
        job_id: jobId,
        workflow_id: workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });

      // Persist final job status
      try {
        const job = (await Job.get(jobId)) as Job | null;
        // Don't overwrite a cancelled row (DB-only tRPC cancel) when the
        // in-flight run finishes — keep the cancellation authoritative.
        if (job) {
          if (job.status !== "cancelled") {
            if (active.status === "completed") job.markCompleted();
            else if (active.status === "failed")
              job.markFailed(active.error ?? "Unknown error");
            else if (active.status === "cancelled") job.markCancelled();
            else if (active.status === "suspended")
              job.markSuspended(
                active.suspend?.node_id ?? "",
                active.suspend?.reason ?? "",
                active.suspend?.state,
                active.suspend?.metadata
              );
          }
          job.cost =
            (active.providerCostTotal ?? 0) > 0
              ? (active.providerCostTotal ?? null)
              : null;
          await job.save();
        }
      } catch (error) {
        this.logError("workflow job persistence (final) failed", error);
      }

      this.activeJobs.delete(jobId);
      this.drainQueue();

      // Signal completion — done chunk with job_id + workflow_id
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Create response message from workflow outputs — matches Python's _create_response_message
      const responseContent = this.createWorkflowResponseContent(result);
      const responseMsg: Record<string, unknown> = {
        type: "message",
        role: "assistant",
        content: responseContent,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model,
        job_id: jobId
      };
      await this.saveMessageToDb(responseMsg);
      await this.sendMessage(responseMsg);

      log.debug("Workflow message complete", { threadId, workflowId, jobId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Workflow message error", {
        threadId,
        workflowId,
        error: errMsg
      });

      await this.sendMessage({
        type: "error",
        message: `Error processing workflow: ${errMsg}`,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Send done chunk even on error — matches Python
      await this.sendMessage({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });
    }
  }

  /**
   * Build the map of configured BaseProvider instances for the given user.
   * Cached per user — invalidate by clearing `configuredProvidersCache`.
   * Used by MCP tools (`find_model`, media generation) that need provider
   * access.
   */
  private async getConfiguredProviders(
    userId: string
  ): Promise<Record<string, BaseProvider>> {
    const cached = this.configuredProvidersCache.get(userId);
    if (cached) return cached;

    const providersMod = await import("@nodetool-ai/runtime");
    const { getSecret: getStoredSecret } = await import(
      "@nodetool-ai/models"
    );
    const getSecret = (key: string) =>
      getStoredSecret(key, userId).then((v) => v ?? undefined);
    const ids: string[] = providersMod.listRegisteredProviderIds();
    const result: Record<string, BaseProvider> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          if (await providersMod.isProviderConfigured(id, getSecret)) {
            result[id] = await providersMod.getProvider(id, getSecret);
          }
        } catch (err) {
          log.debug("Skipping provider for find_model", {
            provider: id,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      })
    );
    this.configuredProvidersCache.set(userId, result);
    return result;
  }

  async handleInference(
    data: Record<string, unknown>,
    requestSeq: number
  ): Promise<void> {
    const providerId =
      typeof data.provider === "string" ? data.provider : this.defaultProvider;
    const model =
      typeof data.model === "string" ? data.model : this.defaultModel;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    log.debug("Inference request", {
      model,
      provider: providerId,
      messages: rawMessages.length
    });

    const messages: ProviderMessage[] = rawMessages.map((m) => {
      const msg = m as Record<string, unknown>;
      return {
        role: (typeof msg.role === "string"
          ? msg.role
          : "user") as ProviderMessage["role"],
        content:
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? (msg.content as MessageContent[])
              : "",
        toolCallId: typeof msg.toolCallId === "string" ? msg.toolCallId : null,
        toolCalls: Array.isArray(msg.toolCalls)
          ? (msg.toolCalls as Array<{
              id: string;
              name: string;
              args: Record<string, unknown>;
            }>)
          : null,
        threadId: null
      };
    });

    if (!this.resolveProvider) {
      await this.sendMessage({
        type: "error",
        message: "No provider resolver configured"
      });
      return;
    }

    const rawTools = Array.isArray(data.tools) ? data.tools : [];
    const tools: ProviderTool[] = rawTools
      .map((t) => {
        const tool = t as Record<string, unknown>;
        return {
          name: typeof tool.name === "string" ? tool.name : "",
          description:
            typeof tool.description === "string" ? tool.description : undefined,
          inputSchema:
            typeof tool.inputSchema === "object"
              ? (tool.inputSchema as Record<string, unknown>)
              : undefined
        };
      })
      .filter((t) => t.name.length > 0);

    const provider = await this.resolveProvider(providerId, this.userId ?? "1");
    for await (const item of provider.generateMessagesTraced({
      messages,
      model,
      tools: tools.length > 0 ? tools : undefined
    })) {
      if (requestSeq !== this.chatRequestSeq) break; // cancelled
      if ("type" in item && item.type === "chunk") {
        await this.sendMessage({
          ...(item as unknown as Record<string, unknown>),
          seq: requestSeq
        });
      } else if ("name" in item) {
        const toolItem = item as {
          id: string;
          name: string;
          args: Record<string, unknown>;
        };
        log.info("Tool call", { tool: toolItem.name, args: toolItem.args });
        await this.sendMessage({
          type: "tool_call",
          id: toolItem.id,
          name: toolItem.name,
          args: toolItem.args,
          seq: requestSeq
        });
      }
    }

    if (requestSeq === this.chatRequestSeq) {
      log.debug("Inference complete");
      await this.sendMessage({ type: "inference_done", seq: requestSeq });
    }
  }

  /**
   * Run a one-shot media-generation request (text-to-image, image-to-image,
   * text-to-video, or text-to-audio) and return the produced asset ids.
   * Mirrors the image / image_edit / video / audio branches of
   * `handleMediaGenerationMessage` but skips the chat-thread machinery —
   * the caller wants asset ids, not a streamed Message row.
   *
   * Used by the `generate_media` RPC for the sketch editor's direct-gen
   * image layers and the timeline's direct-gen video / audio clips; the
   * chat-path equivalents stay in `handleMediaGenerationMessage` for now.
   */
  private async runDirectMediaGeneration(
    req: {
      mode: "image" | "image_edit" | "inpaint" | "video" | "audio";
      provider: string;
      model: string;
      prompt: string;
      sourceAssetId?: string;
      maskAssetId?: string;
      width?: number;
      height?: number;
      strength?: number;
      numInferenceSteps?: number;
      variations?: number;
      voice?: string;
      speed?: number;
      audioFormat?: string;
    }
  ): Promise<{ asset_ids: string[] }> {
    if (!this.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (!req.prompt || !req.prompt.trim()) {
      throw new Error("prompt is required");
    }

    const userId = this.userId ?? "1";
    const provider = await this.resolveProvider(req.provider, userId);
    const variations = Math.max(1, Math.min(Number(req.variations ?? 1), 8));

    const storeAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const asset = new Asset({
        user_id: userId,
        workflow_id: null,
        name: `${req.mode}_${Date.now()}`,
        content_type: contentType,
        parent_id: null
      });
      const fileName = `${asset.id}.${ext}`;
      await storeAssetWithThumbnail(asset.id, fileName, bytes, contentType);
      asset.size = bytes.length;
      await asset.save();
      return asset.id;
    };

    if (req.mode === "video") {
      const videoModel: ProviderVideoModel = {
        id: req.model,
        name: req.model,
        provider: req.provider
      };
      const params: TextToVideoParams = {
        model: videoModel,
        prompt: req.prompt
      };
      const bytes = await provider.textToVideo(params);
      const assetId = await storeAsset(bytes, "video/mp4", "mp4");
      return { asset_ids: [assetId] };
    }

    if (req.mode === "audio") {
      const supportedFormats = new Set([
        "mp3",
        "wav",
        "flac",
        "ogg",
        "aac",
        "pcm"
      ]);
      const requestedFormat =
        req.audioFormat && supportedFormats.has(req.audioFormat)
          ? req.audioFormat
          : null;

      // Prefer providers that return fully-encoded audio (OpenAI, HuggingFace).
      const encoded = await provider.textToSpeechEncoded({
        text: req.prompt,
        model: req.model,
        voice: req.voice,
        speed: req.speed,
        audioFormat: requestedFormat ?? undefined
      });

      if (encoded) {
        const mimeToExt: Record<string, string> = {
          "audio/mpeg": "mp3",
          "audio/wav": "wav",
          "audio/ogg": "ogg",
          "audio/flac": "flac",
          "audio/aac": "aac"
        };
        const ext = mimeToExt[encoded.mimeType] ?? "flac";
        const assetId = await storeAsset(encoded.data, encoded.mimeType, ext);
        return { asset_ids: [assetId] };
      }

      // Streaming-PCM fallback (OpenAI / Gemini), wrap in WAV unless caller
      // explicitly asked for raw PCM.
      const pcmChunks: Uint8Array[] = [];
      let totalBytes = 0;
      let chunkSampleRate = 24000;
      for await (const chunk of provider.textToSpeech({
        text: req.prompt,
        model: req.model,
        voice: req.voice,
        speed: req.speed,
        audioFormat: requestedFormat ?? undefined
      })) {
        if (chunk?.samples) {
          if (chunk.sampleRate) chunkSampleRate = chunk.sampleRate;
          const view = new Uint8Array(
            chunk.samples.buffer,
            chunk.samples.byteOffset,
            chunk.samples.byteLength
          );
          const copy = new Uint8Array(view);
          pcmChunks.push(copy);
          totalBytes += copy.byteLength;
        }
      }
      const merged = new Uint8Array(totalBytes);
      let off = 0;
      for (const c of pcmChunks) {
        merged.set(c, off);
        off += c.byteLength;
      }

      if (requestedFormat === "pcm") {
        const assetId = await storeAsset(merged, "audio/pcm", "pcm");
        return { asset_ids: [assetId] };
      }

      // Wrap raw 16-bit PCM in a WAV container so browsers can play it back.
      const sampleRate = chunkSampleRate;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      const wavHeader = new ArrayBuffer(44);
      const dv = new DataView(wavHeader);
      const writeStr = (pos: number, str: string) => {
        for (let i = 0; i < str.length; i++)
          dv.setUint8(pos + i, str.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      dv.setUint32(4, 36 + merged.byteLength, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, numChannels, true);
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, byteRate, true);
      dv.setUint16(32, blockAlign, true);
      dv.setUint16(34, bitsPerSample, true);
      writeStr(36, "data");
      dv.setUint32(40, merged.byteLength, true);

      const wav = new Uint8Array(44 + merged.byteLength);
      wav.set(new Uint8Array(wavHeader), 0);
      wav.set(merged, 44);

      const assetId = await storeAsset(wav, "audio/wav", "wav");
      return { asset_ids: [assetId] };
    }

    const imageModel: ProviderImageModel = {
      id: req.model,
      name: req.model,
      provider: req.provider
    };

    let images: Uint8Array[];
    if (req.mode === "image") {
      const params: TextToImageParams = {
        model: imageModel,
        prompt: req.prompt,
        width: req.width,
        height: req.height
      };
      images = await provider.textToImages(params, variations);
    } else if (req.mode === "inpaint") {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for inpaint");
      }
      if (!req.maskAssetId) {
        throw new Error("mask_asset_id is required for inpaint");
      }
      const adapter = getAssetAdapter();
      const [sourceAsset, maskAsset] = await Promise.all([
        Asset.find(userId, req.sourceAssetId),
        Asset.find(userId, req.maskAssetId)
      ]);
      if (!sourceAsset) throw new Error(`Source asset not found: ${req.sourceAssetId}`);
      if (!maskAsset) throw new Error(`Mask asset not found: ${req.maskAssetId}`);
      const sourceExt = (sourceAsset.content_type ?? "image/png").split("/")[1] ?? "png";
      const maskExt = (maskAsset.content_type ?? "image/png").split("/")[1] ?? "png";
      const [sourceBytes, maskBytes] = await Promise.all([
        adapter.retrieve(adapter.uriForKey(`${req.sourceAssetId}.${sourceExt}`)),
        adapter.retrieve(adapter.uriForKey(`${req.maskAssetId}.${maskExt}`))
      ]);
      if (!sourceBytes) throw new Error(`Source asset bytes not found: ${req.sourceAssetId}`);
      if (!maskBytes) throw new Error(`Mask asset bytes not found: ${req.maskAssetId}`);
      const params: InpaintingParams = {
        model: imageModel,
        prompt: req.prompt,
        targetWidth: req.width ?? null,
        targetHeight: req.height ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null,
        mask: maskBytes
      };
      images = await provider.inpaintImages([sourceBytes], params, variations);
    } else {
      if (!req.sourceAssetId) {
        throw new Error("source_asset_id is required for image_edit");
      }
      const sourceAsset = await Asset.find(userId, req.sourceAssetId);
      if (!sourceAsset) {
        throw new Error(`Source asset not found: ${req.sourceAssetId}`);
      }
      const ext =
        (sourceAsset.content_type ?? "image/png").split("/")[1] ?? "png";
      const adapter = getAssetAdapter();
      const sourceBytes = await adapter.retrieve(
        adapter.uriForKey(`${req.sourceAssetId}.${ext}`)
      );
      if (!sourceBytes) {
        throw new Error(`Source asset bytes not found: ${req.sourceAssetId}`);
      }
      const params: ImageToImageParams = {
        model: imageModel,
        prompt: req.prompt,
        targetWidth: req.width ?? null,
        targetHeight: req.height ?? null,
        strength: req.strength ?? null,
        numInferenceSteps: req.numInferenceSteps ?? null
      };
      images = await provider.imageToImages([sourceBytes], params, variations);
    }

    const assetIds: string[] = [];
    for (const bytes of images) {
      assetIds.push(await storeAsset(bytes, "image/png", "png"));
    }
    return { asset_ids: assetIds };
  }

  /**
   * Transcribe a stored audio asset to word-level caption timing. Mirrors the
   * provider path used by the ASR node but skips the workflow machinery — the
   * caller (Studio transcript beats) wants `{ word, startMs, endMs }[]` back in
   * one shot. Timestamps are returned in milliseconds relative to the start of
   * the audio.
   */
  private async runDirectTranscription(req: {
    provider: string;
    model: string;
    assetId: string;
    language?: string;
  }): Promise<{
    text: string;
    words: Array<{ word: string; startMs: number; endMs: number }>;
  }> {
    if (!this.resolveProvider) {
      throw new Error("No provider resolver configured");
    }
    if (!req.model) {
      throw new Error("model is required");
    }
    if (!req.assetId) {
      throw new Error("asset_id is required");
    }

    const userId = this.userId ?? "1";
    const asset = await Asset.find(userId, req.assetId);
    if (!asset) {
      throw new Error(`Audio asset not found: ${req.assetId}`);
    }
    const ext = (asset.content_type ?? "audio/wav").split("/")[1] ?? "wav";
    const adapter = getAssetAdapter();
    const bytes = await adapter.retrieve(
      adapter.uriForKey(`${req.assetId}.${ext}`)
    );
    if (!bytes) {
      throw new Error(`Audio asset bytes not found: ${req.assetId}`);
    }

    const provider = await this.resolveProvider(req.provider, userId);
    const result = await provider.automaticSpeechRecognition({
      audio: bytes,
      model: req.model,
      language: req.language,
      word_timestamps: true
    });

    const words = (result.chunks ?? [])
      .map((chunk) => ({
        word: chunk.text.trim(),
        startMs: Math.round(chunk.timestamp[0] * 1000),
        endMs: Math.round(chunk.timestamp[1] * 1000)
      }))
      .filter((w) => w.word.length > 0);

    return { text: result.text, words };
  }

  /**
   * Build a tRPC caller bound to this connection's `userId`. Used to dispatch
   * the read-only RPC commands (list_workflows, get_workflow, list_assets,
   * get_asset, list_nodes, get_node) onto the existing tRPC routers — single
   * source of truth, no logic duplication.
   */
  private getTrpcCaller() {
    if (!this.nodeRegistry || !this.apiOptions || !this.pythonBridge) {
      throw new Error(
        "RPC commands require nodeRegistry, apiOptions, and pythonBridge"
      );
    }
    const factory = createCallerFactory(appRouter);
    return factory({
      userId: this.userId,
      registry: this.nodeRegistry,
      apiOptions: this.apiOptions,
      pythonBridge: this.pythonBridge,
      getPythonBridgeReady: this.getPythonBridgeReady ?? (() => true)
    });
  }

  /**
   * Invoke a tRPC procedure and send back a single `rpc_response` frame
   * correlating to `command.request_id`. Returns `null` so the receive loop
   * skips the legacy auto-send (the frame has already been sent here).
   *
   * Errors thrown by the procedure are mapped to `rpc_response.error` using
   * the `apiCode` cause attached by `throwApiError` in the tRPC layer.
   */
  private async runRpc(
    command: WebSocketCommandEnvelope,
    fn: () => Promise<unknown>
  ): Promise<Record<string, unknown> | null> {
    const requestId = command.request_id;
    if (typeof requestId !== "string" || requestId.length === 0) {
      return { error: "request_id is required for RPC commands" };
    }
    try {
      const result = await fn();
      await this.sendMessage({
        type: "rpc_response",
        request_id: requestId,
        command: command.command,
        result
      });
    } catch (err) {
      const trpc = err as {
        code?: string;
        message?: string;
        cause?: { apiCode?: string };
      };
      const error: RpcErrorPayload = {
        code: trpc.cause?.apiCode ?? trpc.code ?? "INTERNAL_ERROR",
        message: trpc.message ?? String(err),
        apiCode: trpc.cause?.apiCode ?? null,
        trpcCode: trpc.code
      };
      await this.sendMessage({
        type: "rpc_response",
        request_id: requestId,
        command: command.command,
        error
      });
    }
    return null;
  }

  async handleCommand(
    command: WebSocketCommandEnvelope
  ): Promise<Record<string, unknown> | null> {
    const data = command.data ?? {};
    const jobId = typeof data.job_id === "string" ? data.job_id : undefined;
    const workflowId =
      typeof data.workflow_id === "string" ? data.workflow_id : undefined;
    log.debug("Command", { command: command.command });

    switch (command.command as UnifiedCommandType) {
      case "clear_models":
        return this.clearModels();
      case "run_job":
        await this.runJob(data as unknown as RunJobRequest);
        return { message: "Job started", workflow_id: workflowId ?? null };
      case "reconnect_job":
        if (!jobId) return { error: "job_id is required" };
        void this.reconnectJob(jobId, workflowId);
        return {
          message: `Reconnecting to job ${jobId}`,
          job_id: jobId,
          workflow_id: workflowId ?? null
        };
      case "resume_job":
        if (!jobId) return { error: "job_id is required" };
        void this.resumeJob(jobId, workflowId);
        return {
          message: `Resumption initiated for job ${jobId}`,
          job_id: jobId,
          workflow_id: workflowId ?? null
        };
      case "stream_input":
        if (!jobId) return { error: "job_id is required" };
        {
          const active = this.activeJobs.get(jobId);
          log.info("stream_input command", {
            jobId,
            hasActive: !!active,
            inputName: data.input,
            handle: data.handle,
            hasValue: data.value !== undefined,
            activeJobIds: [...this.activeJobs.keys()]
          });
          if (!active) return { error: "No active job/context" };
          const inputName = typeof data.input === "string" ? data.input : "";
          if (!inputName.trim()) return { error: "Invalid input name" };
          const value = data.value;
          const handle =
            typeof data.handle === "string" ? data.handle : undefined;
          try {
            await active.runner.pushInputValue(inputName, value, handle);
            return {
              message: "Input item streamed",
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          } catch (err) {
            log.error("stream_input failed", {
              error: err instanceof Error ? err.message : String(err)
            });
            return {
              error: err instanceof Error ? err.message : String(err),
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          }
        }
      case "end_input_stream":
        if (!jobId) return { error: "job_id is required" };
        {
          const active = this.activeJobs.get(jobId);
          if (!active) return { error: "No active job/context" };
          const inputName = typeof data.input === "string" ? data.input : "";
          if (!inputName.trim()) return { error: "Invalid input name" };
          const handle =
            typeof data.handle === "string" ? data.handle : undefined;
          try {
            active.runner.finishInputStream(inputName, handle);
            return {
              message: "Input stream ended",
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : String(err),
              job_id: jobId,
              workflow_id: workflowId ?? active.workflowId
            };
          }
        }
      case "cancel_job":
        if (!jobId) return { error: "job_id is required" };
        return this.cancelJob(jobId, workflowId);
      case "update_node_properties": {
        // Live parameter path: push property changes into a running job's
        // node executors (e.g. synth knobs while a patch plays). Misses are
        // not errors — the canvas already holds the value for the next run.
        if (!jobId) return { error: "job_id is required" };
        const nodeId = data.node_id;
        const properties = data.properties;
        if (typeof nodeId !== "string" || nodeId.length === 0) {
          return { error: "node_id is required" };
        }
        if (properties === null || typeof properties !== "object") {
          return { error: "properties must be an object" };
        }
        const active = this.activeJobs.get(jobId);
        const applied =
          active?.runner.updateNodeProperties(
            nodeId,
            properties as Record<string, unknown>
          ) ?? false;
        return { applied };
      }
      case "get_status":
        return this.getStatus(jobId);
      case "set_mode": {
        const mode = data.mode;
        if (mode !== "binary" && mode !== "text") {
          return { error: "mode must be binary or text" };
        }
        this.mode = mode;
        return { message: `Mode set to ${mode}` };
      }
      case "chat_message": {
        const threadId = data.thread_id;
        if (typeof threadId !== "string" || threadId.length === 0) {
          return { error: "thread_id is required for chat_message command" };
        }
        this.chatRequestSeq += 1;
        const seq = this.chatRequestSeq;
        this.currentTask = this.handleChatMessage(data, seq);
        void this.currentTask.catch(async (err) => {
          this.logError("chat_message processing failed", err);
          await this.sendMessage({
            type: "error",
            message: err instanceof Error ? err.message : String(err)
          });
        });
        return {
          message: "Chat message processing started",
          thread_id: threadId
        };
      }
      case "inference": {
        this.chatRequestSeq += 1;
        const seq = this.chatRequestSeq;
        this.currentTask = this.handleInference(data, seq);
        void this.currentTask.catch(async (err) => {
          this.logError("inference processing failed", err);
          await this.sendMessage({
            type: "error",
            message: err instanceof Error ? err.message : String(err)
          });
        });
        return { message: "Inference started" };
      }
      case "stop": {
        const threadId =
          typeof data.thread_id === "string" ? data.thread_id : undefined;
        // Always increment seq to cancel any in-progress chat or inference
        this.chatRequestSeq += 1;
        this.currentTask = null;
        if (jobId) {
          const active = this.activeJobs.get(jobId);
          if (active) {
            active.runner.cancel();
            active.finished = true;
            active.status = "cancelled";
          }
        }
        this.toolBridge.cancelAll();
        this.approvalBridge.cancelAll();
        await this.sendMessage({
          type: "generation_stopped",
          message: "Generation stopped by user",
          job_id: jobId ?? null,
          thread_id: threadId ?? null
        });
        return {
          message: "Stop command processed",
          job_id: jobId ?? null,
          thread_id: threadId ?? null
        };
      }
      case "list_workflows": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.workflows.list(data as Parameters<typeof caller.workflows.list>[0])
        );
      }
      case "get_workflow": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.workflows.get({ id: String(data.id ?? "") })
        );
      }
      case "list_assets": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.assets.list(data as Parameters<typeof caller.assets.list>[0])
        );
      }
      case "get_asset": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.assets.get({ id: String(data.id ?? "") })
        );
      }
      case "list_nodes": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.nodes.list(data as Parameters<typeof caller.nodes.list>[0])
        );
      }
      case "get_node": {
        const caller = this.getTrpcCaller();
        return this.runRpc(command, () =>
          caller.nodes.get({ node_type: String(data.node_type ?? "") })
        );
      }
      case "generate_media": {
        const rawMode = data.mode;
        const mode: "image" | "image_edit" | "inpaint" | "video" | "audio" =
          rawMode === "image_edit"
            ? "image_edit"
            : rawMode === "inpaint"
              ? "inpaint"
              : rawMode === "video"
                ? "video"
                : rawMode === "audio"
                  ? "audio"
                  : "image";
        const provider = String(data.provider ?? this.defaultProvider);
        const model = String(data.model ?? this.defaultModel);
        const prompt = String(data.prompt ?? "");
        const sourceAssetId =
          typeof data.source_asset_id === "string"
            ? (data.source_asset_id as string)
            : undefined;
        const maskAssetId =
          typeof data.mask_asset_id === "string"
            ? (data.mask_asset_id as string)
            : undefined;
        const width =
          typeof data.width === "number" ? (data.width as number) : undefined;
        const height =
          typeof data.height === "number" ? (data.height as number) : undefined;
        const strength =
          typeof data.strength === "number"
            ? (data.strength as number)
            : undefined;
        const numInferenceSteps =
          typeof data.num_inference_steps === "number"
            ? (data.num_inference_steps as number)
            : undefined;
        const variations =
          typeof data.variations === "number"
            ? (data.variations as number)
            : undefined;
        const voice =
          typeof data.voice === "string" ? (data.voice as string) : undefined;
        const speed =
          typeof data.speed === "number" ? (data.speed as number) : undefined;
        const audioFormat =
          typeof data.audio_format === "string"
            ? (data.audio_format as string)
            : undefined;
        return this.runRpc(command, () =>
          this.runDirectMediaGeneration({
            mode,
            provider,
            model,
            prompt,
            sourceAssetId,
            maskAssetId,
            width,
            height,
            strength,
            numInferenceSteps,
            variations,
            voice,
            speed,
            audioFormat
          })
        );
      }
      case "transcribe_audio": {
        const provider = String(data.provider ?? this.defaultProvider);
        const model = String(data.model ?? this.defaultModel);
        const assetId =
          typeof data.asset_id === "string" ? (data.asset_id as string) : "";
        const language =
          typeof data.language === "string"
            ? (data.language as string)
            : undefined;
        return this.runRpc(command, () =>
          this.runDirectTranscription({ provider, model, assetId, language })
        );
      }
      default:
        return { error: "Unknown command" };
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: "ping", ts: Date.now() / 1000 }).catch((err) => {
        log.warn("Failed to send heartbeat ping", { error: String(err) });
      });
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startStatsBroadcast(): void {
    this.stopStatsBroadcast();
    const send = () => {
      this.sendMessage({
        type: "system_stats",
        stats: this.getSystemStats()
      }).catch((err) => {
        log.warn("Failed to send system stats", { error: String(err) });
      });
    };
    // Fire an initial sample ~1s after connect so the sampler has a delta to
    // report — then keep emitting on a regular cadence.
    setTimeout(send, 1000);
    this.statsTimer = setInterval(send, 5_000);
  }

  private stopStatsBroadcast(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private registerObserver(): void {
    if (this.observerRegistered) return;
    ModelObserver.subscribe(this.onModelChange);
    resourceEvents.on("change", this.onResourceEvent);
    this.observerRegistered = true;
  }

  private unregisterObserver(): void {
    if (!this.observerRegistered) return;
    ModelObserver.unsubscribe(this.onModelChange);
    resourceEvents.off("change", this.onResourceEvent);
    this.observerRegistered = false;
  }

  private onModelChange = (
    instance: DBModel,
    event: ModelChangeEvent
  ): void => {
    if (!this.websocket) return;
    // Only forward changes for models the connected user owns. Models without
    // a `user_id` (runtime-internal types) are forwarded to every connection.
    const ownerId = (instance as DBModel & { user_id?: string }).user_id;
    if (ownerId && this.userId && ownerId !== this.userId) return;

    const resource: Record<string, unknown> = {
      id: instance.partitionValue(),
      etag: instance.getEtag()
    };
    // Include scope fields for resource types whose cache is keyed on a
    // parent id (Message → thread_id, WorkflowVersion → workflow_id, etc.).
    // Frontend handlers use these to narrow invalidation.
    const data = instance as Record<string, unknown>;
    for (const field of ["workflow_id", "thread_id", "parent_id"] as const) {
      const value = data[field];
      if (typeof value === "string" && value.length > 0) {
        resource[field] = value;
      }
    }

    void this.sendMessage({
      type: "resource_change",
      event,
      resource_type: instance.constructor.name.toLowerCase(),
      resource
    });
  };

  private onResourceEvent = (payload: ResourceChangePayload): void => {
    if (!this.websocket) return;
    if (payload.userId && this.userId && payload.userId !== this.userId) return;
    void this.sendMessage({
      type: "resource_change",
      event: payload.event,
      resource_type: payload.resource_type,
      resource: payload.resource
    });
  };

  async run(websocket: WebSocketConnection): Promise<void> {
    await this.connect(
      websocket,
      this.userId ?? undefined,
      this.authToken ?? undefined
    );
    try {
      await this.receiveMessages();
    } finally {
      await this.disconnect();
    }
  }

  async receiveMessages(): Promise<void> {
    while (true) {
      const data = await this.receiveMessage();
      if (data === null) break;

      const msgType = typeof data.type === "string" ? data.type : null;
      if (msgType === "client_tools_manifest") {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        this.clientToolsManifest = {};
        for (const tool of tools) {
          if (
            tool &&
            typeof tool === "object" &&
            typeof (tool as Record<string, unknown>).name === "string"
          ) {
            const name = (tool as Record<string, unknown>).name as string;
            this.clientToolsManifest[name] = tool as Record<string, unknown>;
          }
        }
        continue;
      }

      if (msgType === "tool_result") {
        const toolCallId =
          typeof data.tool_call_id === "string" ? data.tool_call_id : null;
        if (toolCallId) {
          this.toolBridge.resolveResult(toolCallId, data);
        }
        continue;
      }

      if (msgType === "tool_approval_response") {
        const approvalId =
          typeof data.approval_id === "string" ? data.approval_id : null;
        if (approvalId) {
          this.approvalBridge.resolveResult(approvalId, data);
        }
        continue;
      }

      if (msgType === "ping") {
        await this.sendMessage({ type: "pong", ts: Date.now() / 1000 });
        continue;
      }

      if (msgType === "pong") {
        continue;
      }

      if (typeof data.command === "string") {
        try {
          const command = data as unknown as WebSocketCommandEnvelope;
          const response = await this.handleCommand(command);
          // RPC commands send their `rpc_response` frame inline (in runRpc)
          // and return null so we don't send a stray legacy reply.
          if (response) await this.sendMessage(response);
        } catch (err) {
          this.logError("invalid_command handling failed", err);
          await this.sendMessage({
            error: "invalid_command",
            details: err instanceof Error ? err.message : String(err)
          });
        }
        continue;
      }

      await this.sendMessage({
        error: "invalid_message",
        message:
          "All messages must include a 'command' field. Use 'chat_message' command for chat."
      });
    }
  }
}
