/**
 * OpenID Connect single sign-on for self-hosted servers.
 *
 * A self-hoster points NodeTool at their own identity provider (Keycloak,
 * Authentik, Okta, Microsoft Entra ID, Google Workspace, Auth0, Dex, ...) with
 * a handful of `OIDC_*` variables. The server runs the authorization code flow
 * with PKCE as a confidential (or public) client, verifies the ID token against
 * the provider's published keys, applies the optional domain and group
 * allowlists, and mints an `nts_` session token
 * (`providers/oidc-session-token-provider.ts`) that the web app sends as its
 * bearer token.
 *
 * Every URL fetched here (discovery document, token endpoint, JWKS) comes from
 * the operator's configuration, never from a caller.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey
} from "jose";

import {
  isFiniteNumber,
  isJsonObject,
  isNonEmptyString,
  readString,
  type JsonObject,
  type JsonValue
} from "./json-wire.js";

/** Callback path on this server. Registered with the identity provider. */
export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";
/** Path that starts a sign-in. */
export const OIDC_LOGIN_PATH = "/api/auth/oidc/login";

const DEFAULT_SCOPES = ["openid", "email", "profile"];
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SESSION_TTL_SECONDS = 5 * 60;
const MAX_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 10_000;
/** How long a user has to finish signing in at the identity provider. */
export const OIDC_LOGIN_STATE_TTL_SECONDS = 10 * 60;

/** Signature algorithms accepted on ID tokens: asymmetric only. */
const ID_TOKEN_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA"
];

export interface OidcConfig {
  issuer: string;
  clientId: string;
  /** Null for a public client, which then relies on PKCE alone. */
  clientSecret: string | null;
  scopes: string[];
  /** Absolute callback URL registered with the identity provider. */
  redirectUri: string;
  /** Where the browser lands after sign-in, with the session in the fragment. */
  postLoginUrl: string;
  /** Label for the sign-in button. */
  providerName: string;
  sessionTtlSeconds: number;
  /** Lowercase email domains allowed to sign in. Empty allows every domain. */
  allowedDomains: string[];
  /** Groups allowed to sign in. Empty allows every group. */
  allowedGroups: string[];
  /** ID token claim holding the user's groups. */
  groupsClaim: string;
  /** Groups whose members are NodeTool admins. Empty grants admin to nobody. */
  adminGroups: string[];
  /** Whether the login-state cookie must be marked `Secure`. */
  secureCookie: boolean;
}

