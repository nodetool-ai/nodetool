import log from "loglevel";
import type { Chunk } from "../stores/ApiTypes";
import { authHeader } from "../stores/ApiClient";
import { client } from "../stores/ApiClient";

interface AssetFileResult {
  file: File;
  filename: string;
  type: string;
}

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

const convertDataFrameToCSV = (dataframe: any): string => {
  const headers = dataframe.columns.map((col: any) => col.name).join(",");
  const rows = dataframe.data.map((row: any) => row.join(",")).join("\n");
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
    const BufferCtor = (globalThis as Record<string, any>).Buffer;
    if (BufferCtor) {
      const buffer = BufferCtor.from(cleaned, "base64");
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

const toUint8Array = (input: any): Uint8Array => {
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
    if ("data" in input) {
      return toUint8Array((input as any).data);
    }
    if ("content" in input) {
      return toUint8Array((input as any).content);
    }
    return new Uint8Array(Object.values(input as Record<string, number>));
  }

  return new Uint8Array();
};

const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  const { buffer, byteOffset, byteLength } = view;
  const candidate = buffer as ArrayBuffer & {
    slice?: (start: number, end: number) => ArrayBuffer;
  };
  if (typeof candidate.slice === "function") {
    return candidate.slice(byteOffset, byteOffset + byteLength);
  }

  const cloned = new ArrayBuffer(byteLength);
  const target = new Uint8Array(cloned);
  target.set(new Uint8Array(buffer, byteOffset, byteLength));
  return cloned;
};

const isChunk = (value: any): value is Chunk =>
  value && typeof value === "object" && value.type === "chunk";

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

const normalizeOutput = (output: any, options?: CreateAssetFileOptions): any => {
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
      return chunks.map((chunk) => normalizeOutput(chunk, options));
    }
    return output.map((item) => normalizeOutput(item, options));
  }

  if (isChunk(output)) {
    return chunkToOutput(output);
  }

  return output;
};

const getOutputType = (output: any): string | undefined => {
  if (output && typeof output === "object") {
    return output.type;
  }
  return undefined;
};

const getOutputData = (output: any): any => {
  if (output && typeof output === "object") {
    const record = output as Record<string, any>;
    if ("data" in record && record.data !== undefined && record.data !== null) {
      return record.data;
    }
    if (
      "value" in record &&
      record.value !== undefined &&
      record.value !== null
    ) {
      return record.value;
    }
    if (
      "content" in record &&
      record.content !== undefined &&
      record.content !== null
    ) {
      return record.content;
    }
    return output;
  }
  return output;
};

const getMimeType = (
  output: Record<string, any> | undefined,
  fallback: string
): string => {
  if (!output || typeof output !== "object") {
    return fallback;
  }

  const asString = (value: any) =>
    typeof value === "string" && value.includes("/");

  return (
    (asString(output.mime_type) && output.mime_type) ||
    (asString(output.mimeType) && output.mimeType) ||
    (asString(output.type) && output.type) ||
    (asString(output.data?.mime_type) && output.data?.mime_type) ||
    (asString(output.data?.mimeType) && output.data?.mimeType) ||
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
  const resolvedUri = resolveDownloadUri(uri);
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
  output: any,
  id: string,
  index?: number
): Promise<AssetFileResult> => {
  const originalData = getOutputData(output);

  let data = originalData;
  const isDataEmpty =
    data === null ||
    data === undefined ||
    (typeof data === "string" && data.trim() === "") ||
    (Array.isArray(data) && data.length === 0) ||
    (data instanceof Uint8Array && data.length === 0);

  const stringLooksLikeUrl =
    typeof data === "string" &&
    (data.startsWith("http://") || data.startsWith("https://"));

  const shouldFetchFromUri =
    typeof output?.uri === "string" &&
    (isDataEmpty || stringLooksLikeUrl || data === output);
  const shouldDownloadAsset =
    !shouldFetchFromUri &&
    typeof output?.asset_id === "string" &&
    (isDataEmpty || data === output);

  if (shouldFetchFromUri) {
    try {
      data = await fetchBinaryFromUri(output.uri);
    } catch (err) {
      log.warn("[createAssetFile] Failed to fetch data from URI", err);
      data = originalData ?? new Uint8Array();
    }
  } else if (shouldDownloadAsset) {
    try {
      const assetResponse = await client.GET("/api/assets/{id}", {
        params: { path: { id: output.asset_id } }
      });
      if (assetResponse.error) {
        const detail =
          assetResponse.error.detail?.[0]?.msg ||
          JSON.stringify(assetResponse.error);
        throw new Error(detail || "Failed to fetch asset metadata");
      }
      const downloadUrl = assetResponse.data?.get_url;
      if (downloadUrl) {
        data = await fetchBinaryFromUri(downloadUrl);
      } else {
        log.warn("[createAssetFile] asset metadata missing get_url");
      }
    } catch (err) {
      log.warn("[createAssetFile] Failed to download asset via API", err);
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
      content = toArrayBuffer(toUint8Array(data));
      filename = buildFilename(output?.filename, id, suffix, extension, index);
      break;
    }
    case "video": {
      mimeType = getMimeType(output, "video/mp4");
      const extension = getExtension(mimeType, "mp4");
      content = toArrayBuffer(toUint8Array(data));
      filename = buildFilename(output?.filename, id, suffix, extension, index);
      break;
    }
    case "audio": {
      mimeType = getMimeType(output, "audio/mp3");
      const extension = getExtension(mimeType, "mp3");
      content = toArrayBuffer(toUint8Array(data));
      filename = buildFilename(output?.filename, id, suffix, extension, index);
      break;
    }
    case "dataframe":
      content = convertDataFrameToCSV(data);
      mimeType = "text/csv";
      filename = buildFilename(output?.filename, id, suffix, "csv", index);
      break;
    case "object":
    case "array":
      content = JSON.stringify(data, null, 2);
      mimeType = "application/json";
      filename = buildFilename(output?.filename, id, suffix, "json", index);
      break;
    case "text":
      content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      mimeType = getMimeType(output, "text/plain");
      filename = buildFilename(
        output?.filename,
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
        output?.filename,
        id,
        suffix,
        getExtension(mimeType, "txt"),
        index
      );
  }

  const file = new File([content], filename, { type: mimeType });
  log.info("[createAssetFile] created file", {
    filename,
    mimeType,
    size: file.size,
    typeDetected: type ?? typeof output
  });

  return { file, filename, type: mimeType };
};

export const createAssetFile = async (
  output: any | any[],
  id: string,
  options?: CreateAssetFileOptions
): Promise<AssetFileResult[]> => {
  const normalized = normalizeOutput(output, options);

  if (Array.isArray(normalized)) {
    log.info("[createAssetFile] creating multiple asset files", {
      count: normalized.length
    });
    return Promise.all(
      normalized.map((item, index) => createSingleAssetFile(item, id, index))
    );
  }
  return Promise.all([createSingleAssetFile(normalized, id)]);
};
