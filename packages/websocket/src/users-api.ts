/**
 * Users API — user management endpoints.
 *
 * Port of Python's `nodetool.api.users`.
 * Only available when USERS_FILE is set or in multi-user deployments.
 * All endpoints require the requesting user to be an admin.
 */

import { FileUserManager } from "@nodetool/auth";
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
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Check if a user ID is an admin.
 * In development (user "1"), all requests are treated as admin.
 * In production, check ADMIN_USER_IDS env var (comma-separated list).
 */
function isAdmin(userId: string): boolean {
  // Single-user dev mode
  if (userId === "1") return true;
  const adminIds = process.env.ADMIN_USER_IDS;
  if (adminIds) {
    return adminIds
      .split(",")
      .map((s) => s.trim())
      .includes(userId);
  }
  return false;
}

function toUserResponse(
  username: string,
  record: { id: string; role: string; tokenHash: string; createdAt: string }
): JsonObject {
  return {
    username,
    user_id: record.id,
    role: record.role,
    token_hash: record.tokenHash.slice(0, 16) + "...",
    created_at: record.createdAt
  };
}

const manager = new FileUserManager();

export async function handleUsersRequest(
  request: Request,
  pathname: string,
  options: HttpApiOptions
): Promise<Response | null> {
  const userId = getUserId(request, options.userIdHeader);

  if (!isAdmin(userId)) {
    return errorResponse(403, "Admin access required");
  }

  // POST /api/users/reset-token
  if (pathname === "/api/users/reset-token") {
    if (request.method !== "POST")
      return errorResponse(405, "Method not allowed");
    const body = await parseJsonBody<{ username: string }>(request);
    if (!body?.username) return errorResponse(400, "username is required");
    try {
      const result = await manager.resetToken(body.username);
      return jsonResponse({
        username: result.username,
        user_id: result.userId,
        role: result.role,
        token: result.token,
        created_at: result.createdAt
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Not found";
      return errorResponse(404, msg);
    }
  }

  // GET /api/users or POST /api/users
  if (pathname === "/api/users") {
    if (request.method === "GET") {
      const users = await manager.listUsers();
      return jsonResponse({
        users: Object.entries(users).map(([username, rec]) =>
          toUserResponse(username, rec)
        )
      });
    }
    if (request.method === "POST") {
      const body = await parseJsonBody<{ username: string; role?: string }>(
        request
      );
      if (!body?.username) return errorResponse(400, "username is required");
      try {
        const result = await manager.addUser(
          body.username,
          body.role ?? "user"
        );
        return jsonResponse({
          username: result.username,
          user_id: result.userId,
          role: result.role,
          token: result.token,
          created_at: result.createdAt
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bad request";
        return errorResponse(400, msg);
      }
    }
    return errorResponse(405, "Method not allowed");
  }

  // GET /api/users/:username or DELETE /api/users/:username
  if (pathname.startsWith("/api/users/")) {
    const username = decodeURIComponent(pathname.slice("/api/users/".length));
    if (!username) return null;

    if (request.method === "GET") {
      const user = await manager.getUser(username);
      if (!user) return errorResponse(404, `User '${username}' not found`);
      return jsonResponse(toUserResponse(username, user));
    }

    if (request.method === "DELETE") {
      try {
        await manager.removeUser(username);
        return jsonResponse({
          message: `User '${username}' removed successfully`
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Not found";
        return errorResponse(404, msg);
      }
    }

    return errorResponse(405, "Method not allowed");
  }

  return null;
}
