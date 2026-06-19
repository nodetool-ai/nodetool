/**
 * Codex OAuth token resolution.
 *
 * The Codex login flow stores its tokens as an {@link OAuthCredential} under
 * provider `"openai"`. The `codex` provider consumes the access token via
 * `getSecret("CODEX_ACCESS_TOKEN")`; this module returns a currently-valid
 * token, refreshing it against the OpenAI token endpoint when it has (nearly)
 * expired and persisting the rotated tokens back.
 */

import {
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_TOKEN_URL
} from "@nodetool-ai/protocol";
import { createLogger } from "@nodetool-ai/config";
import { OAuthCredential } from "./oauth-credential.js";

const log = createLogger("nodetool.models.codex-token");

/** Treat a token expiring within this window as already expired. */
const EXPIRY_SKEW_MS = 60_000;

/** The Codex credential is stored under the "openai" provider namespace. */
const CODEX_CREDENTIAL_PROVIDER = "openai";

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

/** Refresh the credential's access token in place. Returns the new token. */
async function refreshCredential(
  credential: OAuthCredential
): Promise<string | null> {
  const refreshToken = await credential.getDecryptedRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CODEX_OAUTH_CLIENT_ID
    }).toString()
  });

  if (!res.ok) {
    log.warn("Codex token refresh failed", { status: res.status });
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
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    tokenType: typeof body.token_type === "string" ? body.token_type : undefined,
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
 * Resolve a valid Codex access token for a user, or null when the user has not
 * connected via the OpenAI/Codex login. Refreshes a (nearly) expired token.
 */
export async function resolveCodexAccessToken(
  userId: string
): Promise<string | null> {
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    CODEX_CREDENTIAL_PROVIDER
  );
  // listForUserAndProvider is ordered by updated_at desc — use the freshest.
  const credential = credentials[0];
  if (!credential) return null;

  if (isExpired(credential.expires_at)) {
    try {
      const refreshed = await refreshCredential(credential);
      if (refreshed) return refreshed;
      // Refresh failed — fall through and return the stored (expired) token so
      // the caller surfaces a 401 rather than silently dropping the provider.
    } catch (err) {
      log.warn("Codex token refresh threw", { error: String(err) });
    }
  }

  return credential.getDecryptedAccessToken();
}
