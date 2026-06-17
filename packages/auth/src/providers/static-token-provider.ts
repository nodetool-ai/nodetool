/**
 * Static token authentication provider.
 *
 * Ported from Python: src/nodetool/security/providers/static_token.py
 *
 * Extended with support for environment-variable-based configuration:
 *   - STATIC_AUTH_TOKEN: single token mapped to user "1"
 *   - STATIC_AUTH_TOKENS: JSON object mapping tokens to user IDs
 */

import { timingSafeEqual } from "node:crypto";

import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";

/**
 * Minimum length (in bytes) for a presented token to be considered.
 * Rejects empty or trivially short tokens before any comparison.
 */
const MIN_TOKEN_LENGTH = 16;

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
    // Stryker disable next-line ConditionalExpression: a falsy STATIC_AUTH_TOKENS
    // ("" or unset) makes JSON.parse throw and be swallowed by the catch, so
    // forcing the branch true registers no tokens either way (equivalent).
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
    if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) {
      return { ok: false, error: "Invalid token" };
    }

    const provided = Buffer.from(token);

    // Compare against every configured token using a constant-time comparison
    // so verification time does not leak which (if any) token matched. We do
    // not short-circuit on the first match for the same reason.
    let matchedUserId: string | undefined;
    for (const [candidate, userId] of this.tokens) {
      const expected = Buffer.from(candidate);
      if (
        provided.length === expected.length &&
        timingSafeEqual(provided, expected)
      ) {
        matchedUserId = userId;
      }
    }

    if (matchedUserId !== undefined) {
      return { ok: true, userId: matchedUserId, tokenType: TokenType.STATIC };
    }
    return { ok: false, error: "Invalid token" };
  }

  clearCaches(): void {
    // No caches to clear.
  }
}
