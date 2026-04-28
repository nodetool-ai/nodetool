/**
 * Workspace API — REST handler for the binary file-download endpoint only.
 *
 * `GET /api/workspaces/:id/download/:path` stays on REST because tRPC's JSON
 * link does not carry binary payloads. All CRUD + listFiles (JSON) endpoints
 * moved to the tRPC `workspace` router.
 */

import { readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { Workspace } from "@nodetool/models";
import type { HttpApiOptions } from "./http-api.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

function getUserId(request: Request, headerName = "x-user-id"): string {
  return (
    request.headers.get(headerName) ?? request.headers.get("x-user-id") ?? "1"
  );
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

// Lookup helper for content-type guessing
function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    txt: "text/plain",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    wav: "audio/wav",
    csv: "text/csv",
    xml: "application/xml",
    md: "text/markdown",
    py: "text/x-python",
    ts: "text/typescript"
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Handle GET /api/workspaces/:id/download/:path (binary file download).
 * Returns `null` for any non-matching path so callers can fall through.
 */
export async function handleWorkspaceRequest(
  request: Request,
  options: HttpApiOptions
): Promise<Response | null> {
  // Workspaces browse the local filesystem — disabled in production
  if (process.env["NODETOOL_ENV"] === "production") {
    return errorResponse(403, "Workspaces are disabled in production");
  }

  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  const downloadMatch = pathname.match(
    /^\/api\/workspaces\/([^/]+)\/download\/(.+)$/
  );
  if (!downloadMatch) return null;

  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const wsId = decodeURIComponent(downloadMatch[1]);
  const filePath = decodeURIComponent(downloadMatch[2]);
  const workspace = await Workspace.find(userId, wsId);
  if (!workspace) return errorResponse(404, "Workspace not found");

  if (filePath.startsWith("/")) {
    return errorResponse(400, "Absolute paths not allowed");
  }

  const workspacePath = resolve(workspace.path);
  const resolvedFile = resolve(join(workspacePath, filePath));

  // Path traversal check
  if (!resolvedFile.startsWith(workspacePath)) {
    return errorResponse(403, "Path traversal not allowed");
  }

  try {
    const data = await readFile(resolvedFile);
    const contentType = guessContentType(basename(resolvedFile));
    return new Response(data, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${basename(resolvedFile)}"`
      }
    });
  } catch {
    return errorResponse(404, "File not found");
  }
}
