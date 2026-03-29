/**
 * Development auth provider that always returns user "1".
 *
 * Ported from Python: src/nodetool/security/providers/local.py
 */

import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";

/**
 * Single-user development provider.
 *
 * Accepts any token (including missing) and maps requests to the fixed user
 * ID "1". Intended for local development only.
 */
export class LocalAuthProvider extends AuthProvider {
  userId: string = "1";

  async verifyToken(_token: string): Promise<AuthResult> {
    return { ok: true, userId: this.userId, tokenType: TokenType.STATIC };
  }
}
