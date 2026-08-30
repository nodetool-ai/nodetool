import { createLogger, getDefaultAssetsPath } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import { isRawRgbaImage } from "@nodetool-ai/protocol";
import { encodeRawRgbaToPng, fetchExternalMedia } from "@nodetool-ai/runtime";
import { getAssetFileName } from "../lib/asset-paths.js";
import { storeAssetWithThumbnail } from "../lib/thumbnail.js";
import {
  isNonEmptyString,
  isObjectLike,
  isRecord,
  isString
} from "../lib/wire-values.js";

const log = createLogger("nodetool.websocket.runner");

export function getAssetStoragePath(): string {
  return getDefaultAssetsPath();
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
) {
  const prompt = properties?.prompt;
  if (!isString(prompt)) return {};
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

function isAssetLikeValue(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    isString(v.type) &&
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
  if (!isObjectLike(value)) return false;
  const v = value as Record<string, unknown>;
  return v.type === "chunk" && v.content instanceof Float32Array;
}

/** Encode a native audio chunk's samples to base64 f32le for the wire. */
function encodeAudioChunkForWire(
  chunk: Record<string, unknown> & { content: Float32Array }
) {
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
export function encodeNativeAudioChunks(
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
  if (isString(data)) {
    return Uint8Array.from(Buffer.from(data, "base64"));
  }
  return null;
}

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
export function extractEmbeddedImage(source: {
  data?: unknown;
  uri?: unknown;
  mimeType?: unknown;
}): { bytes: Uint8Array; mimeType: string } | { uri: string } | null {
  const declaredMime = isString(source.mimeType) ? source.mimeType : undefined;
  const data = isString(source.data) ? source.data : undefined;
  const uri = isString(source.uri) ? source.uri : undefined;

  if (data) {
    if (data.startsWith("data:")) {
      const parsed = parseImageDataUri(data);
      if (parsed) {
        return {
          bytes: parsed.bytes,
          mimeType: declaredMime ?? parsed.mimeType
        };
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
        return {
          bytes: parsed.bytes,
          mimeType: declaredMime ?? parsed.mimeType
        };
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
      // The uri comes from a user-authored workflow's output, so it is fetched
      // under the media-ref egress policy — otherwise an auto-save node could
      // make the server read cloud-metadata / internal services. A refusal
      // throws; the catch below reports it and answers "no bytes".
      const resp = await fetchExternalMedia(uri);
      if (!resp.ok) return null;
      return new Uint8Array(await resp.arrayBuffer());
    }
  } catch (err) {
    // Failed to read bytes — non-fatal, but say which uri and why: a refused
    // URL and a dead host are different problems for whoever reads the log.
    log.warn("readBytesFromUri failed", {
      uri,
      error: err instanceof Error ? err.message : String(err)
    });
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
export async function autoSaveAssets(
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
    if (isRecord(value)) {
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
      if (!bytes && isString(assetValue.uri)) {
        bytes = await readBytesFromUri(assetValue.uri as string);
      }
    }
    if (!bytes) continue;

    // Determine mime/ext, preferring explicit content_type.
    const explicitMime = isRaw
      ? "image/png"
      : (assetValue.mime_type ?? assetValue.content_type);
    const contentType =
      isString(explicitMime) && explicitMime
        ? explicitMime
        : (ASSET_TYPE_MIME[assetType] ?? "application/octet-stream");

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
    if (opts.generationIndex != null) {
      mediaMeta.generation_index = opts.generationIndex;
    }
    if (Object.keys(mediaMeta).length > 0) {
      asset.metadata = mediaMeta;
    }

    const fileName = getAssetFileName(asset.id, contentType);
    try {
      await storeAssetWithThumbnail(
        asset.user_id,
        asset.id,
        fileName,
        bytes,
        contentType
      );
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
    if (isNonEmptyString(textVal)) {
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
        opts.generationIndex != null
          ? { text: previewText, generation_index: opts.generationIndex }
          : { text: previewText };
      const fileName = `${asset.id}.txt`;
      try {
        await storeAssetWithThumbnail(
          asset.user_id,
          asset.id,
          fileName,
          bytes,
          "text/plain"
        );
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
        type AssetMetadataFields = {
          json?: typeof inline;
          generation_index?: number;
        };
        const metadata: AssetMetadataFields = {};
        if (inline !== undefined) {
          metadata.json = inline;
        }
        if (opts.generationIndex != null) {
          metadata.generation_index = opts.generationIndex;
        }
        asset.metadata = metadata;
        const fileName = `${asset.id}.json`;
        try {
          await storeAssetWithThumbnail(
            asset.user_id,
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
