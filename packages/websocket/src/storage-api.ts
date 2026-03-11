import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path, { extname } from "node:path";

// ── MIME types ────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

// ── Key validation ────────────────────────────────────────────────

function validateStorageKey(key: string): string | null {
  if (!key) return "Key is required";
  if (key.startsWith("/")) return "Key must not be absolute path";
  const parts = key.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) return "Key must not contain path traversal";
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

function parseRangeHeader(rangeHeader: string, fileSize: number): ParsedRange | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];

  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // suffix range: bytes=-500
    const suffixLength = Number.parseInt(endStr, 10);
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
    return null;
  }

  if (start > end || end >= fileSize || start < 0) return null;
  return { start, end };
}

// ── Node.js ReadableStream wrapper around fs.createReadStream ─────

function nodeStreamToWebStream(
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
    },
  });
}

// ── Per-store handler ─────────────────────────────────────────────

async function handleStorageRequest(
  request: Request,
  rootDir: string,
  key: string
): Promise<Response> {
  const validationError = validateStorageKey(key);
  if (validationError) {
    return new Response(JSON.stringify({ detail: validationError }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const filePath = resolveStoragePath(rootDir, key);

  // HEAD
  if (request.method === "HEAD") {
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(filePath);
    } catch {
      return new Response(null, { status: 404 });
    }
    return new Response(null, {
      status: 200,
      headers: {
        "Last-Modified": fileStat.mtime.toUTCString(),
        "Content-Length": String(fileStat.size),
        "Content-Type": getMimeType(filePath),
      },
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
        headers: { "content-type": "application/json" },
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
      if (!Number.isNaN(ifModifiedSinceDate.getTime()) && mtime <= ifModifiedSinceDate) {
        return new Response(null, { status: 304 });
      }
    }

    // Range request
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, fileSize);
      if (!range) {
        return new Response(JSON.stringify({ detail: "Range Not Satisfiable" }), {
          status: 416,
          headers: {
            "content-type": "application/json",
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const body = nodeStreamToWebStream(filePath, { start, end });
      return new Response(body as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Last-Modified": lastModified,
          "Accept-Ranges": "bytes",
        },
      });
    }

    // Full file
    const body = nodeStreamToWebStream(filePath);
    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Last-Modified": lastModified,
        "Accept-Ranges": "bytes",
      },
    });
  }

  // PUT
  if (request.method === "PUT") {
    await mkdir(path.dirname(filePath), { recursive: true });
    const bodyBuffer = await request.arrayBuffer();
    await writeFile(filePath, Buffer.from(bodyBuffer));
    return new Response(null, { status: 200 });
  }

  // DELETE
  if (request.method === "DELETE") {
    try {
      await stat(filePath);
    } catch {
      return new Response(JSON.stringify({ detail: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    await unlink(filePath);
    return new Response(null, { status: 200 });
  }

  return new Response(JSON.stringify({ detail: "Method not allowed" }), {
    status: 405,
    headers: { "content-type": "application/json" },
  });
}

// ── Public API ────────────────────────────────────────────────────

export interface StorageHandlerOptions {
  storagePath?: string;
  tempStoragePath?: string;
}

export function createStorageHandler(
  opts?: StorageHandlerOptions
): (request: Request) => Promise<Response> {
  const storagePath =
    process.env.ASSET_FOLDER ??
    opts?.storagePath ??
    process.env.STORAGE_PATH ??
    path.join(os.homedir(), ".local", "share", "nodetool", "assets");

  const tempStoragePath =
    opts?.tempStoragePath ??
    process.env.TEMP_STORAGE_PATH ??
    path.join(os.tmpdir(), "nodetool", "temp");

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const TEMP_PREFIX = "/api/storage/temp/";
    const PERM_PREFIX = "/api/storage/";

    if (pathname.startsWith(TEMP_PREFIX)) {
      const key = decodeURIComponent(pathname.slice(TEMP_PREFIX.length));
      return handleStorageRequest(request, tempStoragePath, key);
    }

    if (pathname.startsWith(PERM_PREFIX)) {
      const key = decodeURIComponent(pathname.slice(PERM_PREFIX.length));
      return handleStorageRequest(request, storagePath, key);
    }

    return new Response(JSON.stringify({ detail: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
}
