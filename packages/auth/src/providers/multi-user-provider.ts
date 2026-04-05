/**
 * Multi-user JWT authentication provider — T-SEC-3.
 *
 * Validates JWT tokens using the `jose` library and extracts user identity.
 */
import * as jose from "jose";
import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";

export interface MultiUserAuthProviderOptions {
  /** JWT signing secret (symmetric HS256). */
  secret: string;
  /** JWT claim to use as user ID. Defaults to "sub". */
  userIdClaim?: string;
}

export class MultiUserAuthProvider extends AuthProvider {
  private secret: Uint8Array;
  private userIdClaim: string;

  constructor(options: MultiUserAuthProviderOptions) {
    super();
    this.secret = new TextEncoder().encode(options.secret);
    this.userIdClaim = options.userIdClaim ?? "sub";
  }

  async verifyToken(token: string): Promise<AuthResult & { role?: string }> {
    try {
      const { payload } = await jose.jwtVerify(token, this.secret);

      const userId = payload[this.userIdClaim];
      if (typeof userId !== "string" || !userId) {
        return {
          ok: false,
          error: `Missing user ID claim: ${this.userIdClaim}`
        };
      }

      const role = typeof payload.role === "string" ? payload.role : undefined;

      return {
        ok: true,
        userId,
        tokenType: TokenType.USER,
        role
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}
