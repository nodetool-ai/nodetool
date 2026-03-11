/**
 * Static token authentication provider.
 *
 * Ported from Python: src/nodetool/security/providers/static_token.py
 *
 * Extended with support for environment-variable-based configuration:
 *   - STATIC_AUTH_TOKEN: single token mapped to user "1"
 *   - STATIC_AUTH_TOKENS: JSON object mapping tokens to user IDs
 */

import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";

export class StaticTokenProvider extends AuthProvider {
  private tokens: Map<string, string>;

  /**
   * @param tokens - Optional record mapping tokens to user IDs.
   *   If omitted the provider reads from environment variables:
   *     - STATIC_AUTH_TOKEN  (single token -> user "1")
   *     - STATIC_AUTH_TOKENS (JSON object { token: userId })
   */
  constructor(tokens?: Record<string, string>) {
    super();
    this.tokens = new Map<string, string>();

    if (tokens) {
      for (const [token, userId] of Object.entries(tokens)) {
        this.tokens.set(token, userId);
      }
      return;
    }

    // Fall back to environment variables.
    const singleToken = process.env["STATIC_AUTH_TOKEN"];
    if (singleToken) {
      this.tokens.set(singleToken, "1");
    }

    const multiTokens = process.env["STATIC_AUTH_TOKENS"];
    if (multiTokens) {
      try {
        const parsed = JSON.parse(multiTokens) as Record<string, string>;
        for (const [token, userId] of Object.entries(parsed)) {
          this.tokens.set(token, userId);
        }
      } catch {
        // Ignore malformed JSON – treat as no tokens configured.
      }
    }
  }

  async verifyToken(token: string): Promise<AuthResult> {
    const userId = this.tokens.get(token);
    if (userId) {
      return { ok: true, userId, tokenType: TokenType.STATIC };
    }
    return { ok: false, error: "Invalid token" };
  }

  clearCaches(): void {
    // No caches to clear.
  }
}
