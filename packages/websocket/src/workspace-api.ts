/**
 * Workspace API — REST handler for the binary file-download endpoint only.
 *
 * `GET /api/workspaces/:id/download/:path` stays on REST because tRPC's JSON
 * link does not carry binary payloads. All CRUD + listFiles (JSON) endpoints
 * moved to the tRPC `workspace` router.
 */

import { basename } from "node:path";
import { Workspace } from "@nodetool-ai/models";
import { mimeTypeForPath } from "@nodetool-ai/protocol";
import { workspaceFromRow } from "./lib/workflow-workspace.js";
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

/**
 * Handle GET /api/workspaces/:id/download/:path (binary file download).
 * Returns `null` for any non-matching path so callers can fall through.
 */
export async function handleWorkspaceRequest(
  request: Request,
  options: HttpApiOptions
): Promise<Response | null> {
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
  const row = await Workspace.find(userId, wsId);
  if (!row) return errorResponse(404, "Workspace not found");

  // In production only the server-managed workspace is readable: a row created
  // while the deployment ran locally can still point at any host folder. Mirrors
  // `requireReadable` in the tRPC router.
  if (process.env["NODETOOL_ENV"] === "production" && !row.isManaged()) {
    return errorResponse(403, "This workspace is not readable in production");
  }

  if (filePath.startsWith("/")) {
    return errorResponse(400, "Absolute paths not allowed");
  }

  // Read through the workspace so a cloud deployment serves the same bytes a
  // local one does. Containment — the traversal check this used to spell out
  // with `path.relative` — is the workspace's own rule.
  const workspace = workspaceFromRow(row);
  if (!workspace) {
    return errorResponse(500, "Workspace storage is not configured");
  }

  let data: Uint8Array | null;
  try {
    data = await workspace.read(filePath);
  } catch (err) {
    if (err instanceof Error && err.name === "WorkspacePathError") {
      return errorResponse(403, "Path traversal not allowed");
    }
    return errorResponse(404, "File not found");
  }
  if (!data) return errorResponse(404, "File not found");

  // `Response` wants an ArrayBuffer-backed view; the workspace answers with a
  // plain Uint8Array whose buffer type TypeScript keeps generic.
  return new Response(data.slice().buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "content-type": mimeTypeForPath(filePath),
      "content-disposition": `attachment; filename="${basename(filePath)}"`
    }
  });
}
