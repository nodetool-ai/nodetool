/**
 * Storage route handlers for the NodeTool worker.
 *
 * Provides typed handler functions (not framework-specific) for:
 * 1. Admin storage (full CRUD operations)
 * 2. Public storage (read-only access)
 *
 * The caller is responsible for wiring these into their HTTP framework
 * (Express, Fastify, etc.) and applying auth middleware.
 */

import { extname } from "path";

/** Common content-type mappings by file extension. */
const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  pdf: "application/pdf",
  json: "application/json",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  xml: "application/xml",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip"
};

/** Minimal storage interface expected by the route handlers. */
export interface StorageBackend {
  fileExists(key: string): Promise<boolean>;
  getMtime(key: string): Promise<Date | null>;
  getSize(key: string): Promise<number>;
  download(key: string): Promise<Uint8Array>;
  downloadStream(key: string): AsyncIterable<Uint8Array>;
  upload(key: string, data: Uint8Array | Buffer): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Structured HTTP-like response returned by handler functions. */
export interface HandlerResponse {
  status: number;
  headers: Record<string, string>;
  body?: Uint8Array | AsyncIterable<Uint8Array> | null;
}

/** Minimal request info the handlers need. */
export interface HandlerRequest {
  headers: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Key validation
// ---------------------------------------------------------------------------

/**
 * Validate and normalize a storage key, preventing traversal while allowing
 * nested prefixes.
 *
 * @returns The normalized key (POSIX-style separators).
 * @throws Error if validation fails (caller should map to HTTP 400).
 */
export function validateKey(key: string): string {
  const normalized = key.replace(/\\/g, "/");

  const parts = normalized
    .split("/")
    .filter((part) => part !== "" && part !== ".");

  if (parts.length === 0) {
    throw new Error("Invalid key: key must not be empty");
  }

  if (normalized.startsWith("/")) {
    throw new Error("Invalid key: absolute paths are not allowed");
  }

  if (parts.some((part) => part === "..")) {
    throw new Error("Invalid key: path traversal is not allowed");
  }

  return parts.join("/");
}

// ---------------------------------------------------------------------------
// Shared handler implementations
// ---------------------------------------------------------------------------

/**
 * Return file metadata (HEAD request).
 */
export async function headFile(
  storage: StorageBackend,
  key: string
): Promise<HandlerResponse> {
  const safeKey = validateKey(key);

  if (!(await storage.fileExists(safeKey))) {
    return { status: 404, headers: {} };
  }

  const lastModified = await storage.getMtime(safeKey);
  if (!lastModified) {
    return { status: 404, headers: {} };
  }

  return {
    status: 200,
    headers: {
      "Last-Modified": lastModified.toUTCString()
    }
  };
}

/**
 * Return a file as a stream with range support (GET request).
 */
export async function getFile(
  storage: StorageBackend,
  key: string,
  request: HandlerRequest
): Promise<HandlerResponse> {
  const safeKey = validateKey(key);

  if (!(await storage.fileExists(safeKey))) {
    return { status: 404, headers: {} };
  }

  const lastModified = await storage.getMtime(safeKey);
  if (!lastModified) {
    return { status: 404, headers: {} };
  }

  // If-Modified-Since handling
  const ifModifiedSince = request.headers["if-modified-since"];
  if (ifModifiedSince) {
    const ifModifiedDate = new Date(ifModifiedSince);
    if (!isNaN(ifModifiedDate.getTime()) && ifModifiedDate >= lastModified) {
      return { status: 304, headers: {} };
    }
  }

  const ext = extname(safeKey).slice(1);
  const mediaType =
    EXTENSION_TO_CONTENT_TYPE[ext] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Last-Modified": lastModified.toUTCString(),
    "Accept-Ranges": "bytes",
    "Content-Type": mediaType
  };

  // Range request handling
  const rangeHeader = request.headers["range"];
  if (rangeHeader) {
    const rangeMatch = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const data = await storage.download(safeKey);
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : data.length - 1;

      headers["Content-Range"] = `bytes ${start}-${end}/${data.length}`;
      headers["Content-Length"] = String(end - start + 1);

      return {
        status: 206,
        headers,
        body: data.slice(start, end + 1)
      };
    }
    // If range is invalid, fall through to full content
  }

  const size = await storage.getSize(safeKey);
  headers["Content-Length"] = String(size);

  return {
    status: 200,
    headers,
    body: storage.downloadStream(safeKey)
  };
}

/**
 * Upload or update a file (PUT request).
 */
export async function putFile(
  storage: StorageBackend,
  key: string,
  data: Uint8Array | Buffer
): Promise<HandlerResponse> {
  const safeKey = validateKey(key);
  await storage.upload(safeKey, data);
  return { status: 200, headers: {}, body: null };
}

/**
 * Delete a file (DELETE request).
 */
export async function deleteFile(
  storage: StorageBackend,
  key: string
): Promise<HandlerResponse> {
  const safeKey = validateKey(key);

  if (!(await storage.fileExists(safeKey))) {
    return { status: 404, headers: {} };
  }

  await storage.delete(safeKey);
  return { status: 204, headers: {} };
}
