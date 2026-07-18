/**
 * File browser API — binary download + local-file streaming.
 *
 * JSON operations (list, info) have been migrated to the tRPC `files` router.
 * This module retains the binary download endpoint plus a local-file streaming
 * endpoint used to preview files referenced by `file://` URIs (local/desktop
 * mode drops). The renderer can't load a raw `file://` URL under `webSecurity`,
 * so it points media elements at `/api/files/local?path=…` and the backend
 * streams the bytes off disk with HTTP Range support (needed for audio/video
 * seeking) — no reading in Electron, no data URIs.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  corsHeaders,
  nodeStreamToWebStream,
  parseRangeHeader
} from "./storage-api.js";

export interface FileApiOptions {
  /** Root directory for the file browser sandbox. Defaults to user home. */
  rootDir?: string;
}

function errorResponse(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/**
 * Resolve a user-provided path within the sandbox root.
 * Returns the resolved absolute path, or null if the path escapes the sandbox.
 */
async function resolveSandboxed(
  rootDir: string,
  userPath: string
): Promise<string | null> {
  const resolved = path.resolve(
    rootDir,
    userPath.startsWith("/") ? "." + userPath : userPath
  );
  const normalizedRoot = path.resolve(rootDir);
  const isContained = (p: string): boolean =>
    p === normalizedRoot || p.startsWith(normalizedRoot + path.sep);
  if (!isContained(resolved)) {
    return null;
  }

  // Resolve symlinks on the deepest existing ancestor and re-check containment:
  // a symlink that lives under the root but points outside it passes the lexical
  // prefix check yet resolves elsewhere. Mirrors the tRPC `files` router.
  let probe = resolved;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (!isContained(real)) {
        return null;
      }
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) break; // reached filesystem root without resolving
      probe = parent;
    }
  }
  return resolved;
}

async function handleDownload(url: URL, rootDir: string): Promise<Response> {
  const userPath = url.searchParams.get("path");
  if (!userPath) return errorResponse(400, "path parameter is required");

  const resolved = await resolveSandboxed(rootDir, userPath);
  if (!resolved) return errorResponse(403, "Path traversal not allowed");

  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return errorResponse(400, "Cannot download a directory");
    }
    const content = await fs.readFile(resolved);
    return new Response(content, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(content.byteLength)
      }
    });
  } catch {
    return errorResponse(404, "File not found");
  }
}

// ── Local-file streaming (/api/files/local) ─────────────────────────

const LOCAL_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json"
};

// Files that are never a legitimate part of a preview flow — refuse them even
// though this endpoint is dev/desktop-only. Mirrors the Electron main-process
// denylist so the two file-read surfaces stay consistent.
const SENSITIVE_HOME_ENTRIES = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".config/gcloud",
  ".netrc",
  ".pgpass",
  ".npmrc"
];

function isDeniedPath(resolved: string): boolean {
  const home = os.homedir();
  for (const entry of SENSITIVE_HOME_ENTRIES) {
    const forbidden = path.resolve(home, entry);
    if (resolved === forbidden || resolved.startsWith(forbidden + path.sep)) {
      return true;
    }
  }
  return false;
}

function localMimeType(filePath: string): string {
  return (
    LOCAL_MIME_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

async function handleLocalFileStream(
  request: Request,
  url: URL
): Promise<Response> {
  const userPath = url.searchParams.get("path");
  if (!userPath) return errorResponse(400, "path parameter is required");
  if (userPath.includes("\0")) return errorResponse(400, "Invalid path");

  const resolved = path.resolve(userPath);
  if (!path.isAbsolute(resolved)) {
    return errorResponse(400, "Path must be absolute");
  }
  if (isDeniedPath(resolved)) {
    return errorResponse(403, "Access to this path is not permitted");
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return errorResponse(404, "File not found");
  }
  if (stat.isDirectory()) {
    return errorResponse(400, "Cannot stream a directory");
  }

  const cors = corsHeaders(request);
  const contentType = localMimeType(resolved);
  const fileSize = stat.size;
  const lastModified = stat.mtime.toUTCString();

  if (request.method === "HEAD") {
    return new Response(null, {
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

  const rangeHeader = request.headers.get("Range");
  const range = rangeHeader
    ? parseRangeHeader(rangeHeader, fileSize)
    : null;
  // "unsatisfiable" → 416; an unparseable/unsupported header (null with a header
  // present) is ignored and the full file served with 200, per RFC 7233.
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
    const body = nodeStreamToWebStream(resolved, { start, end });
    return new Response(body, {
      status: 206,
      headers: {
        ...cors,
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Last-Modified": lastModified,
        "Accept-Ranges": "bytes"
      }
    });
  }

  const body = nodeStreamToWebStream(resolved);
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

/**
 * Handle file browser binary requests.
 * Routes:
 *   /api/files/download — sandboxed binary download (octet-stream, no Range)
 *   /api/files/local    — stream a local file by absolute path (Range-capable)
 *
 * JSON ops (list, info) have moved to the tRPC `files` router.
 */
export async function handleFileRequest(
  request: Request,
  options: FileApiOptions = {}
): Promise<Response> {
  // File browser exposes the local filesystem — disabled in production
  if (process.env["NODETOOL_ENV"] === "production") {
    return errorResponse(403, "File browser is disabled in production");
  }

  const rootDir = options.rootDir ?? os.homedir();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname === "/api/files/download") {
    if (request.method !== "GET") {
      return errorResponse(405, "Method not allowed");
    }
    return handleDownload(url, rootDir);
  }

  if (pathname === "/api/files/local") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(405, "Method not allowed");
    }
    return handleLocalFileStream(request, url);
  }

  return errorResponse(404, "Not found");
}
