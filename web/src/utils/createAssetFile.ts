import log from "loglevel";
import { authHeader } from "../lib/auth";
import type { Chunk } from "../stores/ApiTypes";
import { trpcClient } from "../trpc/client";
import { isTRPCErrorWithCode, ApiErrorCode } from "@nodetool/protocol/api-schemas";
import { resolveAssetUri } from "../components/node/output/hooks";

interface AssetFileResult {
  file: File;
  filename: string;
  type: string;
}

/**
 * Represents a column in a DataFrame output
 */
interface DataFrameColumn {
  name: string;
}

/**
 * Represents a DataFrame output from Python nodes
 */
interface DataFrame {
  columns: DataFrameColumn[];
  data: unknown[][];
}

/**
 * Base interface for typed output values
 */
interface TypedOutput {
  type?: string;
  data?: unknown;
  value?: unknown;
  content?: unknown;
  mime_type?: string;
  mimeType?: string;
  uri?: string;
  asset_id?: string;
  filename?: string;
}

/**
 * Union type for all possible asset output formats
 */
type AssetOutput = TypedOutput | string | Uint8Array | unknown[] | null;

export type CreateAssetFileOptions = {
  /**
   * Cap large text outputs (especially streaming chunk joins) to avoid browser OOM
   * or `RangeError: Invalid string length`.
   *
   * Default is intentionally high for UX.
   */
  maxTextChars?: number;
};

const TEXT_ENCODER = new TextEncoder();
const DEFAULT_MAX_TEXT_CHARS = 5_000_000;
const TRUNCATION_SUFFIX = "\n… (truncated)";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json"
};

const convertDataFrameToCSV = (dataframe: DataFrame): string => {
  const headers = dataframe.columns.map((col) => col.name).join(",");
  const rows = dataframe.data.map((row) => (row as string[]).join(",")).join("\n");
  return `${headers}\n${rows}`;
};

const decodeBase64 = (value: string): Uint8Array => {
  const cleaned = value.includes(",") ? value.split(",").pop() ?? "" : value;
  if (typeof globalThis.atob === "function") {
    try {
      const binary = globalThis.atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      // continue to other fallbacks
    }
  }

  try {
    const BufferCtor = (globalThis as Record<string, unknown>).Buffer;
    if (BufferCtor && typeof BufferCtor === "function") {
      const buffer = (BufferCtor as unknown as { from: (data: string, encoding: string) => Uint8Array }).from(cleaned, "base64");
      return new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
      );
    }
  } catch {
    // ignore Buffer fallback errors
  }

  return TEXT_ENCODER.encode(value);
};

/**
 * Tests whether a value carries a usable binary payload that we can safely
 * convert into bytes. Anything else (e.g. a msgpack `ExtData` wrapper, a
 * pydantic-serialized object, a stray map) should be treated as "no data" so
 * the URI-fetch fallback runs instead.
 */
const isUsableBinary = (val: unknown): boolean => {
  if (val instanceof Uint8Array) return val.length > 0;
  if (val instanceof ArrayBuffer) return val.byteLength > 0;
  if (ArrayBuffer.isView(val)) return (val as ArrayBufferView).byteLength > 0;
  if (Array.isArray(val))
    return val.length > 0 && val.every((v) => typeof v === "number");
  if (typeof val === "string") return val.trim() !== "";
  return false;
};

/**
 * Convert various input types to Uint8Array
 */
const toUint8Array = (input: unknown): Uint8Array => {
  if (!input) {return new Uint8Array();}
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(
      input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    );
  }
  if (typeof input === "string") {
    const base64Like =
      input.startsWith("data:") ||
      /^[A-Za-z0-9+/=]+$/.test(input.replace(/[\r\n]+/g, ""));
    if (base64Like) {
      try {
        return decodeBase64(input);
      } catch {
        return TEXT_ENCODER.encode(input);
      }
    }
    return TEXT_ENCODER.encode(input);
  }
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (record.data instanceof Uint8Array) return record.data;
    if (record.data instanceof ArrayBuffer) return new Uint8Array(record.data);
    if (ArrayBuffer.isView(record.data as object | null)) {
      const view = record.data as ArrayBufferView;
      return new Uint8Array(
        view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
      );
    }
    if ("content" in record) {
      return toUint8Array(record.content);
    }
    // Fallback: treat as a sparse byte map. Only safe when all values are
    // numbers; otherwise we'd silently produce garbage (e.g. for `ExtData`
    // wrappers that hold a non-binary `.data`).
    const values = Object.values(record);
    if (values.length > 0 && values.every((v) => typeof v === "number")) {
      return new Uint8Array(values as number[]);
    }
    return new Uint8Array();
  }

  return new Uint8Array();
};

