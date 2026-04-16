/**
 * Workspace API handler.
 *
 * Handles all /api/workspaces/* routes.
 */

import { stat, readdir, readFile } from "node:fs/promises";
import { existsSync, accessSync, constants } from "node:fs";
import { resolve, join, basename, isAbsolute } from "node:path";
import { Workspace } from "@nodetool/models";
import type { HttpApiOptions } from "./http-api.js";

type JsonObject = Record<string, unknown>;

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

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function toWorkspaceResponse(ws: Workspace): JsonObject {
  return {
    id: ws.id,
    user_id: ws.user_id,
    name: ws.name,
    path: ws.path,
    is_default: ws.is_default,
    is_accessible: ws.isAccessible(),
    created_at: ws.created_at,
    updated_at: ws.updated_at
  };
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

interface WorkspaceCreateBody {
  name: string;
  path: string;
  is_default?: boolean;
}

interface WorkspaceUpdateBody {
  name?: string;
  path?: string;
  is_default?: boolean;
}

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

  if (!pathname.startsWith("/api/workspaces")) return null;

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  // GET /api/workspaces/{workspaceId}/files?path=.
  const workspaceFilesMatch = pathname.match(
    /^\/api\/workspaces\/([^/]+)\/files$/
  );
  if (workspaceFilesMatch) {
    if (request.method !== "GET")
      return errorResponse(405, "Method not allowed");
    const workspaceId = decodeURIComponent(workspaceFilesMatch[1]);
    const workspace = await Workspace.find(userId, workspaceId);
    if (!workspace) return errorResponse(404, "Workspace not found");

    const queryPath = url.searchParams.get("path") ?? ".";

    // Reject absolute paths — only relative paths allowed
    if (queryPath.startsWith("/")) {
      return errorResponse(400, "Absolute paths not allowed, use relative paths");
    }

    const workspacePath = resolve(workspace.path);
    const resolvedPath = resolve(join(workspacePath, queryPath));

    // Path traversal check
    if (!resolvedPath.startsWith(workspacePath)) {
      return errorResponse(403, "Path traversal not allowed");
    }

    try {
      const entries = await readdir(resolvedPath);
      const files: JsonObject[] = [];
      for (const entry of entries) {
        const entryRelative = join(queryPath === "." ? "" : queryPath, entry);
        const fullPath = join(resolvedPath, entry);
        try {
          const s = await stat(fullPath);
          files.push({
            name: entry,
            path: entryRelative,
            size: s.size,
            is_dir: s.isDirectory(),
            modified_at: s.mtime.toISOString()
          });
        } catch {
          // skip inaccessible entries
        }
      }
      return jsonResponse(files);
    } catch {
      return errorResponse(404, "Directory not found");
    }
  }

  // GET /api/workspaces/{workspaceId}/download/{relativePath}
  const workspaceDownloadMatch = pathname.match(
    /^\/api\/workspaces\/([^/]+)\/download\/(.+)$/
  );
  if (workspaceDownloadMatch) {
    if (request.method !== "GET")
      return errorResponse(405, "Method not allowed");
    const wsId = decodeURIComponent(workspaceDownloadMatch[1]);
    const filePath = decodeURIComponent(workspaceDownloadMatch[2]);
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

  // GET /api/workspaces/default
  if (pathname === "/api/workspaces/default") {
    if (request.method !== "GET")
      return errorResponse(405, "Method not allowed");
    const ws = await Workspace.getDefault(userId);
    return jsonResponse(ws ? toWorkspaceResponse(ws) : null);
  }

  // GET /api/workspaces  |  POST /api/workspaces
  if (pathname === "/api/workspaces") {
    if (request.method === "GET") {
      const limit = Math.min(
        Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
        500
      );
      const [workspaces] = await Workspace.paginate(userId, { limit });
      return jsonResponse({
        workspaces: workspaces.map(toWorkspaceResponse),
        next: null
      });
    }

    if (request.method === "POST") {
      const body = await parseJsonBody<WorkspaceCreateBody>(request);
      if (
        !body ||
        typeof body.name !== "string" ||
        typeof body.path !== "string"
      ) {
        return errorResponse(
          400,
          "Invalid JSON body: name and path are required"
        );
      }

      // Validate path
      if (!isAbsolute(body.path)) {
        return errorResponse(400, "Path must be absolute");
      }
      if (!existsSync(body.path)) {
        return errorResponse(400, "Path does not exist");
      }
      try {
        const s = await stat(body.path);
        if (!s.isDirectory()) {
          return errorResponse(400, "Path is not a directory");
        }
      } catch {
        return errorResponse(400, "Cannot access path");
      }
      try {
        accessSync(body.path, constants.W_OK);
      } catch {
        return errorResponse(400, "Path is not writable");
      }

      if (body.is_default) {
        await Workspace.unsetOtherDefaults(userId);
      }

      const ws = (await Workspace.create({
        user_id: userId,
        name: body.name,
        path: body.path,
        is_default: body.is_default ?? false
      })) as Workspace;

      return jsonResponse(toWorkspaceResponse(ws));
    }

    return errorResponse(405, "Method not allowed");
  }

  // Routes with /{id}
  const idMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (!idMatch) return null;
  const workspaceId = decodeURIComponent(idMatch[1]);

  // GET /api/workspaces/{id}
  if (request.method === "GET") {
    const ws = await Workspace.find(userId, workspaceId);
    if (!ws) return errorResponse(404, "Workspace not found");
    return jsonResponse(toWorkspaceResponse(ws));
  }

  // PUT /api/workspaces/{id}
  if (request.method === "PUT") {
    const ws = await Workspace.find(userId, workspaceId);
    if (!ws) return errorResponse(404, "Workspace not found");

    const body = await parseJsonBody<WorkspaceUpdateBody>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");

    if (body.name !== undefined) ws.name = body.name;
    if (body.path !== undefined) ws.path = body.path;
    if (body.is_default !== undefined) {
      if (body.is_default) {
        await Workspace.unsetOtherDefaults(userId);
      }
      ws.is_default = body.is_default;
    }
    await ws.save();
    return jsonResponse(toWorkspaceResponse(ws));
  }

  // DELETE /api/workspaces/{id}
  if (request.method === "DELETE") {
    const ws = await Workspace.find(userId, workspaceId);
    if (!ws) return errorResponse(404, "Workspace not found");

    const hasWorkflows = await Workspace.hasLinkedWorkflows(workspaceId);
    if (hasWorkflows) {
      return errorResponse(
        400,
        "Cannot delete workspace with linked workflows"
      );
    }

    await ws.delete();
    return jsonResponse({ message: "Workspace deleted successfully" });
  }

  return errorResponse(405, "Method not allowed");
}
