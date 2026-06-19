/**
 * OAuthClient — the protocol layer. Builds authorization URLs and performs the
 * token-endpoint round-trips (code exchange, refresh, revoke).
 *
 * It is pure protocol: no browser, no storage, no provider awareness. `fetch`
 * and the clock are injected so the whole thing is deterministically testable,
 * and every failure is mapped to a typed error. Tokens are never logged.
 */

import { createLogger, type Logger } from "@nodetool-ai/config";
import {
  CredentialsRevokedError,
  InvalidRefreshTokenError,
  OAuthError,
  OAuthNetworkError,
  TokenExchangeError
} from "./errors.js";
import { redactObject } from "./redaction.js";
import {
  type AuthorizationUrlParams,
  type Clock,
  type OAuthClientConfig,
  type OAuthTokens,
  systemClock
} from "./types.js";

/** Minimal `fetch` surface this client needs — satisfied by global `fetch`. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface OAuthClientOptions {
  readonly config: OAuthClientConfig;
  /** Injected fetch. Defaults to the global. */
  readonly fetchFn?: FetchLike;
  readonly clock?: Clock;
  readonly logger?: Logger;
}

/** Raw token response shape per RFC 6749 §5.1. */
interface TokenResponseBody {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export class OAuthClient {
  private readonly config: OAuthClientConfig;
  private readonly fetchFn: FetchLike;
  private readonly clock: Clock;
  private readonly logger: Logger;

  constructor(options: OAuthClientOptions) {
    this.config = options.config;
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
    this.clock = options.clock ?? systemClock;
    this.logger = options.logger ?? createLogger("nodetool.runtime.oauth.client");
  }

  /** Build the authorization-endpoint URL the browser should open. */
  buildAuthorizationUrl(params: AuthorizationUrlParams): string {
    const url = new URL(this.config.authorizationEndpoint);
    const q = url.searchParams;
    q.set("response_type", "code");
    q.set("client_id", this.config.clientId);
    q.set("redirect_uri", params.redirectUri);
    q.set("scope", this.config.scopes.join(" "));
    q.set("state", params.state);
    q.set("code_challenge", params.codeChallenge);
    q.set("code_challenge_method", params.codeChallengeMethod);
    if (this.config.audience) q.set("audience", this.config.audience);
    for (const [k, v] of Object.entries(this.config.extraAuthParams ?? {})) {
      q.set(k, v);
    }
    return url.toString();
  }

  /** Exchange an authorization code for an initial token set. */
  async exchangeAuthorizationCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    signal?: AbortSignal;
  }): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: this.config.clientId,
      code_verifier: params.codeVerifier
    });
    return this.tokenRequest(body, params.signal, "exchange");
  }

  /** Exchange a refresh token for a fresh access token. */
  async refreshAccessToken(refreshToken: string, signal?: AbortSignal): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId
    });
    if (this.config.scopes.length > 0) {
      body.set("scope", this.config.scopes.join(" "));
    }
    return this.tokenRequest(body, signal, "refresh");
  }

  /** Best-effort RFC 7009 token revocation. No-op if no endpoint configured. */
  async revokeToken(
    token: string,
    tokenTypeHint: "access_token" | "refresh_token" = "refresh_token",
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.config.revocationEndpoint) return;
    const body = new URLSearchParams({
      token,
      token_type_hint: tokenTypeHint,
      client_id: this.config.clientId
    });
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchFn(this.config.revocationEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: body.toString(),
        signal
      });
    } catch (err) {
      throw new OAuthNetworkError("Network error during token revocation", { cause: err });
    }
    // RFC 7009: the server returns 200 even for an already-invalid token.
    if (!res.ok) {
      this.logger.warn("Token revocation returned a non-OK status", { status: res.status });
    }
  }

  private async tokenRequest(
    body: URLSearchParams,
    signal: AbortSignal | undefined,
    kind: "exchange" | "refresh"
  ): Promise<OAuthTokens> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchFn(this.config.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: body.toString(),
        signal
      });
    } catch (err) {
      throw new OAuthNetworkError(`Network error during token ${kind}`, { cause: err });
    }

    const payload = await this.readJson(res);

    if (!res.ok) {
      throw this.mapErrorResponse(res.status, payload, kind);
    }

    return this.normalizeTokens(payload, kind);
  }

  private async readJson(res: Awaited<ReturnType<FetchLike>>): Promise<TokenResponseBody> {
    try {
      return (await res.json()) as TokenResponseBody;
    } catch {
      // Some servers send an empty / non-JSON error body.
      return {};
    }
  }

  private mapErrorResponse(status: number, payload: TokenResponseBody, kind: string): OAuthError {
    const code = typeof payload.error === "string" ? payload.error : undefined;
    const description =
      typeof payload.error_description === "string" ? payload.error_description : undefined;
    // Never include the raw body in the message; log a redacted copy instead.
    this.logger.warn("Token endpoint returned an error", {
      status,
      kind,
      error: code,
      body: redactObject(payload)
    });

    const message = description ? `Token ${kind} failed: ${code ?? status}` : `Token ${kind} failed (${status})`;

    if (code === "invalid_grant") {
      return kind === "refresh"
        ? new InvalidRefreshTokenError(message)
        : new TokenExchangeError(message);
    }
    if (code === "access_denied" || code === "revoked_token" || code === "invalid_client") {
      return new CredentialsRevokedError(message);
    }
    if (status >= 500) {
      return new OAuthNetworkError(`Token ${kind} failed: server error ${status}`);
    }
    return new TokenExchangeError(message);
  }

  private normalizeTokens(payload: TokenResponseBody, kind: string): OAuthTokens {
    const accessToken = payload.access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw new TokenExchangeError(`Token ${kind} response missing access_token`);
    }
    const receivedAt = this.clock.now();
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : null;
    return {
      accessToken,
      refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
      tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
      scope: typeof payload.scope === "string" ? payload.scope : null,
      expiresAt: expiresIn != null ? receivedAt + expiresIn * 1000 : null,
      receivedAt
    };
  }
}
