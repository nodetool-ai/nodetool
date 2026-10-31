import { timingSafeEqual } from "node:crypto";
import { AuthProvider, TokenType, type AuthResult } from "@nodetool-ai/auth";

/** Explicit administrator token assignments. There is no trusted-local fallback. */
export class ConfiguredTokenAuth extends AuthProvider {
  private readonly entries: readonly { token: Buffer; userId: string }[];

  constructor(tokens: Readonly<Record<string, string>>) {
    super();
    this.entries = Object.entries(tokens).map(([token, userId]) => {
      if (token.length < 32 || !userId) {
        throw new Error("Tokens must contain at least 32 characters and have a user ID");
      }
      return { token: Buffer.from(token), userId };
    });
    if (this.entries.length === 0) {
      throw new Error("At least one authenticated token assignment is required");
    }
  }

  async verifyToken(token: string): Promise<AuthResult> {
    const candidate = Buffer.from(token);
    for (const entry of this.entries) {
      if (candidate.length === entry.token.length && timingSafeEqual(candidate, entry.token)) {
        return { ok: true, userId: entry.userId, tokenType: TokenType.STATIC };
      }
    }
    return { ok: false, error: "Invalid token" };
  }
}
