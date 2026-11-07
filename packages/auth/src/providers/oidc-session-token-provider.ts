/**
 * SSO session tokens: signed bearer tokens the server mints after a
 * successful OpenID Connect sign-in (see `../oidc.ts`).
 *
 * The browser presents the token exactly like a Supabase JWT, in the
 * `Authorization` header and as `?api_key=` on the WebSocket, so every
 * transport that already carries a bearer token works unchanged. A token is
 * `nts_` followed by an HS256 JWT whose `sub` is the NodeTool user id derived
 * from the identity provider's subject, with `exp`, and the email and display
 * name for the account menu. `iss` and `aud` bind it to this purpose, so a JWT
 * signed with the same key for anything else does not verify.
 *
 * The signature is the whole state, as with delegated and app session tokens:
 * no session table, no cleanup job. Rotating the signing key (the master key
 * it is derived from) revokes every outstanding session. A removed IdP account
 * keeps working until its token expires, which is why the lifetime is bounded
 * by `OIDC_SESSION_TTL_SECONDS`.
 */

import { SignJWT, jwtVerify } from "jose";

import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";
import { isNonEmptyString } from "../json-wire.js";

/** What marks a token as an SSO session token. */
export const OIDC_SESSION_TOKEN_PREFIX = "nts_";

const SESSION_ISSUER = "nodetool";
const SESSION_AUDIENCE = "nodetool-sso-session";

/** Who a session token signs in as. */
export interface OidcSessionIdentity {
  userId: string;
  email?: string;
  name?: string;
}

/** Display-only claims carried next to `sub` and `exp`. */
interface SessionDisplayClaims {
  email?: string;
  name?: string;
}

export interface MintedOidcSessionToken {
  token: string;
  /** Expiry as an ISO-8601 string. */
  expiresAt: string;
}

/** Whether a token claims to be an SSO session token. */
export function isOidcSessionToken(token: string): boolean {
  return token.startsWith(OIDC_SESSION_TOKEN_PREFIX);
}

function keyBytes(key: Buffer | string): Uint8Array {
  return Buffer.isBuffer(key) ? new Uint8Array(key) : new TextEncoder().encode(key);
}

/**
 * Mint a session token.
 *
 * @param ttlSeconds - Lifetime from now. Zero or negative mints an
 *   already-expired token, which is how the expiry path is tested.
 */
export async function mintOidcSessionToken(
  key: Buffer | string,
  identity: OidcSessionIdentity,
  ttlSeconds: number,
  now: () => number = Date.now
): Promise<MintedOidcSessionToken> {
  if (!isNonEmptyString(identity.userId)) {
    throw new Error("An SSO session token needs a user id");
  }
  const issuedAt = Math.floor(now() / 1000);
  const expiresAt = issuedAt + Math.round(ttlSeconds);
  const claims: SessionDisplayClaims = {};
  if (isNonEmptyString(identity.email)) claims.email = identity.email;
  if (isNonEmptyString(identity.name)) claims.name = identity.name;
  const jwt = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(identity.userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(keyBytes(key));
  return {
    token: `${OIDC_SESSION_TOKEN_PREFIX}${jwt}`,
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

/** The signing key, or an accessor that derives it on first use. */
export type OidcSessionSigningKey = Buffer | string | (() => Buffer | string);

function isKeyAccessor(
  key: OidcSessionSigningKey
): key is () => Buffer | string {
  return typeof key === "function";
}

export interface OidcSessionTokenProviderOptions {
  /** Injected clock, so expiry is testable. */
  now?: () => number;
}

export class OidcSessionTokenProvider extends AuthProvider {
  private readonly key: OidcSessionSigningKey;
  private readonly now: () => number;

  constructor(
    key: OidcSessionSigningKey,
    options: OidcSessionTokenProviderOptions = {}
  ) {
    super();
    this.key = key;
    this.now = options.now ?? Date.now;
  }

  private signingKey(): Buffer | string {
    return isKeyAccessor(this.key) ? this.key() : this.key;
  }

  /** Verify a session token. Every failure is a not-ok result, never a throw. */
  async verifyToken(token: string): Promise<AuthResult> {
    if (!isNonEmptyString(token) || !isOidcSessionToken(token)) {
      return { ok: false, error: "Not an SSO session token" };
    }
    try {
      const { payload } = await jwtVerify(
        token.slice(OIDC_SESSION_TOKEN_PREFIX.length),
        keyBytes(this.signingKey()),
        {
          algorithms: ["HS256"],
          issuer: SESSION_ISSUER,
          audience: SESSION_AUDIENCE,
          requiredClaims: ["sub", "exp"],
          currentDate: new Date(this.now())
        }
      );
      if (!isNonEmptyString(payload.sub)) {
        return { ok: false, error: "Malformed SSO session token" };
      }
      return { ok: true, userId: payload.sub, tokenType: TokenType.USER };
    } catch (error) {
      const expired =
        error instanceof Error && "code" in error && error.code === "ERR_JWT_EXPIRED";
      return {
        ok: false,
        error: expired ? "SSO session expired" : "Invalid SSO session token"
      };
    }
  }
}