type Env = Record<string, string | undefined>;

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/** Parse an absolute URL, requiring https except on loopback hosts. */
function requireHttpUrl(name: string, value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL, got "${value}"`);
  }
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return url;
  throw new Error(
    `${name} must use https (plain http is accepted only for localhost), got "${value}"`
  );
}

/** `value` without trailing slashes. A loop, not a regex, so a long run of
 * slashes in a provider's discovery document cannot cost quadratic time. */
function withoutTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* "/" */) end--;
  return value.slice(0, end);
}

/**
 * Read the OIDC configuration from the environment.
 *
 * Returns null when neither `OIDC_ISSUER` nor `OIDC_CLIENT_ID` is set. Throws
 * on a partial or invalid configuration, so a server meant to enforce SSO never
 * boots without it.
 */
export function readOidcConfig(env: Env): OidcConfig | null {
  const issuer = readEnv(env, "OIDC_ISSUER");
  const clientId = readEnv(env, "OIDC_CLIENT_ID");
  if (!issuer && !clientId) return null;
  if (!issuer || !clientId) {
    throw new Error(
      "SSO needs both OIDC_ISSUER and OIDC_CLIENT_ID; only " +
        (issuer ? "OIDC_ISSUER" : "OIDC_CLIENT_ID") +
        " is set."
    );
  }
  requireHttpUrl("OIDC_ISSUER", issuer);

  const publicUrl = readEnv(env, "NODETOOL_PUBLIC_URL");
  const explicitRedirect = readEnv(env, "OIDC_REDIRECT_URL");
  if (!explicitRedirect && !publicUrl) {
    throw new Error(
      "SSO needs NODETOOL_PUBLIC_URL (the address users open NodeTool at) or " +
        `OIDC_REDIRECT_URL (the full ${OIDC_CALLBACK_PATH} URL) to build the ` +
        "redirect URI registered with the identity provider."
    );
  }
  const redirectUri =
    explicitRedirect ?? `${withoutTrailingSlash(publicUrl!)}${OIDC_CALLBACK_PATH}`;
  const redirect = requireHttpUrl(
    explicitRedirect ? "OIDC_REDIRECT_URL" : "NODETOOL_PUBLIC_URL",
    redirectUri
  );

  const postLoginUrl =
    readEnv(env, "AUTH_REDIRECT_URL") ??
    (publicUrl ? `${withoutTrailingSlash(publicUrl)}/` : `${redirect.origin}/`);
  requireHttpUrl("AUTH_REDIRECT_URL", postLoginUrl);

  const ttlRaw = readEnv(env, "OIDC_SESSION_TTL_SECONDS");
  let sessionTtlSeconds = DEFAULT_SESSION_TTL_SECONDS;
  if (ttlRaw !== undefined) {
    const parsed = Number(ttlRaw);
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_SESSION_TTL_SECONDS ||
      parsed > MAX_SESSION_TTL_SECONDS
    ) {
      throw new Error(
        `OIDC_SESSION_TTL_SECONDS must be a whole number between ` +
          `${MIN_SESSION_TTL_SECONDS} and ${MAX_SESSION_TTL_SECONDS}, got "${ttlRaw}"`
      );
    }
    sessionTtlSeconds = parsed;
  }

  const scopes = splitList(readEnv(env, "OIDC_SCOPES"));
  const resolvedScopes = scopes.length > 0 ? scopes : DEFAULT_SCOPES;
  if (!resolvedScopes.includes("openid")) resolvedScopes.unshift("openid");

  return {
    issuer,
    clientId,
    clientSecret: readEnv(env, "OIDC_CLIENT_SECRET") ?? null,
    scopes: resolvedScopes,
    redirectUri,
    postLoginUrl,
    providerName: readEnv(env, "OIDC_PROVIDER_NAME") ?? "SSO",
    sessionTtlSeconds,
    allowedDomains: splitList(readEnv(env, "OIDC_ALLOWED_DOMAINS")).map((d) =>
      d.toLowerCase().replace(/^@/, "")
    ),
    allowedGroups: splitList(readEnv(env, "OIDC_ALLOWED_GROUPS")),
    groupsClaim: readEnv(env, "OIDC_GROUPS_CLAIM") ?? "groups",
    adminGroups: splitList(readEnv(env, "OIDC_ADMIN_GROUPS")),
    secureCookie: redirect.protocol === "https:"
  };
}

// ---------------------------------------------------------------------------
// Login state: carried in a signed, short-lived cookie between /login and
// /callback, so any replica can finish a sign-in another replica started.
// ---------------------------------------------------------------------------

export interface OidcLoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Expiry as whole seconds since the epoch. */
  exp: number;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Fresh state, nonce and PKCE verifier for one sign-in attempt. */
export function createOidcLoginState(now: () => number = Date.now): OidcLoginState {
  return {
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(),
    exp: Math.floor(now() / 1000) + OIDC_LOGIN_STATE_TTL_SECONDS
  };
}

/** Serialize login state into a signed cookie value. */
export function sealOidcLoginState(
  key: Buffer | string,
  loginState: OidcLoginState
): string {
  const encoded = Buffer.from(JSON.stringify(loginState), "utf-8").toString(
    "base64url"
  );
  const mac = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${mac}`;
}

/**
 * Read a login-state cookie back. Null when it is missing, tampered with,
 * malformed or expired.
 */
export function openOidcLoginState(
  key: Buffer | string,
  sealed: string | undefined,
  now: () => number = Date.now
): OidcLoginState | null {
  if (!sealed) return null;
  const separator = sealed.lastIndexOf(".");
  if (separator < 0) return null;
  const encoded = sealed.slice(0, separator);
  const presented = Buffer.from(sealed.slice(separator + 1), "utf-8");
  const expected = Buffer.from(
    createHmac("sha256", key).update(encoded).digest("base64url"),
    "utf-8"
  );
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!isJsonObject(parsed)) return null;
  const { state, nonce, codeVerifier, exp } = parsed;
  if (
    !isNonEmptyString(state) ||
    !isNonEmptyString(nonce) ||
    !isNonEmptyString(codeVerifier) ||
    !isFiniteNumber(exp)
  ) {
    return null;
  }
  if (exp * 1000 <= now()) return null;
  return { state, nonce, codeVerifier, exp };
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf-8");
  const right = Buffer.from(b, "utf-8");
  return left.length === right.length && timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
}

