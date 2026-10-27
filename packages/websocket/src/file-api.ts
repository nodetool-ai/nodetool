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
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import {
  INLINE_USER_FILE_MIME_OVERRIDES,
  mimeTypeForPath
} from "@nodetool-ai/protocol";
import { corsHeaders, parseRangeHeader } from "./storage-api.js";
import { streamedResponse } from "./lib/bridge.js";
import {
  localPathDenialMessage,
  resolveLocalPath
} from "./lib/local-file-access.js";

function errorResponse(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

// ── Local-file streaming (/api/files/local) ─────────────────────────

/**
 * Script restrictions for SVG. This route answers on the API's own origin, and
 * the local trust check takes a same-origin page for the user's own UI, so a
 * script inside a file from `~/Downloads` must never run here.
 */
const SVG_SAFE_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'"
};

async function handleLocalFileStream(
  request: Request,
  url: URL
): Promise<Response> {
  const userPath = url.searchParams.get("path");
  if (!userPath) return errorResponse(400, "path parameter is required");

  // Allowlist, not denylist: the path must resolve inside a configured root
  // (home by default), both lexically and after symlinks. Same policy the
  // tRPC file browser applies — see lib/local-file-access.ts.
  const allowed = await resolveLocalPath(userPath);
  if (!allowed.ok) {
    const status = allowed.reason === "invalid" ? 400 : 403;
    return errorResponse(status, localPathDenialMessage(allowed.reason));
  }
  const resolved = allowed.path;

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
  const contentType = mimeTypeForPath(resolved, INLINE_USER_FILE_MIME_OVERRIDES);
  const safety = contentType === "image/svg+xml" ? SVG_SAFE_HEADERS : {};
  const fileSize = stat.size;
  const lastModified = stat.mtime.toUTCString();

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        ...cors,
        ...safety,
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Last-Modified": lastModified,
        "Accept-Ranges": "bytes"
      }
    });
  }

  const rangeHeader = request.headers.get("Range");
  const range = rangeHeader ? parseRangeHeader(rangeHeader, fileSize) : null;
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
    return streamedResponse(createReadStream(resolved, { start, end }), {
      status: 206,
      headers: {
        ...cors,
        ...safety,
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Last-Modified": lastModified,
        "Accept-Ranges": "bytes"
      }
    });
  }

  return streamedResponse(createReadStream(resolved), {
    status: 200,
    headers: {
      ...cors,
      ...safety,
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
 *   /api/files/local — stream a local file by absolute path (Range-capable)
 *
 * JSON ops (list, info) have moved to the tRPC `files` router.
 */
export async function handleFileRequest(request: Request): Promise<Response> {
  // File browser exposes the local filesystem — disabled in production
  if (process.env["NODETOOL_ENV"] === "production") {
    return errorResponse(403, "File browser is disabled in production");
  }

  const url = new URL(request.url);
  // A loop, not `/\/+$/`: the regex backtracks quadratically on a long slash
  // run followed by another character.
  let end = url.pathname.length;
  while (end > 0 && url.pathname[end - 1] === "/") end -= 1;
  const pathname = url.pathname.slice(0, end);

  if (pathname === "/api/files/local") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(405, "Method not allowed");
    }
    return handleLocalFileStream(request, url);
  }

  return errorResponse(404, "Not found");
}
