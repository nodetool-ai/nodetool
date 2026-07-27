/**
 * Google Workspace OAuth token resolution.
 *
 * In production the web app signs in through Supabase's Google provider, which
 * hands back a Google `provider_token` (and, with `access_type=offline`, a
 * `provider_refresh_token`). The frontend posts those to
 * `POST /api/oauth/google/session`, which stores them as an
 * {@link OAuthCredential} under provider `"google"`.
 *
 * Tools and nodes consume the access token via
 * `getSecret("GOOGLE_ACCESS_TOKEN")`; this module returns a currently-valid
 * token, refreshing it against Google's token endpoint when it has (nearly)
 * expired and persisting the rotated token back.
 */

import { createLogger } from "@nodetool-ai/config";
import { OAuthCredential } from "./oauth-credential.js";

const log = createLogger("nodetool.models.google-token");

/** Treat a token expiring within this window as already expired. */
const EXPIRY_SKEW_MS = 60_000;

/** Provider namespace the Google login credential is stored under. */
export const GOOGLE_CREDENTIAL_PROVIDER = "google";

/** Virtual secret key that resolves to a valid Google access token. */
export const GOOGLE_ACCESS_TOKEN_KEY = "GOOGLE_ACCESS_TOKEN";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return Date.now() >= expiryMs - EXPIRY_SKEW_MS;
}

interface RefreshResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
}

/**
 * Refresh the credential's access token in place. Returns the new token, or
 * null when there is no refresh token or no configured Google OAuth client.
 *
 * The client id/secret are the same pair configured in the Supabase dashboard
 * for the Google provider — Supabase does not refresh provider tokens for us,
 * so the server needs them to keep a long-running agent alive past the one-hour
 * Google access-token lifetime.
 */
async function refreshCredential(
  credential: OAuthCredential
): Promise<string | null> {
  const refreshToken = await credential.getDecryptedRefreshToken();
  if (!refreshToken) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    log.warn(
      "Google token expired but GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are unset"
    );
    return null;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });

  if (!res.ok) {
    log.warn("Google token refresh failed", { status: res.status });
    return null;
  }

  const body = (await res.json()) as RefreshResponse;
  const accessToken =
    typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken) return null;

  const expiresIn =
    typeof body.expires_in === "number" ? body.expires_in : null;
  await credential.updateTokens({
    accessToken,
    // Google only returns a new refresh token on re-consent; keep the old one.
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    tokenType:
      typeof body.token_type === "string" ? body.token_type : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
    receivedAt: new Date().toISOString(),
    expiresAt:
      expiresIn != null
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : undefined
  });
  return accessToken;
}

/**
 * Resolve a valid Google access token for a user, or null when the user has
 * not signed in with Google. Refreshes a (nearly) expired token when a refresh
 * token and OAuth client credentials are available.
 */
export async function resolveGoogleAccessToken(
  userId: string
): Promise<string | null> {
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    GOOGLE_CREDENTIAL_PROVIDER
  );
  // listForUserAndProvider is ordered by updated_at desc — use the freshest.
  const credential = credentials[0];
  if (!credential) return null;

  if (isExpired(credential.expires_at)) {
    try {
      const refreshed = await refreshCredential(credential);
      if (refreshed) return refreshed;
      // Refresh unavailable or failed — return the stored token anyway so the
      // caller surfaces Google's own 401 instead of a vague "not connected".
    } catch (err) {
      log.warn("Google token refresh threw", { error: String(err) });
    }
  }

  return credential.getDecryptedAccessToken();
}

/** The Google scopes the stored credential was granted, or an empty array. */
export async function getGoogleGrantedScopes(
  userId: string
): Promise<string[]> {
  const [credential] = await OAuthCredential.listForUserAndProvider(
    userId,
    GOOGLE_CREDENTIAL_PROVIDER
  );
  if (!credential?.scope) return [];
  return credential.scope.split(/\s+/).filter(Boolean);
}

/**
 * Persist the Google tokens handed to the browser by a Supabase Google login.
 *
 * `accountId` is the Google account identity (the Supabase user id when the
 * Google `sub` is not available), so re-logins update one row per account.
 */
export async function storeGoogleCredential(opts: {
  userId: string;
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  email?: string | null;
  scope?: string | null;
  expiresAt?: string | null;
}): Promise<OAuthCredential> {
  return OAuthCredential.upsert({
    user_id: opts.userId,
    provider: GOOGLE_CREDENTIAL_PROVIDER,
    account_id: opts.accountId,
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken ?? null,
    username: opts.email ?? null,
    token_type: "Bearer",
    scope: opts.scope ?? null,
    received_at: new Date().toISOString(),
    expires_at: opts.expiresAt ?? null
  });
}

/** Delete every stored Google credential for a user. Returns the count. */
export async function deleteGoogleCredentials(
  userId: string
): Promise<number> {
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    GOOGLE_CREDENTIAL_PROVIDER
  );
  for (const credential of credentials) {
    await credential.delete();
  }
  return credentials.length;
}