const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  const { buffer, byteOffset, byteLength } = view;
  const candidate = buffer as ArrayBuffer & {
    slice?: (_start: number, _end: number) => ArrayBuffer;
  };
  if (typeof candidate.slice === "function") {
    return candidate.slice(byteOffset, byteOffset + byteLength);
  }

  const cloned = new ArrayBuffer(byteLength);
  const target = new Uint8Array(cloned);
  target.set(new Uint8Array(buffer, byteOffset, byteLength));
  return cloned;
};

const isChunk = (value: unknown): value is Chunk =>
  value !== null &&
  typeof value === "object" &&
  "type" in value &&
  value.type === "chunk";

const resolveDownloadUri = (uri: string): string => {
  if (typeof window === "undefined") {
    return uri;
  }
  try {
    const parsed = new URL(uri, window.location.origin);
    const localHosts = new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      window.location.hostname
    ]);

    if (
      localHosts.has(parsed.hostname) &&
      parsed.port &&
      parsed.port !== window.location.port
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return uri;
  }
};

const chunkToOutput = (chunk: Chunk) => {
  if (typeof window !== "undefined") {
    log.debug("[createAssetFile] chunkToOutput", {
      type: chunk.content_type,
      hasContent: typeof chunk.content !== "undefined",
      contentLength:
        typeof chunk.content === "string" ? chunk.content.length : undefined
    });
  } else {
    log.debug("[createAssetFile] chunkToOutput", {
      type: chunk.content_type,
      hasContent: typeof chunk.content !== "undefined",
      contentLength:
        typeof chunk.content === "string" ? chunk.content.length : undefined
    });
  }
  switch (chunk.content_type) {
    case "text":
      return { type: "text", data: chunk.content ?? "" };
    case "image":
    case "audio":
    case "video":
      return { type: chunk.content_type, data: chunk.content ?? "" };
    default:
      return chunk.content ?? chunk;
  }
};

const concatTextChunksSafely = (
  chunks: Chunk[],
  maxChars: number
): { text: string; truncated: boolean } => {
  const parts: string[] = [];
  let currentLen = 0;

  for (const chunk of chunks) {
    const piece = typeof chunk.content === "string" ? chunk.content : "";
    if (!piece) {
      continue;
    }

    const remaining = maxChars - currentLen;
    if (remaining <= 0) {
      return { text: parts.join("") + TRUNCATION_SUFFIX, truncated: true };
    }

    if (piece.length <= remaining) {
      parts.push(piece);
      currentLen += piece.length;
      continue;
    }

    parts.push(piece.slice(0, remaining));
    currentLen += remaining;
    return { text: parts.join("") + TRUNCATION_SUFFIX, truncated: true };
  }

  return { text: parts.join(""), truncated: false };
};

const normalizeOutput = (
  output: AssetOutput,
  options?: CreateAssetFileOptions
): AssetOutput => {
  const maxTextChars = Math.max(
    1,
    options?.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS
  );
  if (Array.isArray(output)) {
    if (output.length > 0 && output.every((item) => isChunk(item))) {
      const chunks = output as Chunk[];
      const textChunks = chunks.filter(
        (chunk) => chunk.content_type === "text"
      );
      if (textChunks.length === chunks.length) {
        const { text, truncated } = concatTextChunksSafely(
          textChunks,
          maxTextChars
        );
        if (truncated) {
          log.warn("[createAssetFile] Truncated streaming text output", {
            maxTextChars,
            chunks: textChunks.length
          });
        }
        return {
          type: "text",
          data: text
        };
      }
      return chunks.map((chunk) => normalizeOutput(chunk as AssetOutput, options));
    }
    return output.map((item) => normalizeOutput(item as AssetOutput, options));
  }

  if (isChunk(output)) {
    return chunkToOutput(output);
  }

  return output;
};

const getOutputType = (output: AssetOutput): string | undefined => {
  if (output && typeof output === "object") {
    return (output as TypedOutput).type;
  }
  return undefined;
};

const getOutputData = (output: AssetOutput): unknown => {
  if (output && typeof output === "object") {
    const record = output as TypedOutput;
    if (record.data !== undefined && record.data !== null) {
      return record.data;
    }
    if (record.value !== undefined && record.value !== null) {
      return record.value;
    }
    if (record.content !== undefined && record.content !== null) {
      return record.content;
    }
    return output;
  }
  return output;
};

