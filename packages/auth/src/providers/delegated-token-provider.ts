/**
 * Delegated tokens: short-lived, HMAC-signed bearer tokens that authenticate
 * as one NodeTool user.
 *
 * A messaging bridge (Telegram, later Discord) holds one service token that
 * identifies the integration, never a user credential. Per connection it asks
 * the server to mint a delegated token for the user its external account is
 * linked to, and that token is what every request runs on — so tenant
 * isolation stays the server's, enforced by the same rules a browser session
 * gets.
 *
 * The signature is the whole state: there is no token table and no cleanup
 * job. Unlinking stops new tokens from minting and outstanding ones die at
 * their expiry; rotating the signing key kills them immediately.
 *
 * The key itself is the caller's business. Nothing here reads the master key —
 * `@nodetool-ai/security` is not a dependency of this package — so the wiring
 * site (the server) derives a key and passes it in.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { AuthProvider, AuthResult, TokenType } from "../auth-provider.js";
import {
  isFiniteNumber,
  isJsonObject,
  isNonEmptyString
} from "../json-wire.js";

/**
 * What marks a token as this provider's. A token without it is somebody
 * else's — `verifyToken` says so without spending a comparison, and a chained
 * caller falls through to the next provider.
 */
export const DELEGATED_TOKEN_PREFIX = "ndt_";

/** Payload version, so a future field is a version bump rather than a guess. */
const PAYLOAD_VERSION = 1;

interface DelegatedTokenPayload {
  v: number;
  u: string;
  /** Expiry as whole seconds since the epoch. */
  e: number;
}

export interface MintedDelegatedToken {
  token: string;
  /** Expiry as an ISO-8601 string, the shape the integration routes return. */
  expiresAt: string;
}

function base64url(value: Buffer): string {
  return value.toString("base64url");
}

function sign(key: Buffer | string, material: string): string {
  return base64url(createHmac("sha256", key).update(material).digest());
}

/** Whether a token claims to be a delegated token at all. */
export function isDelegatedToken(token: string): boolean {
  return token.startsWith(DELEGATED_TOKEN_PREFIX);
}

/**
 * Mint a delegated token for a user.
 *
 * @param key - HMAC signing key. The same key must reach the provider that
 *   verifies the token.
 * @param userId - The NodeTool user the token authenticates as.
 * @param ttlSeconds - Lifetime from now. A zero or negative value mints an
 *   already-expired token, which is how the expiry path is tested.
 */
export function mintDelegatedToken(
  key: Buffer | string,
  userId: string,
  ttlSeconds: number,
  now: () => number = Date.now
): MintedDelegatedToken {
  if (!isNonEmptyString(userId)) {
    throw new Error("A delegated token needs a user id");
  }
  const expiresAtMs = now() + Math.round(ttlSeconds * 1000);
  const payload: DelegatedTokenPayload = {
    v: PAYLOAD_VERSION,
    u: userId,
    e: Math.floor(expiresAtMs / 1000)
  };
  const encoded = base64url(Buffer.from(JSON.stringify(payload), "utf-8"));
  const material = `${DELEGATED_TOKEN_PREFIX}${encoded}`;
  return {
    token: `${material}.${sign(key, material)}`,
    expiresAt: new Date(payload.e * 1000).toISOString()
  };
}

/** Read a payload back, or null when it is not the shape one was written in. */
function decodePayload(encoded: string): DelegatedTokenPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    // A payload that is not base64url-encoded JSON is not one this minted.
    return null;
  }
  if (!isJsonObject(parsed)) return null;
  const { v, u, e } = parsed;
  if (v !== PAYLOAD_VERSION) return null;
  if (!isNonEmptyString(u)) return null;
  if (!isFiniteNumber(e)) return null;
  return { v, u, e };
}

export interface DelegatedTokenProviderOptions {
  /** Injected clock, so expiry is testable without waiting an hour. */
  now?: () => number;
}

/**
 * The signing key, or a function returning it. The accessor form lets a host
 * defer key derivation until the first token actually arrives.
 */
export type DelegatedSigningKey = Buffer | string | (() => Buffer | string);

/** Whether a key was supplied as an accessor rather than as the key itself. */
function isKeyAccessor(
  key: DelegatedSigningKey
): key is () => Buffer | string {
  return typeof key === "function";
}

export class DelegatedTokenProvider extends AuthProvider {
  private readonly key: DelegatedSigningKey;
  private readonly now: () => number;

  constructor(
    key: DelegatedSigningKey,
    options: DelegatedTokenProviderOptions = {}
  ) {
    super();
    this.key = key;
    this.now = options.now ?? Date.now;
  }

  private signingKey(): Buffer | string {
    return isKeyAccessor(this.key) ? this.key() : this.key;
  }

  /**
   * Verify a delegated token. Every failure — wrong prefix, malformed,
   * tampered, expired — is a not-ok result rather than a throw, so a chained
   * caller can fall through to the next provider on any of them.
   */
  async verifyToken(token: string): Promise<AuthResult> {
    if (!isNonEmptyString(token) || !isDelegatedToken(token)) {
      return { ok: false, error: "Not a delegated token" };
    }

    const separator = token.lastIndexOf(".");
    if (separator < 0) {
      return { ok: false, error: "Malformed delegated token" };
    }
    const material = token.slice(0, separator);
    const presented = Buffer.from(token.slice(separator + 1), "utf-8");
    const expected = Buffer.from(sign(this.signingKey(), material), "utf-8");
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      return { ok: false, error: "Invalid delegated token signature" };
    }

    const payload = decodePayload(material.slice(DELEGATED_TOKEN_PREFIX.length));
    if (!payload) {
      return { ok: false, error: "Malformed delegated token" };
    }
    if (payload.e * 1000 <= this.now()) {
      return { ok: false, error: "Delegated token expired" };
    }

    return { ok: true, userId: payload.u, tokenType: TokenType.USER };
  }

  clearCaches(): void {
    // Stateless: the signature is the whole state.
  }
}
