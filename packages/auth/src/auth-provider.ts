/**
 * Core authentication provider abstraction.
 *
 * Ported from Python: src/nodetool/security/auth_provider.py
 */

export enum TokenType {
  STATIC = "static",
  USER = "user"
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
  tokenType?: TokenType;
  error?: string;
}

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
      // Stryker disable all: Headers.get is case-insensitive, so the capitalized
      // fallback always resolves to the same value as the primary lookup. Every
      // mutant on these two lines (`??`→`&&`, the regex, the callback) is
      // therefore equivalent — no input produces an observable difference.
      authHeader =
        headers.get(headerName) ??
        headers.get(headerName.replace(/\b\w/g, (c) => c.toUpperCase()));
      // Stryker restore all
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

    // Stryker disable next-line MethodExpression: split(/\s+/) yields tokens with
    // no surrounding whitespace, so trim() is a no-op here (equivalent mutant).
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

  abstract verifyToken(token: string): Promise<AuthResult>;

  clearCaches(): void {
    // No-op by default.
  }
}
