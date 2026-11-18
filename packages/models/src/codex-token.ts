/**
 * Sign in with ChatGPT token resolution.
 *
 * The login flow stores each ChatGPT sign-in as an {@link OAuthCredential}
 * under provider {@link CHATGPT_CREDENTIAL_PROVIDER}, with `account_id` set to
 * `<issued client id>:<verified sub>`. The `codex` provider consumes the access
 * token via `getSecret("CODEX_ACCESS_TOKEN")`. This module returns a usable
 * token, refreshing it with the issued client id when it has (nearly) expired
 * and persisting the rotated tokens back.
 *
 * Follows OpenAI's guide:
 * https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt
 */

import {
  CHATGPT_CREDENTIAL_PROVIDER,
  CHATGPT_DIRECT_SCOPE,
  CHATGPT_OAUTH_AUTHORIZATION_URL,
  CHATGPT_OAUTH_ISSUER,
  CHATGPT_OAUTH_RESOURCE,
  CHATGPT_OAUTH_TOKEN_URL
} from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { OAuthCredential } from "./oauth-credential.js";

const log = createLogger("nodetool.models.codex-token");

/** Treat a token expiring within this window as already expired. */
const EXPIRY_SKEW_MS = 60_000;

/** How long to stop retrying after a refresh fails for a transient reason. */
const REFRESH_COOLDOWN_MS = 5 * 60_000;

/**
 * Refresh errors after which the stored tokens can never work again. The
 * guide: clear them and sign in again with the saved issued client id.
 */
const TERMINAL_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
  "invalid_client"
]);

// ── OIDC discovery ───────────────────────────────────────────────────

/** The endpoints NodeTool uses from OpenAI's OpenID configuration. */
export interface ChatGptOAuthEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
  jwksUri: string | null;
}

let discoveryPromise: Promise<ChatGptOAuthEndpoints> | null = null;

function sameOriginAsIssuer(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).origin === CHATGPT_OAUTH_ISSUER;
  } catch {
    return false;
  }
}

