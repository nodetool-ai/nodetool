/**
 * Storage REST API — binary PUT/GET/HEAD only.
 * JSON ops (list, metadata, delete) have moved to the tRPC `storage` router.
 */
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path, { extname } from "node:path";
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { getMaxUploadBytes } from "@nodetool-ai/storage";
import { resolveAllowedOrigin } from "./cors.js";

// ── MIME types ────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  // Serve user-authored HTML as text/plain — never image/svg+xml-style inline
  // rendering — so a stored `.html` asset can't execute script in the app's
  // origin. `.svg` is deliberately omitted for the same reason (falls through
  // to application/octet-stream).
  ".html": "text/plain",
  ".htm": "text/plain"
};

function getMimeType(filePath: string): string {
  return (
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

// ── Cross-origin headers ──────────────────────────────────────────
//
// Asset URLs returned by the storage endpoint are designed to be embedded
// from other origins — MCP App iframes (which often set
// `Cross-Origin-Embedder-Policy: require-corp`), the Electron renderer, and
// external preview/MCP clients. `Cross-Origin-Resource-Policy: cross-origin`
// is what actually lets `<img>`/`<video>`/`<audio>` load into COEP-enabled
// documents, so it stays unconditional. The `Access-Control-Allow-Origin`
// header (needed only for `fetch`/XHR reads) is no longer a blanket `*`:
// it reflects the request origin only when that origin is allow-listed
// (see ./cors.ts), so a hostile page can't script-read asset bytes. These
// headers are attached here, in addition to the global `fastifyCors`
// plugin, so they ride every binary response through the Web API → Fastify
// bridge.
const BASE_CORS_HEADERS: Record<string, string> = {
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Content-Type, Accept-Ranges, Last-Modified",
  Vary: "Origin"
};

export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { ...BASE_CORS_HEADERS };
  const allowed = resolveAllowedOrigin(request.headers.get("Origin"));
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    headers["Timing-Allow-Origin"] = allowed;
  }
  return headers;
}

// ── Key validation ────────────────────────────────────────────────

function validateStorageKey(key: string): string | null {
  if (!key) return "Key is required";
  if (key.startsWith("/")) return "Key must not be absolute path";
  const parts = key
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === ".."))
    return "Key must not contain path traversal";
  return null; // valid
}

function resolveStoragePath(rootDir: string, key: string): string {
  const normalized = key
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== ".")
    .join("/");
  return path.join(rootDir, normalized);
}

// ── Range header parsing ──────────────────────────────────────────

interface ParsedRange {
  start: number;
  end: number;
}

/**
 * Parse a single-range `Range` header per RFC 7233. Returns:
 *  - a `ParsedRange` (end clamped to the last byte) when satisfiable,
 *  - `"unsatisfiable"` when the syntax is valid but the first byte is out of
 *    bounds (caller answers 416),
 *  - `null` when the header is unparseable/unsupported (a non-`bytes=` unit, a
 *    multi-range list, or malformed) — the caller must IGNORE it and serve the
 *    full 200 representation, not answer 416.
 */
export function parseRangeHeader(
  rangeHeader: string,
  fileSize: number
): ParsedRange | "unsatisfiable" | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null; // unparseable / multi-range / other unit → ignore
  const startStr = match[1];
  const endStr = match[2];

  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // suffix range: bytes=-500
    const suffixLength = Number.parseInt(endStr, 10);
    if (suffixLength === 0) return "unsatisfiable"; // zero-length suffix
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (startStr !== "" && endStr === "") {
    // open-ended range: bytes=500-
    start = Number.parseInt(startStr, 10);
    end = fileSize - 1;
  } else if (startStr !== "" && endStr !== "") {
    start = Number.parseInt(startStr, 10);
    end = Number.parseInt(endStr, 10);
  } else {
    return null; // "bytes=-" — neither bound present
  }

  // A last-byte-pos past EOF is clamped to the remainder (RFC 7233 §2.1), not
  // rejected. Only a first-byte-pos out of bounds is unsatisfiable.
  end = Math.min(end, fileSize - 1);
  if (start < 0 || start >= fileSize || start > end) return "unsatisfiable";
  return { start, end };
}

// ── Node.js ReadableStream wrapper around fs.createReadStream ─────

export function nodeStreamToWebStream(
  filePath: string,
  options?: { start?: number; end?: number }
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, options);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        if (typeof chunk === "string") {
          controller.enqueue(Buffer.from(chunk));
        } else {
          controller.enqueue(chunk);
        }
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    }
  });
}

