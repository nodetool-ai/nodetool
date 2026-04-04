/**
 * Standalone HTTP authentication helpers.
 *
 * Ported from Python: src/nodetool/security/http_auth.py
 */

import type { AuthProvider } from "./auth-provider.js";
import { TokenType } from "./auth-provider.js";

export interface HttpAuthOptions {
  provider: AuthProvider;
  publicPaths?: string[];
}

export interface AuthenticatedUser {
  userId: string;
  tokenType: TokenType;
}

/** Extract Bearer token from a Request's Authorization header. */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;

  const token = parts[1].trim();
  return token || null;
}

/** Authenticate a request. Returns user info or null if unauthenticated. */
export async function authenticateRequest(
  request: Request,
  options: HttpAuthOptions
): Promise<AuthenticatedUser | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  const result = await options.provider.verifyToken(token);
  if (!result.ok) return null;

  return {
    userId: result.userId!,
    tokenType: result.tokenType ?? TokenType.STATIC
  };
}

/** Middleware: returns 401 Response if authentication fails, otherwise null. */
export async function requireAuth(
  request: Request,
  options: HttpAuthOptions
): Promise<Response | null> {
  // Check public paths
  if (options.publicPaths) {
    const url = new URL(request.url);
    if (options.publicPaths.includes(url.pathname)) {
      return null;
    }
  }

  const user = await authenticateRequest(request, options);
  if (user) return null;

  return new Response(JSON.stringify({ detail: "Authorization required" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer"
    }
  });
}