async function fetchDiscovery(): Promise<ChatGptOAuthEndpoints> {
  const res = await fetch(
    `${CHATGPT_OAUTH_ISSUER}/.well-known/openid-configuration`,
    { headers: { accept: "application/json" }, redirect: "error" }
  );
  if (!res.ok) {
    throw new Error(`OpenID configuration request failed (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  if (
    data.issuer !== CHATGPT_OAUTH_ISSUER ||
    !sameOriginAsIssuer(data.authorization_endpoint) ||
    !sameOriginAsIssuer(data.token_endpoint) ||
    !sameOriginAsIssuer(data.jwks_uri) ||
    (data.revocation_endpoint !== undefined &&
      !sameOriginAsIssuer(data.revocation_endpoint))
  ) {
    throw new Error("OpenID configuration could not be verified");
  }
  return {
    issuer: CHATGPT_OAUTH_ISSUER,
    authorizationEndpoint: data.authorization_endpoint,
    tokenEndpoint: data.token_endpoint,
    revocationEndpoint: sameOriginAsIssuer(data.revocation_endpoint)
      ? data.revocation_endpoint
      : null,
    jwksUri: data.jwks_uri
  };
}

/**
 * OpenAI's OAuth endpoints from OIDC discovery, cached for the process. When
 * discovery is unreachable this falls back to the documented authorization and
 * token endpoints, without a JWKS or revocation endpoint, and retries discovery
 * on the next call.
 */
export async function discoverChatGptOAuth(): Promise<ChatGptOAuthEndpoints> {
  discoveryPromise ??= fetchDiscovery().catch((err: unknown) => {
    discoveryPromise = null;
    throw err;
  });
  try {
    return await discoveryPromise;
  } catch (err) {
    log.warn("ChatGPT OpenID discovery failed, using documented endpoints", {
      error: err instanceof Error ? err.message : String(err)
    });
    return {
      issuer: CHATGPT_OAUTH_ISSUER,
      authorizationEndpoint: CHATGPT_OAUTH_AUTHORIZATION_URL,
      tokenEndpoint: CHATGPT_OAUTH_TOKEN_URL,
      revocationEndpoint: null,
      jwksUri: null
    };
  }
}

/** Drop the cached discovery document. Tests only. */
export function resetChatGptDiscoveryForTests(): void {
  discoveryPromise = null;
}

// ── Credential rows ──────────────────────────────────────────────────

/** `account_id` for a ChatGPT sign-in: the issued client id and the verified `sub`. */
export function chatGptAccountKey(clientId: string, subject: string): string {
  return `${clientId}:${subject}`;
}

/** Split a ChatGPT credential's `account_id` back into client id and subject. */
export function parseChatGptAccountKey(
  accountId: string
): { clientId: string; subject: string } | null {
  const sep = accountId.indexOf(":");
  if (sep <= 0 || sep === accountId.length - 1) return null;
  return {
    clientId: accountId.slice(0, sep),
    subject: accountId.slice(sep + 1)
  };
}

/** Whether the granted scopes allow requests on the user's ChatGPT plan. */
export function hasChatGptPlanScope(scope: string | null | undefined): boolean {
  return (scope ?? "").split(/\s+/).includes(CHATGPT_DIRECT_SCOPE);
}

/**
 * Whether a ChatGPT credential holds tokens that can call the API: it was
 * granted the plan scope and was not cleared by a disconnect or a terminal
 * refresh failure.
 */
export function isUsableChatGptCredential(credential: OAuthCredential): boolean {
  return (
    parseChatGptAccountKey(credential.account_id) !== null &&
    credential.encrypted_refresh_token !== null &&
    hasChatGptPlanScope(credential.scope)
  );
}

/**
 * The sign-in to reuse for the user's next authorization: the most recently
 * updated ChatGPT row, usable or not. Its issued client id keeps NodeTool to
 * one registration per account instead of registering a new app every time.
 */
export async function findChatGptRegistration(userId: string): Promise<{
  clientId: string;
  subject: string;
  email: string | null;
  planScopeGranted: boolean;
} | null> {
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    CHATGPT_CREDENTIAL_PROVIDER
  );
  for (const credential of credentials) {
    const key = parseChatGptAccountKey(credential.account_id);
    if (!key) continue;
    return {
      ...key,
      email: credential.username,
      planScopeGranted: hasChatGptPlanScope(credential.scope)
    };
  }
  return null;
}

// ── Refresh ──────────────────────────────────────────────────────────

/**
 * One refresh per credential at a time. OpenAI rotates the refresh token, so
 * parallel refreshes race: the first consumes it and the rest are rejected as
 * reused, which would end the sign-in.
 */
const inFlight = new Map<string, Promise<string | null>>();

/** Credential id -> epoch ms before which no refresh is attempted again. */
const cooldownUntil = new Map<string, number>();

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return Date.now() >= expiryMs - EXPIRY_SKEW_MS;
}

function refreshErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as Record<string, unknown>).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** Refresh the credential's access token in place. Returns the new token. */
async function refreshCredential(
  credential: OAuthCredential
): Promise<string | null> {
  const key = parseChatGptAccountKey(credential.account_id);
  const refreshToken = await credential.getDecryptedRefreshToken();
  if (!key || !refreshToken) return null;

  const { tokenEndpoint } = await discoverChatGptOAuth();
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    redirect: "error",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: key.clientId,
      refresh_token: refreshToken,
      resource: CHATGPT_OAUTH_RESOURCE
    }).toString()
  });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const code = refreshErrorCode(body);
    if (code && TERMINAL_REFRESH_ERRORS.has(code)) {
      // The sign-in is over. Drop the tokens but keep the row, so the next
      // sign-in reuses this account's issued client id.
      await credential.clearTokens();
      cooldownUntil.delete(credential.id);
      log.warn("ChatGPT sign-in ended, sign in again", { code });
      return null;
    }
    // Keep the tokens through a network or service failure.
    cooldownUntil.set(credential.id, Date.now() + REFRESH_COOLDOWN_MS);
    log.warn("ChatGPT token refresh failed, will retry", {
      status: res.status,
      code,
      retryAfterMs: REFRESH_COOLDOWN_MS
    });
    return null;
  }

  cooldownUntil.delete(credential.id);
  const data = (body ?? {}) as Record<string, unknown>;
  const accessToken =
    typeof data.access_token === "string" && data.access_token
      ? data.access_token
      : null;
  const expiresIn =
    typeof data.expires_in === "number" && data.expires_in > 0
      ? data.expires_in
      : null;
  if (!accessToken || expiresIn === null) {
    log.warn("ChatGPT token refresh returned incomplete credentials");
    return null;
  }

  // Access token, expiry, scopes and the rotated refresh token change together.
  // OAuth may omit `scope` on refresh when the granted scopes are unchanged.
  await credential.updateTokens({
    accessToken,
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    tokenType: typeof data.token_type === "string" ? data.token_type : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined,
    receivedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  });
  return accessToken;
}

/** Refresh a credential, joining any refresh already running for it. */
function refreshOnce(credential: OAuthCredential): Promise<string | null> {
  const running = inFlight.get(credential.id);
  if (running) return running;
  const pending = refreshCredential(credential).finally(() => {
    inFlight.delete(credential.id);
  });
  inFlight.set(credential.id, pending);
  return pending;
}

/**
 * Resolve a ChatGPT plan access token for a user, or null when the user has
 * no usable Sign in with ChatGPT credential. Refreshes a (nearly) expired
 * token. Credentials from the earlier Codex CLI login are ignored: they were
 * not issued for the public API, so the user signs in again.
 */
export async function resolveCodexAccessToken(
  userId: string
): Promise<string | null> {
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    CHATGPT_CREDENTIAL_PROVIDER
  );
  // listForUserAndProvider is ordered by updated_at desc: use the freshest.
  const credential = credentials.find(isUsableChatGptCredential);
  if (!credential) return null;

  const cooldown = cooldownUntil.get(credential.id) ?? 0;
  if (isExpired(credential.expires_at) && Date.now() >= cooldown) {
    try {
      const refreshed = await refreshOnce(credential);
      if (refreshed) return refreshed;
      if (credential.encrypted_refresh_token === null) return null;
      // A transient failure: return the stored (expired) token so the caller
      // surfaces a 401 rather than silently dropping the provider.
    } catch (err) {
      log.warn("ChatGPT token refresh threw", { error: String(err) });
    }
  }

  return credential.getDecryptedAccessToken();
}
