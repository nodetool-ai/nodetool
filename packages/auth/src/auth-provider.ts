/**
 * Core authentication provider abstraction.
 *
 * Ported from Python: src/nodetool/security/auth_provider.py
 */

export enum TokenType {
  STATIC = "static",
  USER = "user",
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
  tokenType?: TokenType;
  error?: string;
}

/**
 * Common interface for all authentication providers.
 */
export abstract class AuthProvider {
  static preferHeader(): string {
    return "authorization";
  }

  /**
   * Extract a bearer token from HTTP headers.
   *
   * Supports both plain `Record<string, string>` objects and the Web API
   * `Headers` class.
   */
  extractTokenFromHeaders(
    headers: Record<string, string> | Headers
  ): string | null {
    const headerName = AuthProvider.preferHeader();

    let authHeader: string | null | undefined;
    if (headers instanceof Headers) {
      authHeader = headers.get(headerName) ?? headers.get(headerName.replace(/\b\w/g, (c) => c.toUpperCase()));
    } else {
      authHeader =
        headers[headerName] ??
        headers[headerName.charAt(0).toUpperCase() + headerName.slice(1)] ??
        null;
    }

    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return null;
    }

    const token = parts[1].trim();
    return token || null;
  }

  /**
   * Extract a bearer token for WebSocket connections.
   *
   * Compatibility fallback: allow `?api_key=<token>` query parameter.
   */
  extractTokenFromWs(
    headers: Record<string, string> | Headers,
    queryParams?: Record<string, string> | URLSearchParams
  ): string | null {
    const token = this.extractTokenFromHeaders(headers);
    if (token) {
      return token;
    }

    if (!queryParams) {
      return null;
    }

    let apiKey: string | null | undefined;
    if (queryParams instanceof URLSearchParams) {
      apiKey = queryParams.get("api_key");
    } else {
      apiKey = queryParams["api_key"] ?? null;
    }

    if (apiKey) {
      apiKey = apiKey.trim();
      return apiKey || null;
    }

    return null;
  }

  /**
   * Validate a token and return the associated authentication result.
   */
  abstract verifyToken(token: string): Promise<AuthResult>;

  /**
   * Clear any internal caches held by the provider.
   */
  clearCaches(): void {
    // No-op by default.
  }
}
