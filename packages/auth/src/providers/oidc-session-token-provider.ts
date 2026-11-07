/**
 * SSO session tokens: HMAC-signed bearer tokens the server mints after a
 * successful OpenID Connect sign-in (see `../oidc.ts`).
 *
 * The browser presents the token exactly like a Supabase JWT, in the
 * `Authorization` header and as `?api_key=` on the WebSocket, so every
 * transport that already carries a bearer token works unchanged. The payload
 * holds the NodeTool user id derived from the identity provider's subject,
 * the expiry, and the email and display name for the account menu.
 *
 * The signature is the whole state, as with delegated and app session tokens:
 * no session table, no cleanup job. Rotating the signing key (the master key
 * it is derived from) revokes every outstanding session. A removed IdP account
 * keeps working until its token expires, which is why the lifetime is bounded
 * by `OIDC_SESSION_TTL_SECONDS`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";
import { isFiniteNumber, isJsonObject, isNonEmptyString } from "../json-wire.js";

/** What marks a token as an SSO session token. */
export const OIDC_SESSION_TOKEN_PREFIX = "nts_";

const PAYLOAD_VERSION = 1;

interface OidcSessionTokenPayload {
  v: number;
  /** NodeTool user id. */
  u: string;
  /** Expiry as whole seconds since the epoch. */
  e: number;
  /** Email address from the ID token, for display only. */
  m?: string;
  /** Display name from the ID token, for display only. */
  n?: string;
}

/** Who a session token signs in as. */
export interface OidcSessionIdentity {
  userId: string;
  email?: string;
  name?: string;
}

export interface MintedOidcSessionToken {
  token: string;
  /** Expiry as an ISO-8601 string. */
  expiresAt: string;
}

/**
 * HMAC-SHA256 over the token's own encoded payload. Nothing is stored and the
 * key is a 32-byte derived secret, so a fast MAC is the right primitive here
 * (the same reasoning as `app-session-token-provider.ts`).
 */
function sign(key: Buffer | string, material: string): string {
  return createHmac("sha256", key).update(material).digest("base64url");
}

/** Whether a token claims to be an SSO session token. */
export function isOidcSessionToken(token: string): boolean {
  return token.startsWith(OIDC_SESSION_TOKEN_PREFIX);
}

/**
 * Mint a session token.
 *
 * @param ttlSeconds - Lifetime from now. Zero or negative mints an
 *   already-expired token, which is how the expiry path is tested.
 */
export function mintOidcSessionToken(
  key: Buffer | string,
  identity: OidcSessionIdentity,
  ttlSeconds: number,
  now: () => number = Date.now
): MintedOidcSessionToken {
  if (!isNonEmptyString(identity.userId)) {
    throw new Error("An SSO session token needs a user id");
  }
  const payload: OidcSessionTokenPayload = {
    v: PAYLOAD_VERSION,
    u: identity.userId,
    e: Math.floor((now() + Math.round(ttlSeconds * 1000)) / 1000)
  };
  if (isNonEmptyString(identity.email)) payload.m = identity.email;
  if (isNonEmptyString(identity.name)) payload.n = identity.name;
  const encoded = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url"
  );
  const material = `${OIDC_SESSION_TOKEN_PREFIX}${encoded}`;
  return {
    token: `${material}.${sign(key, material)}`,
    expiresAt: new Date(payload.e * 1000).toISOString()
  };
}

function decodePayload(encoded: string): OidcSessionTokenPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!isJsonObject(parsed)) return null;
  const { v, u, e, m, n } = parsed;
  if (v !== PAYLOAD_VERSION) return null;
  if (!isNonEmptyString(u)) return null;
  if (!isFiniteNumber(e)) return null;
  const payload: OidcSessionTokenPayload = { v, u, e };
  if (isNonEmptyString(m)) payload.m = m;
  if (isNonEmptyString(n)) payload.n = n;
  return payload;
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
    const separator = token.lastIndexOf(".");
    if (separator < 0) {
      return { ok: false, error: "Malformed SSO session token" };
    }
    const material = token.slice(0, separator);
    const presented = Buffer.from(token.slice(separator + 1), "utf-8");
    const expected = Buffer.from(sign(this.signingKey(), material), "utf-8");
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      return { ok: false, error: "Invalid SSO session token signature" };
    }
    const payload = decodePayload(
      material.slice(OIDC_SESSION_TOKEN_PREFIX.length)
    );
    if (!payload) {
      return { ok: false, error: "Malformed SSO session token" };
    }
    if (payload.e * 1000 <= this.now()) {
      return { ok: false, error: "SSO session expired" };
    }
    return { ok: true, userId: payload.u, tokenType: TokenType.USER };
  }
}
