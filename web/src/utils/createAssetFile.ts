import log from "loglevel";
import type { Chunk } from "../stores/ApiTypes";

interface AssetFileResult {
  file: File;
  filename: string;
  type: string;
}

const TEXT_ENCODER = new TextEncoder();

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
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
  } catch {
    // ignore Buffer fallback errors
  }

  return TEXT_ENCODER.encode(value);
};

const toUint8Array = (input: any): Uint8Array => {
  if (!input) return new Uint8Array();
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

const isChunk = (value: any): value is Chunk =>
  value && typeof value === "object" && value.type === "chunk";

const chunkToOutput = (chunk: Chunk) => {
  switch (chunk.content_type) {
    case "text":
      return { type: "text", data: chunk.content ?? "" };
    case "image":
    case "audio":
    case "video":
      return { type: chunk.content_type, data: chunk.content ?? chunk.data };
    default:
      return chunk.content ?? chunk;
  }
};

const normalizeOutput = (output: any): any => {
  if (Array.isArray(output)) {
    if (output.length > 0 && output.every((item) => isChunk(item))) {
      const chunks = output as Chunk[];
      const textChunks = chunks.filter((chunk) => chunk.content_type === "text");
      if (textChunks.length === chunks.length) {
        return {
          type: "text",
          data: textChunks.map((chunk) => chunk.content ?? "").join("")
        };
      }
      return chunks.map((chunk) => normalizeOutput(chunk));
    }
    return output.map((item) => normalizeOutput(item));
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
    const { data, value, content, uri } = output as Record<string, any>;
    return data ?? value ?? content ?? uri ?? output;
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

const createSingleAssetFile = (
  output: any,
  id: string,
  index?: number
): AssetFileResult => {
  const type = getOutputType(output);
  const data = getOutputData(output);

  let content: BlobPart;
  let filename: string;
  let mimeType: string;

  const suffix = index !== undefined ? `_${index}` : "";

  switch (type) {
    case "image": {
      mimeType = getMimeType(output, "image/png");
      const extension = getExtension(mimeType, "png");
      content = toUint8Array(data);
      filename = buildFilename(output?.filename, id, suffix, extension, index);
      break;
    }
    case "video": {
      mimeType = getMimeType(output, "video/mp4");
      const extension = getExtension(mimeType, "mp4");
      content = toUint8Array(data);
      filename = buildFilename(output?.filename, id, suffix, extension, index);
      break;
    }
    case "audio": {
      mimeType = getMimeType(output, "audio/mp3");
      const extension = getExtension(mimeType, "mp3");
      content = toUint8Array(data);
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
  log.info(`Created file for type: ${type ?? typeof output}`);

  return { file, filename, type: mimeType };
};

export const createAssetFile = (
  output: any | any[],
  id: string
): AssetFileResult[] => {
  const normalized = normalizeOutput(output);

  if (Array.isArray(normalized)) {
    log.info("Creating multiple asset files");
    return normalized.map((item, index) =>
      createSingleAssetFile(item, id, index)
    );
  }
  return [createSingleAssetFile(normalized, id)];
};
