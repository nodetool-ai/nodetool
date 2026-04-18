/**
 * File browser API — T-WS-9 (binary download only).
 *
 * JSON operations (list, info) have been migrated to the tRPC `files` router.
 * This module retains only the binary download endpoint.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

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
function resolveSandboxed(rootDir: string, userPath: string): string | null {
  const resolved = path.resolve(
    rootDir,
    userPath.startsWith("/") ? "." + userPath : userPath
  );
  const normalizedRoot = path.resolve(rootDir);
  if (
    !resolved.startsWith(normalizedRoot + path.sep) &&
    resolved !== normalizedRoot
  ) {
    return null;
  }
  return resolved;
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
        "content-length": String(content.byteLength)
      }
    });
  } catch {
    return errorResponse(404, "File not found");
  }
}

/**
 * Handle file browser binary download requests.
 * Route: /api/files/download
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

  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const rootDir = options.rootDir ?? os.homedir();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname === "/api/files/download") {
    return handleDownload(url, rootDir);
  }

  return errorResponse(404, "Not found");
}
