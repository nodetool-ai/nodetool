/**
 * ClaudeCodeOAuthClient — the protocol layer for the Claude Code login.
 *
 * Anthropic's OAuth server does not follow RFC 6749's form-encoded token
 * endpoint: the `claude` CLI posts a JSON body and echoes the CSRF `state` back
 * in the code exchange, and the authorization URL carries an extra `code=true`
 * flag. Those three deviations are why this is a sibling of {@link OAuthClient}
 * rather than a configuration of it; everything else (typed errors, redaction,
 * injected fetch/clock, never logging token material) is shared.
 */

import { createLogger, type Logger } from "@nodetool-ai/config";
import {
  CLAUDE_CODE_OAUTH_AUTHORIZATION_URL,
  CLAUDE_CODE_OAUTH_CLIENT_ID,
  CLAUDE_CODE_OAUTH_CONSOLE_AUTHORIZATION_URL,
  CLAUDE_CODE_OAUTH_PROFILE_URL,
  CLAUDE_CODE_OAUTH_REFRESH_SCOPES,
  CLAUDE_CODE_OAUTH_SCOPES,
  CLAUDE_CODE_OAUTH_TOKEN_URL
} from "@nodetool-ai/protocol";
import {
  CredentialsRevokedError,
  InvalidRefreshTokenError,
  OAuthError,
  OAuthNetworkError,
  TokenExchangeError
} from "./errors.js";
import { redactObject } from "./redaction.js";
import { type Clock, systemClock } from "./types.js";
import { isNonEmptyString, isNumber } from "../../type-predicates.js";

/** Minimal `fetch` surface this client needs — satisfied by global `fetch`. */
export type JsonFetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  /** Decode the body as the caller's named response type. */
  json<TBody>(): Promise<TBody>;
}>;

/** Which sign-in page the authorization URL points at. */
export type ClaudeCodeLoginMethod = "claude-ai" | "console";

/**
 * A Claude Code token set. Shaped like the credential file's `claudeAiOauth`
 * entry rather than {@link OAuthTokens}, because that file — not an in-memory
 * session — is the thing this flow exists to produce.
 */
export interface ClaudeCodeTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** Absolute expiry in epoch ms, or null when the server sends no expiry. */
  readonly expiresAt: number | null;
  readonly scopes: readonly string[];
  /** Account/organization identity echoed by the token endpoint, if any. */
  readonly account: ClaudeCodeTokenAccount | null;
}

export interface ClaudeCodeTokenAccount {
  readonly uuid: string | null;
  readonly emailAddress: string | null;
  readonly organizationUuid: string | null;
}

/** Non-secret account metadata used to label the connection in the UI. */
export interface ClaudeCodeProfile {
  /** "max" | "pro" | "team" | "enterprise", or null for API-billed orgs. */
  readonly subscriptionType: string | null;
  readonly rateLimitTier: string | null;
  readonly emailAddress: string | null;
  readonly displayName: string | null;
  readonly organizationName: string | null;
}

export interface AuthorizationUrlOptions {
  readonly codeChallenge: string;
  readonly state: string;
  /**
   * Loopback redirect the browser is sent back to. Omit for the manual flow,
   * where the console displays a `code#state` string for the user to paste.
   */
  readonly redirectUri: string;
  /** claude.ai (subscription) or the console (API billing). Default claude.ai. */
  readonly loginMethod?: ClaudeCodeLoginMethod;
}

interface ClaudeCodeOAuthClientOptions {
  /** Override the published Claude Code client id. */
  readonly clientId?: string;
  readonly tokenEndpoint?: string;
  readonly profileEndpoint?: string;
  /** Injected fetch. Defaults to the global. */
  readonly fetchFn?: JsonFetchLike;
  readonly clock?: Clock;
  readonly logger?: Logger;
}

/** Raw token-endpoint response. Every field is validated before use. */
interface ClaudeTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  account?: { uuid?: unknown; email_address?: unknown } | null;
  organization?: { uuid?: unknown } | null;
  error?: unknown;
  error_description?: unknown;
}

