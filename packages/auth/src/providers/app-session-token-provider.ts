/**
 * App session tokens: short-lived, HMAC-signed bearer tokens that let an
 * anonymous visitor run one deployed mini app, and nothing else.
 *
 * A deployed app is served from a hidden URL with no login (see
 * `isAppDeploymentEnabled` in `@nodetool-ai/protocol`). Its runs execute on the
 * owner's account — their pinned graphs, their provider keys, their spend
 * budget — so the visitor needs an identity, and it cannot be the owner's own.
 * This token carries the owner's user id *and* the application it is confined
 * to, and every consumer is required to read the second field: the token
 * answers "who pays" and "for what" together, so a caller cannot accidentally
 * treat it as an ordinary session.
 *
 * That confinement is the whole point, so it is structural rather than a
 * claim to check later. `TokenType.APP_SESSION` is a distinct type with no
 * overlap with `USER`, and `AuthResult.applicationId` is only ever set by this
 * provider — a host that forgets to narrow on the type still cannot mistake
 * one for a full session, because the field it must consult is present.
 *
 * Like delegated tokens, the signature is the whole state: no token table, no
 * cleanup job. Rotating the signing key invalidates every outstanding token;
 * revoking the deployment stops new ones from minting, and the ones already
 * out die at their expiry.
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
export const APP_SESSION_TOKEN_PREFIX = "nda_";

/** Payload version, so a future field is a version bump rather than a guess. */
const PAYLOAD_VERSION = 1;

interface AppSessionTokenPayload {
  v: number;
  /** The app owner: whose account the run executes on. */
  u: string;
  /** The application this token may run, and only this one. */
  a: string;
  /** The released version the page loaded, so the run bills the right release. */
  r: number;
  /** Expiry as whole seconds since the epoch. */
  e: number;
}

/** Who a session token pays as, and what it may run. */
export interface AppSessionScope {
  /** The app owner: whose account the run executes on. */
  userId: string;
  applicationId: string;
  /** The released version the visitor loaded. */
  version: number;
}

export interface MintedAppSessionToken {
  token: string;
  /** Expiry as an ISO-8601 string, the shape the public route returns. */
  expiresAt: string;
}

function base64url(value: Buffer): string {
  return value.toString("base64url");
}

function sign(key: Buffer | string, material: string): string {
  return base64url(createHmac("sha256", key).update(material).digest());
}

/** Whether a token claims to be an app session token at all. */
export function isAppSessionToken(token: string): boolean {
  return token.startsWith(APP_SESSION_TOKEN_PREFIX);
}

/**
 * Mint a session token for one deployed app.
 *
 * @param key - HMAC signing key. The same key must reach the provider that
 *   verifies the token.
 * @param scope - The app owner, the application, and the release the visitor
 *   loaded.
 * @param ttlSeconds - Lifetime from now. A zero or negative value mints an
 *   already-expired token, which is how the expiry path is tested.
 */
export function mintAppSessionToken(
  key: Buffer | string,
  scope: AppSessionScope,
  ttlSeconds: number,
  now: () => number = Date.now
): MintedAppSessionToken {
  if (!isNonEmptyString(scope.userId)) {
    throw new Error("An app session token needs a user id");
  }
  if (!isNonEmptyString(scope.applicationId)) {
    throw new Error("An app session token needs an application id");
  }
  if (!Number.isInteger(scope.version)) {
    throw new Error("An app session token needs a released version");
  }
  const expiresAtMs = now() + Math.round(ttlSeconds * 1000);
  const payload: AppSessionTokenPayload = {
    v: PAYLOAD_VERSION,
    u: scope.userId,
    a: scope.applicationId,
    r: scope.version,
    e: Math.floor(expiresAtMs / 1000)
  };
  const encoded = base64url(Buffer.from(JSON.stringify(payload), "utf-8"));
  const material = `${APP_SESSION_TOKEN_PREFIX}${encoded}`;
  return {
    token: `${material}.${sign(key, material)}`,
    expiresAt: new Date(payload.e * 1000).toISOString()
  };
}

/** Read a payload back, or null when it is not the shape one was written in. */
function decodePayload(encoded: string): AppSessionTokenPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    // A payload that is not base64url-encoded JSON is not one this minted.
    return null;
  }
  if (!isJsonObject(parsed)) return null;
  const { v, u, a, r, e } = parsed;
  if (v !== PAYLOAD_VERSION) return null;
  if (!isNonEmptyString(u)) return null;
  if (!isNonEmptyString(a)) return null;
  if (!isFiniteNumber(r)) return null;
  if (!isFiniteNumber(e)) return null;
  return { v, u, a, r, e };
}

/**
 * The signing key, or a function returning it. The accessor form lets a host
 * defer key derivation until the first token actually arrives.
 */
export type AppSessionSigningKey = Buffer | string | (() => Buffer | string);

function isKeyAccessor(
  key: AppSessionSigningKey
): key is () => Buffer | string {
  return typeof key === "function";
}

export interface AppSessionTokenProviderOptions {
  /** Injected clock, so expiry is testable without waiting an hour. */
  now?: () => number;
}

export class AppSessionTokenProvider extends AuthProvider {
  private readonly key: AppSessionSigningKey;
  private readonly now: () => number;

  constructor(
    key: AppSessionSigningKey,
    options: AppSessionTokenProviderOptions = {}
  ) {
    super();
    this.key = key;
    this.now = options.now ?? Date.now;
  }

  private signingKey(): Buffer | string {
    return isKeyAccessor(this.key) ? this.key() : this.key;
  }

  /**
   * Verify an app session token. Every failure — wrong prefix, malformed,
   * tampered, expired — is a not-ok result rather than a throw, so a chained
   * caller can fall through to the next provider on any of them.
   */
  async verifyToken(token: string): Promise<AuthResult> {
    if (!isNonEmptyString(token) || !isAppSessionToken(token)) {
      return { ok: false, error: "Not an app session token" };
    }

    const separator = token.lastIndexOf(".");
    if (separator < 0) {
      return { ok: false, error: "Malformed app session token" };
    }
    const material = token.slice(0, separator);
    const presented = Buffer.from(token.slice(separator + 1), "utf-8");
    const expected = Buffer.from(sign(this.signingKey(), material), "utf-8");
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(presented, expected)
    ) {
      return { ok: false, error: "Invalid app session token signature" };
    }

    const payload = decodePayload(
      material.slice(APP_SESSION_TOKEN_PREFIX.length)
    );
    if (!payload) {
      return { ok: false, error: "Malformed app session token" };
    }
    if (payload.e * 1000 <= this.now()) {
      return { ok: false, error: "App session token expired" };
    }

    return {
      ok: true,
      userId: payload.u,
      tokenType: TokenType.APP_SESSION,
      applicationId: payload.a,
      applicationVersion: payload.r
    };
  }

  clearCaches(): void {
    // Stateless: the signature is the whole state.
  }
}