const getMimeType = (
  output: AssetOutput,
  fallback: string
): string => {
  if (!output || typeof output !== "object") {
    return fallback;
  }

  const asString = (value: unknown): value is string =>
    typeof value === "string" && value.includes("/");

  const typedOutput = output as TypedOutput;
  return (
    (asString(typedOutput.mime_type) && typedOutput.mime_type) ||
    (asString(typedOutput.mimeType) && typedOutput.mimeType) ||
    (asString(typedOutput.type) && typedOutput.type) ||
    (asString((typedOutput.data as TypedOutput)?.mime_type) && (typedOutput.data as TypedOutput).mime_type) ||
    (asString((typedOutput.data as TypedOutput)?.mimeType) && (typedOutput.data as TypedOutput).mimeType) ||
    fallback
  );
};

const getExtension = (mimeType: string, defaultExt: string) => {
  const normalized = mimeType?.toLowerCase();
  return MIME_EXTENSION_MAP[normalized] || defaultExt;
};

const buildFilename = (
  desired: string | undefined,
  id: string,
  suffix: string,
  extension: string,
  index?: number
) => {
  if (!desired || desired.trim() === "") {
    return `preview_${id}${suffix}${extension ? `.${extension}` : ""}`;
  }

  if (!suffix || (typeof index === "number" && index === 0)) {
    return desired;
  }

  const dotIndex = desired.lastIndexOf(".");
  if (dotIndex === -1) {
    return `${desired}${suffix}${extension ? `.${extension}` : ""}`;
  }

  return `${desired.slice(0, dotIndex)}${suffix}${desired.slice(dotIndex)}`;
};

const isExternalUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
};

