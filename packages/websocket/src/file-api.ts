/**
 * File browser API — T-WS-9.
 *
 * Provides read-only filesystem browsing within a sandboxed root directory.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export interface FileApiOptions {
  /** Root directory for the file browser sandbox. Defaults to user home. */
  rootDir?: string;
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, { status });
}

/**
 * Resolve a user-provided path within the sandbox root.
 * Returns the resolved absolute path, or null if the path escapes the sandbox.
 */
function resolveSandboxed(rootDir: string, userPath: string): string | null {
  // Normalize the user path — join with root and resolve
  const resolved = path.resolve(rootDir, userPath.startsWith("/") ? "." + userPath : userPath);
  // Ensure the resolved path is within or equal to rootDir
  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    return null;
  }
  return resolved;
}

async function handleList(url: URL, rootDir: string): Promise<Response> {
  const userPath = url.searchParams.get("path");
  if (!userPath) return errorResponse(400, "path parameter is required");

  const resolved = resolveSandboxed(rootDir, userPath);
  if (!resolved) return errorResponse(403, "Path traversal not allowed");

  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(resolved, entry.name);
        let size = 0;
        let modifiedAt = "";
        try {
          const stat = await fs.stat(fullPath);
          size = stat.size;
          modifiedAt = stat.mtime.toISOString();
        } catch {
          // stat may fail for broken symlinks etc.
        }
        return {
          name: entry.name,
          size,
          is_dir: entry.isDirectory(),
          modified_at: modifiedAt,
        };
      })
    );
    return jsonResponse(results);
  } catch {
    return errorResponse(404, "Directory not found");
  }
}

async function handleInfo(url: URL, rootDir: string): Promise<Response> {
  const userPath = url.searchParams.get("path");
  if (!userPath) return errorResponse(400, "path parameter is required");

  const resolved = resolveSandboxed(rootDir, userPath);
  if (!resolved) return errorResponse(403, "Path traversal not allowed");

  try {
    const stat = await fs.stat(resolved);
    return jsonResponse({
      name: path.basename(resolved),
      size: stat.size,
      is_dir: stat.isDirectory(),
      modified_at: stat.mtime.toISOString(),
    });
  } catch {
    return errorResponse(404, "File not found");
  }
}

async function handleDownload(url: URL, rootDir: string): Promise<Response> {
  const userPath = url.searchParams.get("path");
  if (!userPath) return errorResponse(400, "path parameter is required");

  const resolved = resolveSandboxed(rootDir, userPath);
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
        "content-length": String(content.byteLength),
      },
    });
  } catch {
    return errorResponse(404, "File not found");
  }
}

/**
 * Handle file browser API requests.
 * Routes: /api/files/list, /api/files/info, /api/files/download
 */
export async function handleFileRequest(
  request: Request,
  options: FileApiOptions = {}
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const rootDir = options.rootDir ?? os.homedir();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname === "/api/files/list") {
    return handleList(url, rootDir);
  }
  if (pathname === "/api/files/info") {
    return handleInfo(url, rootDir);
  }
  if (pathname === "/api/files/download") {
    return handleDownload(url, rootDir);
  }

  return errorResponse(404, "Not found");
}
