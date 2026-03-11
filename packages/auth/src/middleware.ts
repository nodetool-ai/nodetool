/**
 * HTTP authentication middleware helpers.
 *
 * Ported from Python: src/nodetool/security/http_auth.py
 */

import { AuthProvider, AuthResult, TokenType } from "./auth-provider.js";

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export interface AuthenticatedUser {
  userId: string;
  tokenType: TokenType;
}

export interface AuthMiddlewareOptions {
  staticProvider: AuthProvider;
  userProvider?: AuthProvider;
  enforceAuth: boolean;
}

/**
 * Create an async function that extracts the authenticated user from a
 * `Request` object.
 *
 * If `enforceAuth` is false the function returns a default user ("1")
 * when no valid credentials are supplied.
 *
 * Providers are tried in order: staticProvider first, then userProvider.
 * If all providers reject the token an `HttpError` with status 401 is thrown.
 */
export function createAuthMiddleware(
  opts: AuthMiddlewareOptions
): (request: Request) => Promise<AuthenticatedUser> {
  const { staticProvider, userProvider, enforceAuth } = opts;

  return async (request: Request): Promise<AuthenticatedUser> => {
    const token = staticProvider.extractTokenFromHeaders(request.headers);

    if (!enforceAuth) {
      if (!token) {
        return { userId: "1", tokenType: TokenType.STATIC };
      }
    }

    if (!token) {
      throw new HttpError(
        401,
        "Authorization header required. Use 'Authorization: Bearer <token>'."
      );
    }

    // Try static provider first.
    const staticResult: AuthResult = await staticProvider.verifyToken(token);
    if (staticResult.ok) {
      return {
        userId: staticResult.userId!,
        tokenType: staticResult.tokenType ?? TokenType.STATIC,
      };
    }

    // Fall back to user provider.
    if (userProvider) {
      const userResult: AuthResult = await userProvider.verifyToken(token);
      if (userResult.ok) {
        return {
          userId: userResult.userId!,
          tokenType: userResult.tokenType ?? TokenType.USER,
        };
      }
      throw new HttpError(
        401,
        userResult.error ?? "Invalid user authentication token."
      );
    }

    throw new HttpError(
      401,
      staticResult.error ?? "Invalid authentication token."
    );
  };
}

/**
 * Helper to extract a user ID from request headers.
 *
 * Looks for a header (default: `x-user-id`) and falls back to `"1"`.
 */
export function getUserId(
  request: Request,
  headerName: string = "x-user-id"
): string {
  return request.headers.get(headerName) ?? "1";
}