// ── Per-store handler ─────────────────────────────────────────────

async function handleStorageRequest(
  request: Request,
  rootDir: string,
  key: string
): Promise<Response> {
  const cors = corsHeaders(request);
  const validationError = validateStorageKey(key);
  if (validationError) {
    return new Response(JSON.stringify({ detail: validationError }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" }
    });
  }

  const filePath = resolveStoragePath(rootDir, key);

  // HEAD
  if (request.method === "HEAD") {
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      return new Response(null, { status: 404, headers: cors });
    }
    return new Response(null, {
      status: 200,
      headers: {
        ...cors,
        "Last-Modified": fileStat.mtime.toUTCString(),
        "Content-Length": String(fileStat.size),
        "Content-Type": getMimeType(filePath),
        "Accept-Ranges": "bytes"
      }
    });
  }

  // GET
  if (request.method === "GET") {
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      return new Response(JSON.stringify({ detail: "Not found" }), {
        status: 404,
        headers: { ...cors, "content-type": "application/json" }
      });
    }

    const mtime = fileStat.mtime;
    const lastModified = mtime.toUTCString();
    const fileSize = fileStat.size;
    const contentType = getMimeType(filePath);

    // If-Modified-Since check
    const ifModifiedSince = request.headers.get("If-Modified-Since");
    if (ifModifiedSince) {
      const ifModifiedSinceDate = new Date(ifModifiedSince);
      if (
        !Number.isNaN(ifModifiedSinceDate.getTime()) &&
        mtime <= ifModifiedSinceDate
      ) {
        return new Response(null, { status: 304, headers: cors });
      }
    }

    // Range request
    const rangeHeader = request.headers.get("Range");
    const range = rangeHeader
      ? parseRangeHeader(rangeHeader, fileSize)
      : null;
    // A parsed-but-unsatisfiable range → 416. An unparseable/unsupported header
    // (range === null while a header was present) is ignored and the full file
    // is served with 200, per RFC 7233.
    if (range === "unsatisfiable") {
      return new Response(JSON.stringify({ detail: "Range Not Satisfiable" }), {
        status: 416,
        headers: {
          ...cors,
          "content-type": "application/json",
          "Content-Range": `bytes */${fileSize}`
        }
      });
    }
    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const body = nodeStreamToWebStream(filePath, { start, end });
      return new Response(body, {
        status: 206,
        headers: {
          ...cors,
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Last-Modified": lastModified,
          "Accept-Ranges": "bytes"
        }
      });
    }

    // Full file
    const body = nodeStreamToWebStream(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Last-Modified": lastModified,
        "Accept-Ranges": "bytes"
      }
    });
  }

  // PUT
  if (request.method === "PUT") {
    const max = getMaxUploadBytes();
    const tooLarge = (size: number): Response =>
      new Response(
        JSON.stringify({
          detail:
            `Upload exceeds maximum size: ${size} > ${max} bytes ` +
            `(set NODETOOL_MAX_UPLOAD_BYTES to raise the limit)`
        }),
        {
          status: 413,
          headers: { ...cors, "content-type": "application/json" }
        }
      );

    // Reject before buffering when the client declares an over-limit size, so a
    // huge PUT can't force the server to allocate the whole body first.
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > max) {
      return tooLarge(declaredLength);
    }

    // Fall back to a post-read check for chunked bodies with no Content-Length.
    const bodyBuffer = await request.arrayBuffer();
    if (bodyBuffer.byteLength > max) {
      return tooLarge(bodyBuffer.byteLength);
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(bodyBuffer));
    return new Response(null, { status: 200, headers: cors });
  }

  return new Response(JSON.stringify({ detail: "Method not allowed" }), {
    status: 405,
    headers: { ...cors, "content-type": "application/json" }
  });
}

// ── Public API ────────────────────────────────────────────────────

export interface StorageHandlerOptions {
  storagePath?: string;
}

export function createStorageHandler(
  opts?: StorageHandlerOptions
): (request: Request) => Promise<Response> {
  const storagePath = opts?.storagePath ?? getDefaultAssetsPath();

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const PERM_PREFIX = "/api/storage/";

    // All storage requests (including temp/) are served from the assets root.
    // temp/ files are stored as assets/temp/{uuid}.ext by the FileStorageAdapter.
    if (pathname.startsWith(PERM_PREFIX)) {
      const key = decodeURIComponent(pathname.slice(PERM_PREFIX.length));
      return handleStorageRequest(request, storagePath, key);
    }

    return new Response(JSON.stringify({ detail: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  };
}