/** A sign-in rejected for a reason the user (or operator) can act on. */
export class OidcSignInError extends Error {
  /** Short machine-readable reason, safe to put in a redirect URL. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OidcSignInError";
    this.code = code;
  }
}

/** The identity a successful sign-in resolves to. */
export interface OidcIdentity {
  /** NodeTool user id, derived from issuer and subject. */
  userId: string;
  subject: string;
  email?: string;
  name?: string;
  /** Groups read from `groupsClaim`; empty when the claim is absent. */
  groups: string[];
}

export interface OidcClientOptions {
  /** Injected for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Injected key set for tests. Defaults to the provider's remote JWKS. */
  jwks?: JWTVerifyGetKey;
}

/**
 * The NodeTool user id for an identity provider subject: 32 lowercase hex
 * characters of SHA-256 over issuer and subject. Stable across sign-ins, safe
 * in storage paths whatever characters the provider puts in `sub`, and scoped
 * to the issuer so two providers cannot collide.
 */
export function oidcUserId(issuer: string, subject: string): string {
  return createHash("sha256")
    .update(`${withoutTrailingSlash(issuer)}\n${subject}`)
    .digest("hex")
    .slice(0, 32);
}

/** A JSON value read as a list of strings: an array's strings, or one string. */
function readStringArray(value: JsonValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => isNonEmptyString(item));
  }
  return isNonEmptyString(value) ? [value] : [];
}