/** Raw profile-endpoint response. Every field is validated before use. */
interface ClaudeProfileResponse {
  account?: { email_address?: unknown; display_name?: unknown } | null;
  organization?: {
    organization_type?: unknown;
    rate_limit_tier?: unknown;
    name?: unknown;
  } | null;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class ClaudeCodeOAuthClient {
  private readonly clientId: string;
  private readonly tokenEndpoint: string;
  private readonly profileEndpoint: string;
  private readonly fetchFn: JsonFetchLike;
  private readonly clock: Clock;
  private readonly logger: Logger;

  constructor(options: ClaudeCodeOAuthClientOptions = {}) {
    this.clientId = options.clientId ?? CLAUDE_CODE_OAUTH_CLIENT_ID;
    this.tokenEndpoint = options.tokenEndpoint ?? CLAUDE_CODE_OAUTH_TOKEN_URL;
    this.profileEndpoint =
      options.profileEndpoint ?? CLAUDE_CODE_OAUTH_PROFILE_URL;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.clock = options.clock ?? systemClock;
    this.logger =
      options.logger ?? createLogger("nodetool.runtime.oauth.claude-code");
  }

  /** Build the authorization-endpoint URL the browser should open. */
  buildAuthorizationUrl(options: AuthorizationUrlOptions): string {
    const base =
      options.loginMethod === "console"
        ? CLAUDE_CODE_OAUTH_CONSOLE_AUTHORIZATION_URL
        : CLAUDE_CODE_OAUTH_AUTHORIZATION_URL;
    const url = new URL(base);
    const q = url.searchParams;
    // `code=true` asks the server for the paste-able code display in addition
    // to the redirect — the CLI sets it on both variants of the URL.
    q.set("code", "true");
    q.set("client_id", this.clientId);
    q.set("response_type", "code");
    q.set("redirect_uri", options.redirectUri);
    q.set("scope", CLAUDE_CODE_OAUTH_SCOPES.join(" "));
    q.set("code_challenge", options.codeChallenge);
    q.set("code_challenge_method", "S256");
    q.set("state", options.state);
    return url.toString();
  }

  /**
   * Exchange an authorization code for a token set. `redirectUri` must be the
   * exact value used in the authorization request, and `state` is echoed back
   * in the body — Anthropic's token endpoint rejects the exchange without it.
   */
  async exchangeAuthorizationCode(params: {
    code: string;
    state: string;
    codeVerifier: string;
    redirectUri: string;
    signal?: AbortSignal;
  }): Promise<ClaudeCodeTokens> {
    return this.tokenRequest(
      {
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: this.clientId,
        code_verifier: params.codeVerifier,
        state: params.state
      },
      params.signal,
      "exchange"
    );
  }

  /** Exchange a refresh token for a fresh access token. */
  async refreshAccessToken(
    refreshToken: string,
    signal?: AbortSignal
  ): Promise<ClaudeCodeTokens> {
    const tokens = await this.tokenRequest(
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
        scope: CLAUDE_CODE_OAUTH_REFRESH_SCOPES.join(" ")
      },
      signal,
      "refresh"
    );
    // The server may omit `refresh_token` on refresh; the old one stays valid.
    return tokens.refreshToken ? tokens : { ...tokens, refreshToken };
  }

  /**
   * Best-effort account lookup for a friendly label. Returns null when the
   * endpoint is unreachable or the token lacks `user:profile` — a missing
   * label must never fail a login.
   */
  async fetchProfile(
    accessToken: string,
    signal?: AbortSignal
  ): Promise<ClaudeCodeProfile | null> {
    try {
      const res = await this.fetchFn(this.profileEndpoint, {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json"
        },
        signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!res.ok) return null;
      const body = await res.json<ClaudeProfileResponse>();
      return {
        subscriptionType: subscriptionTypeOf(
          body.organization?.organization_type
        ),
        rateLimitTier: str(body.organization?.rate_limit_tier),
        emailAddress: str(body.account?.email_address),
        displayName: str(body.account?.display_name),
        organizationName: str(body.organization?.name)
      };
    } catch (err) {
      this.logger.debug("Claude Code profile lookup failed", {
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  }

  private async tokenRequest(
    body: Record<string, string>,
    signal: AbortSignal | undefined,
    kind: "exchange" | "refresh"
  ): Promise<ClaudeCodeTokens> {
    let res: Awaited<ReturnType<JsonFetchLike>>;
    try {
      res = await this.fetchFn(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err) {
      throw new OAuthNetworkError(`Network error during token ${kind}`, {
        cause: err
      });
    }

    let payload: ClaudeTokenResponse;
    try {
      payload = await res.json<ClaudeTokenResponse>();
    } catch {
      payload = {};
    }

    if (!res.ok) throw this.mapErrorResponse(res.status, payload, kind);
    return this.normalizeTokens(payload, kind);
  }

  private mapErrorResponse(
    status: number,
    payload: ClaudeTokenResponse,
    kind: string
  ): OAuthError {
    const code = str(payload.error);
    // Never include the raw body in the message; log a redacted copy instead.
    this.logger.warn("Claude token endpoint returned an error", {
      status,
      kind,
      error: code,
      body: redactObject(payload)
    });

    const message = `Token ${kind} failed: ${code ?? status}`;
    if (code === "invalid_grant" || status === 401) {
      return kind === "refresh"
        ? new InvalidRefreshTokenError(message)
        : new TokenExchangeError(
            "Authentication failed: invalid or expired authorization code"
          );
    }
    if (code === "access_denied" || code === "invalid_client") {
      return new CredentialsRevokedError(message);
    }
    if (status >= 500) {
      return new OAuthNetworkError(
        `Token ${kind} failed: server error ${status}`
      );
    }
    return new TokenExchangeError(message);
  }

  private normalizeTokens(
    payload: ClaudeTokenResponse,
    kind: string
  ): ClaudeCodeTokens {
    const accessToken = str(payload.access_token);
    if (!accessToken) {
      throw new TokenExchangeError(
        `Token ${kind} response missing access_token`
      );
    }
    const expiresIn = isNumber(payload.expires_in) ? payload.expires_in : null;
    const scope = str(payload.scope);
    const accountUuid = str(payload.account?.uuid);
    const email = str(payload.account?.email_address);
    const orgUuid = str(payload.organization?.uuid);
    return {
      accessToken,
      refreshToken: str(payload.refresh_token),
      expiresAt: expiresIn != null ? this.clock.now() + expiresIn * 1000 : null,
      scopes: scope ? scope.split(" ").filter(Boolean) : [],
      account:
        accountUuid || email || orgUuid
          ? {
              uuid: accountUuid,
              emailAddress: email,
              organizationUuid: orgUuid
            }
          : null
    };
  }
}

/** Map the API's organization type onto the plan label the CLI displays. */
function subscriptionTypeOf(organizationType: unknown): string | null {
  switch (organizationType) {
    case "claude_max":
      return "max";
    case "claude_pro":
      return "pro";
    case "claude_team":
      return "team";
    case "claude_enterprise":
      return "enterprise";
    default:
      return null;
  }
}

function str(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}