const fetchBinaryFromUri = async (uri: string): Promise<Uint8Array> => {
  const resolvedUri = resolveDownloadUri(resolveAssetUri(uri));
  const external = isExternalUrl(resolvedUri);

  const fetchOptions: RequestInit = external
    ? { mode: "cors" }
    : { credentials: "include", mode: "cors", headers: await authHeader() };

  const response = await fetch(resolvedUri, fetchOptions);
  if (!response.ok) {
    throw new Error(`Unexpected response ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const createSingleAssetFile = async (
  output: AssetOutput,
  id: string,
  index?: number
): Promise<AssetFileResult> => {
  const originalData = getOutputData(output);

  let data: unknown = originalData;
  // Treat anything that isn't a direct binary form (Uint8Array, ArrayBuffer,
  // typed array, numeric array, non-empty string) as "no inline data". This
  // catches msgpack `ExtData` wrappers and similar containers that the
  // backend may attach alongside a real `uri`. When a URI is present we'll
  // fetch the bytes from there; if not, the `toUint8Array` call below tries
  // to extract `record.data` as a best-effort fallback.
  const isDataEmpty = !isUsableBinary(data);

  const stringLooksLikeUrl =
    typeof data === "string" &&
    (data.startsWith("http://") || data.startsWith("https://"));

  const typedOutput = output && typeof output === "object" ? output as TypedOutput : null;
  const outputUri = typeof typedOutput?.uri === "string" ? typedOutput.uri : undefined;
  const isAssetUri = typeof outputUri === "string" && outputUri.startsWith("asset://");
  let desiredFilename = typedOutput?.filename;

  // Fetch from URI whenever inline `data` isn't a usable binary payload.
  // This covers asset://, /api/storage/, http(s)://, and also the ExtData
  // case where the wrapper exists but doesn't contain real bytes.
  const shouldFetchFromUri =
    typeof outputUri === "string" &&
    (isDataEmpty || stringLooksLikeUrl || data === output);
  const shouldDownloadAsset =
    typeof typedOutput?.asset_id === "string" &&
    (isDataEmpty || data === output || isAssetUri);

  if (shouldDownloadAsset) {
    try {
      const assetResponse = await trpcClient.assets.get.query({
        id: typedOutput?.asset_id ?? ""
      });
      const downloadUrl = assetResponse.get_url;
      desiredFilename = assetResponse.name || desiredFilename;
      if (downloadUrl) {
        data = await fetchBinaryFromUri(downloadUrl);
      } else if (outputUri) {
        data = await fetchBinaryFromUri(outputUri);
      } else {
        log.warn("[createAssetFile] asset metadata missing get_url");
      }
    } catch (err) {
      // NOT_FOUND is expected if the asset was already deleted; surface others normally.
      if (!isTRPCErrorWithCode(err, ApiErrorCode.NOT_FOUND)) {
        log.warn("[createAssetFile] Failed to download asset via API", err);
      }
      data = originalData ?? new Uint8Array();
    }
  } else if (shouldFetchFromUri) {
    try {
      data = await fetchBinaryFromUri(outputUri);
    } catch (err) {
      log.warn("[createAssetFile] Failed to fetch data from URI", err);
      data = originalData ?? new Uint8Array();
    }
  }

  const type = getOutputType(output);

  let content: BlobPart;
  let filename: string;
  let mimeType: string;

  const suffix = index !== undefined ? `_${index}` : "";

  switch (type) {
    case "image": {
      mimeType = getMimeType(output, "image/png");
      const extension = getExtension(mimeType, "png");
      const bytes = toUint8Array(data);
      if (bytes.length === 0) {
        log.warn("[createAssetFile] image bytes empty — uploaded file will be 0 bytes", {
          uri: (output as TypedOutput | null)?.uri ?? null,
          asset_id: (output as TypedOutput | null)?.asset_id ?? null
        });
      }
      content = toArrayBuffer(bytes);
      filename = buildFilename(desiredFilename, id, suffix, extension, index);
      break;
    }
    case "video": {
      mimeType = getMimeType(output, "video/mp4");
      const extension = getExtension(mimeType, "mp4");
      content = toArrayBuffer(toUint8Array(data));
      filename = buildFilename(desiredFilename, id, suffix, extension, index);
      break;
    }
    case "audio": {
      mimeType = getMimeType(output, "audio/mp3");
      const extension = getExtension(mimeType, "mp3");
      content = toArrayBuffer(toUint8Array(data));
      filename = buildFilename(desiredFilename, id, suffix, extension, index);
      break;
    }
    case "dataframe":
      content = convertDataFrameToCSV(data as DataFrame);
      mimeType = "text/csv";
      filename = buildFilename(desiredFilename, id, suffix, "csv", index);
      break;
    case "object":
    case "array":
      content = JSON.stringify(data, null, 2);
      mimeType = "application/json";
      filename = buildFilename(desiredFilename, id, suffix, "json", index);
      break;
    case "text":
      content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      mimeType = getMimeType(output, "text/plain");
      filename = buildFilename(
        desiredFilename,
        id,
        suffix,
        getExtension(mimeType, "txt"),
        index
      );
      break;
    default:
      content =
        typeof output === "string"
          ? output
          : typeof data === "string" || data instanceof Blob
          ? data
          : JSON.stringify(output, null, 2);
      mimeType = getMimeType(output, "text/plain");
      filename = buildFilename(
        desiredFilename,
        id,
        suffix,
        getExtension(mimeType, "txt"),
        index
      );
  }

  const file = new File([content], filename, { type: mimeType });

  return { file, filename, type: mimeType };
};

/**
 * Unwrap named-output maps like { image: { type: "image", ... } } that dynamic
 * nodes (e.g. KieAI) return.  A plain object with no "type" field whose every
 * value is itself a typed object is treated as a collection of named outputs;
 * we expand it into an array so each output gets its own asset file.
 */
const unwrapNamedOutputs = (output: AssetOutput): AssetOutput | AssetOutput[] => {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }
  const record = output as Record<string, unknown>;
  if ("type" in record) {
    return output; // already a typed output
  }
  const values = Object.values(record);
  if (values.length === 0) {
    return output;
  }
  const typedValues = values.filter(
    (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "type" in (v as object)
  );
  if (typedValues.length === values.length) {
    return typedValues as AssetOutput[];
  }
  return output;
};

export const createAssetFile = async (
  output: AssetOutput | AssetOutput[],
  id: string,
  options?: CreateAssetFileOptions
): Promise<AssetFileResult[]> => {
  const normalized = normalizeOutput(output, options);

  if (Array.isArray(normalized)) {
    log.info("[createAssetFile] creating multiple asset files", {
      count: normalized.length
    });
    return Promise.all(
      normalized.map((item, index) => createSingleAssetFile(item as AssetOutput, id, index))
    );
  }

  const unwrapped = unwrapNamedOutputs(normalized as AssetOutput);
  if (Array.isArray(unwrapped)) {
    log.info("[createAssetFile] unwrapped named-output map", { count: unwrapped.length });
    return Promise.all(
      unwrapped.map((item, index) => createSingleAssetFile(item as AssetOutput, id, index))
    );
  }

  return Promise.all([createSingleAssetFile(unwrapped as AssetOutput, id)]);
};