/** Read a possibly nested claim, such as `realm_access.roles`. */
function readClaim(claims: JsonObject, path: string): JsonValue | undefined {
  if (path in claims) return claims[path];
  let current: JsonValue | undefined = claims;
  for (const segment of path.split(".")) {
    if (!isJsonObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** A verified JWT payload as the JSON object it was decoded from. */
function claimsObject(payload: JWTPayload): JsonObject {
  // SAFETY: jose builds the payload with `JSON.parse` and rejects anything
  // that is not an object, so every value in it is a `JsonValue`.
  return payload as JsonObject;
}

/** A response body as a JSON object, or null when it is not one. */
async function readJsonObject(res: Response): Promise<JsonObject | null> {
  try {
    const decoded: JsonValue = await res.json();
    return isJsonObject(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export class OidcClient {
  readonly config: OidcConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly injectedJwks: JWTVerifyGetKey | undefined;
  private discovery: Promise<DiscoveryDocument> | null = null;
  private remoteJwks: JWTVerifyGetKey | null = null;

  constructor(config: OidcConfig, options: OidcClientOptions = {}) {
    this.config = config;
    this.fetchImpl = options.fetch ?? fetch;
    this.injectedJwks = options.jwks;
  }

  /** The provider's discovery document, fetched once and cached. */
  async discover(): Promise<DiscoveryDocument> {
    const pending = (this.discovery ??= this.fetchDiscovery());
    try {
      return await pending;
    } catch (error) {
      // A provider that was down at first use must not stay broken.
      if (this.discovery === pending) this.discovery = null;
      throw error;
    }
  }

  private async fetchDiscovery(): Promise<DiscoveryDocument> {
    const url = `${withoutTrailingSlash(this.config.issuer)}/.well-known/openid-configuration`;
    const res = await this.fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!res.ok) {
      throw new Error(`OIDC discovery failed: GET ${url} returned ${res.status}`);
    }
    const doc = await readJsonObject(res);
    if (!doc) {
      throw new Error(`OIDC discovery failed: ${url} did not return a JSON object`);
    }
    const issuer = readString(doc, "issuer");
    const authorization = readString(doc, "authorization_endpoint");
    const token = readString(doc, "token_endpoint");
    const jwks = readString(doc, "jwks_uri");
    if (!issuer || !authorization || !token || !jwks) {
      throw new Error(
        "OIDC discovery document is missing issuer, authorization_endpoint, " +
          "token_endpoint or jwks_uri"
      );
    }
    // OIDC Discovery §4.3: the issuer in the document must match the one the
    // operator configured, or a misdirected document could vouch for tokens
    // from somewhere else.
    if (withoutTrailingSlash(issuer) !== withoutTrailingSlash(this.config.issuer)) {
      throw new Error(
        `OIDC discovery issuer "${issuer}" does not match OIDC_ISSUER "${this.config.issuer}"`
      );
    }
    for (const [name, value] of [
      ["authorization_endpoint", authorization],
      ["token_endpoint", token],
      ["jwks_uri", jwks]
    ] as const) {
      requireHttpUrl(`OIDC ${name}`, value);
    }
    return {
      issuer,
      authorization_endpoint: authorization,
      token_endpoint: token,
      jwks_uri: jwks,
      token_endpoint_auth_methods_supported: readStringArray(
        doc["token_endpoint_auth_methods_supported"]
      )
    };
  }

  /** The URL to send the browser to for one sign-in attempt. */
  async authorizationUrl(loginState: OidcLoginState): Promise<string> {
    const doc = await this.discover();
    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", this.config.scopes.join(" "));
    url.searchParams.set("state", loginState.state);
    url.searchParams.set("nonce", loginState.nonce);
    url.searchParams.set("code_challenge", pkceChallenge(loginState.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  /**
   * Finish a sign-in: exchange the code, verify the ID token, apply the
   * allowlists, and resolve the NodeTool identity.
   */
  async completeSignIn(
    code: string,
    loginState: OidcLoginState
  ): Promise<OidcIdentity> {
    const idToken = await this.exchangeCode(code, loginState.codeVerifier);
    const claims = await this.verifyIdToken(idToken, loginState.nonce);
    this.authorize(claims);
    const subject = readString(claims, "sub")!;
    return {
      userId: oidcUserId(this.config.issuer, subject),
      subject,
      email: readString(claims, "email"),
      name: readString(claims, "name") ?? readString(claims, "preferred_username"),
      groups: readStringArray(readClaim(claims, this.config.groupsClaim))
    };
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const doc = await this.discover();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier
    });
    const headers = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    });
    const secret = this.config.clientSecret;
    const methods = doc.token_endpoint_auth_methods_supported ?? [];
    // client_secret_basic is the spec default; use client_secret_post only
    // when the provider says it does not accept basic.
    const useBasic =
      secret !== null &&
      (methods.length === 0 || methods.includes("client_secret_basic") ||
        !methods.includes("client_secret_post"));
    if (secret !== null && useBasic) {
      const credentials = `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(secret)}`;
      headers.set("Authorization", `Basic ${Buffer.from(credentials).toString("base64")}`);
    } else {
      body.set("client_id", this.config.clientId);
      if (secret !== null) body.set("client_secret", secret);
    }

    const res = await this.fetchImpl(doc.token_endpoint, {
      method: "POST",
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    const payload = await readJsonObject(res);
    if (!res.ok) {
      const reason = (payload && readString(payload, "error")) ?? `HTTP ${res.status}`;
      throw new OidcSignInError(
        "token_exchange_failed",
        `The identity provider refused the authorization code (${reason})`
      );
    }
    const idToken = payload ? readString(payload, "id_token") : undefined;
    if (!idToken) {
      throw new OidcSignInError(
        "token_exchange_failed",
        "The identity provider's token response has no id_token"
      );
    }
    return idToken;
  }

  private async keySet(): Promise<JWTVerifyGetKey> {
    if (this.injectedJwks) return this.injectedJwks;
    if (!this.remoteJwks) {
      const doc = await this.discover();
      this.remoteJwks = createRemoteJWKSet(new URL(doc.jwks_uri), {
        timeoutDuration: FETCH_TIMEOUT_MS
      });
    }
    return this.remoteJwks;
  }

  /** Verify signature, issuer, audience, expiry, nonce and `azp`. */
  async verifyIdToken(idToken: string, nonce: string): Promise<JsonObject> {
    const doc = await this.discover();
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, await this.keySet(), {
        issuer: doc.issuer,
        audience: this.config.clientId,
        algorithms: ID_TOKEN_ALGORITHMS,
        requiredClaims: ["sub", "exp", "iat"],
        clockTolerance: 60
      }));
    } catch (error) {
      throw new OidcSignInError(
        "invalid_id_token",
        `The ID token failed verification: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const claims = claimsObject(payload);
    const presentedNonce = readString(claims, "nonce");
    if (!presentedNonce || !safeEqual(presentedNonce, nonce)) {
      throw new OidcSignInError("invalid_id_token", "The ID token nonce does not match");
    }
    // OIDC Core §3.1.3.7: with several audiences, azp must name this client.
    const audiences = readStringArray(claims["aud"]);
    const azp = claims["azp"];
    if (
      (audiences.length > 1 || azp !== undefined) &&
      azp !== this.config.clientId
    ) {
      throw new OidcSignInError(
        "invalid_id_token",
        "The ID token was issued to a different client (azp)"
      );
    }
    if (!readString(claims, "sub")) {
      throw new OidcSignInError("invalid_id_token", "The ID token has no subject");
    }
    return claims;
  }

  /** Apply the domain and group allowlists. Throws when the user is refused. */
  authorize(claims: JsonObject): void {
    const { allowedDomains, allowedGroups, groupsClaim } = this.config;
    if (allowedDomains.length > 0) {
      const email = readString(claims, "email");
      if (!email || claims["email_verified"] === false) {
        throw new OidcSignInError(
          "not_allowed",
          "The identity provider sent no verified email address, which OIDC_ALLOWED_DOMAINS requires"
        );
      }
      const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
      if (!allowedDomains.includes(domain)) {
        throw new OidcSignInError(
          "not_allowed",
          `Email domain "${domain}" is not in OIDC_ALLOWED_DOMAINS`
        );
      }
    }
    if (allowedGroups.length > 0) {
      const groups = readStringArray(readClaim(claims, groupsClaim));
      if (!groups.some((group) => allowedGroups.includes(group))) {
        throw new OidcSignInError(
          "not_allowed",
          `The user is in none of the OIDC_ALLOWED_GROUPS (claim "${groupsClaim}")`
        );
      }
    }
  }
}
