/**
 * Storage REST API — binary GET/HEAD only.
 * JSON ops (list, metadata, delete) have moved to the tRPC `storage` router.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path, { extname } from "node:path";
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { assetKeyOwner } from "@nodetool-ai/storage";
import { resolveAllowedOrigin } from "./cors.js";
import {
  callerOwnsStorageKey,
  canReadStorageKey
} from "./lib/storage-access.js";
import { isString } from "./lib/wire-values.js";

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
  ".gltf": "model/gltf+json",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  // SVG must be image/svg+xml so the asset grid and fullscreen <img> can
  // paint it. A sandbox CSP on the response (see svgSafeHeaders) stops a
  // script inside the file from running if the URL is opened as a document.
  ".svg": "image/svg+xml",
  // User-authored HTML stays text/plain so it cannot execute in this origin.
  ".html": "text/plain",
  ".htm": "text/plain"
};

const SVG_MIME = "image/svg+xml";

/**
 * Extra headers for SVG responses. `<img>` and CSS backgrounds never run
 * script; these apply when the URL is navigated to or framed.
 */
const SVG_SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; sandbox"
} satisfies Record<string, string>;

function extraHeadersFor(contentType: string): Record<string, string> {
  return contentType === SVG_MIME ? SVG_SAFE_HEADERS : {};
}

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
const BASE_CORS_HEADERS = {
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Content-Type, Accept-Ranges, Last-Modified",
  Vary: "Origin"
} satisfies Record<string, string>;

export function corsHeaders(request: Request) {
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

/**
 * The pre-prefix key an owner-prefixed asset key used to live at, or null for
 * a key that already has no prefix.
 */
function legacyKeyFor(key: string): string | null {
  const normalized = key.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  if (slash <= 0) return null;
  const base = normalized.slice(slash + 1);
  return base && base !== normalized ? base : null;
}

/**
 * 3D models used to be stored as `.bin`. Swap `.glb`/`.gltf` ↔ `.bin` so a
 * new get_url still finds the old object.
 */
function alternateModel3DKey(key: string): string | null {
  if (key.endsWith(".glb") || key.endsWith(".gltf")) {
    return key.replace(/\.(glb|gltf)$/, ".bin");
  }
  if (key.endsWith(".bin")) {
    return key.slice(0, -4) + ".glb";
  }
  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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
        if (isString(chunk)) {
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

  if (request.method !== "GET" && request.method !== "HEAD") {
    // Read-only surface. PUT used to write any key, which — with a shared
    // storage directory keyed only by asset id — let one tenant overwrite
    // another's asset bytes. Nothing ever called it: bytes are written
    // in-process through the storage adapter (asset upload, workflow
    // outputs), never over HTTP. DELETE moved to tRPC `storage.delete`.
    return new Response(JSON.stringify({ detail: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "content-type": "application/json" }
    });
  }

  // The storage directory is one flat bucket, so the key alone says nothing
  // about who owns the bytes. 404 rather than 403 on a foreign key: the
  // caller shouldn't learn which asset ids exist.
  const userId = request.headers.get("x-user-id") ?? "1";
  if (!(await canReadStorageKey(userId, key))) {
    return new Response(JSON.stringify({ detail: "Not found" }), {
      status: 404,
      headers: { ...cors, "content-type": "application/json" }
    });
  }

  let filePath = resolveStoragePath(rootDir, key);

  // Flat asset references (e.g. `asset://<id>.png` → `/api/storage/<id>.png`)
  // are legacy; the current layout is owner-prefixed (`<user>/<id>.png`).
  // For a flat key owned by the caller, prefer the prefixed object when it
  // exists so `asset://` markdown images resolve without a 404. The local
  // backend needs both directions — cloud backends do this via the URL
  // builder and `nodetool storage migrate-keys`.
  if (assetKeyOwner(key) === null) {
    if (await callerOwnsStorageKey(userId, key)) {
      const prefixedKey = `${userId}/${key}`;
      const prefixedPath = resolveStoragePath(rootDir, prefixedKey);
      if (await pathExists(prefixedPath)) {
        filePath = prefixedPath;
      }
    }
  }

  // Objects written before the owner-prefixed layout are flat. Fall back to
  // the legacy path when the prefixed one is missing, re-checking ownership
  // against the `assets` row since the prefix no longer vouches for it. Only
  // the local backend needs this — cloud backends resolve through the URL
  // builder, so they require `nodetool storage migrate-keys`.
  const legacy = assetKeyOwner(key) === userId ? legacyKeyFor(key) : null;
  if (legacy && !(await pathExists(filePath))) {
    if (await callerOwnsStorageKey(userId, legacy)) {
      filePath = resolveStoragePath(rootDir, legacy);
    }
  }

  if (!(await pathExists(filePath))) {
    const alt = alternateModel3DKey(key);
    if (alt) {
      const altPath = resolveStoragePath(rootDir, alt);
      if (await pathExists(altPath)) {
        filePath = altPath;
      }
    }
  }

  // HEAD
  if (request.method === "HEAD") {
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      return new Response(null, { status: 404, headers: cors });
    }
    const headType = getMimeType(filePath);
    return new Response(null, {
      status: 200,
      headers: {
        ...cors,
        ...extraHeadersFor(headType),
        "Last-Modified": fileStat.mtime.toUTCString(),
        "Content-Length": String(fileStat.size),
        "Content-Type": headType,
        "Accept-Ranges": "bytes"
      }
    });
  }

  // GET
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
  const range = rangeHeader ? parseRangeHeader(rangeHeader, fileSize) : null;
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
        ...extraHeadersFor(contentType),
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
      ...extraHeadersFor(contentType),
      "Content-Type": contentType,
      "Content-Length": String(fileSize),
      "Last-Modified": lastModified,
      "Accept-Ranges": "bytes"
    }
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
