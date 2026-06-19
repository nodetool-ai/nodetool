/**
 * OpenAIOAuthProvider — an OpenAI provider authenticated by browser-based
 * OAuth 2.0 (Authorization Code + PKCE) instead of a pasted API key.
 *
 * It extends `OpenAIProvider` so every model capability (chat, streaming,
 * images, audio, embeddings) is inherited unchanged. The only thing it
 * replaces is *where the bearer token comes from*: instead of a static API
 * key, every request is served by a short-lived OAuth access token that is
 * transparently refreshed when it expires.
 *
 * All collaborators are injected (OAuth client, token store, callback server,
 * PKCE helper, browser launcher), so there is no module-level state and the
 * whole thing is unit-testable without a network or a browser.
 */

import OpenAI from "openai";
import { createLogger, type Logger } from "@nodetool-ai/config";
import { OpenAIProvider } from "../openai-provider.js";
import type { LanguageModel, Message, ProviderId, ProviderStreamItem } from "../types.js";
import { OAuthClient } from "./oauth-client.js";
import { LocalCallbackServer } from "./local-callback-server.js";
import { PKCEHelper } from "./pkce-helper.js";
import type { TokenStore } from "./token-store.js";
import type { BrowserLauncher } from "./browser-launcher.js";
import {
  CredentialsRevokedError,
  InvalidRefreshTokenError,
  NotAuthenticatedError,
  SessionExpiredError
} from "./errors.js";
import { type Clock, type OAuthTokens, systemClock } from "./types.js";

/** Sentinel passed to the parent constructor; the real bearer is OAuth-sourced. */
const OAUTH_API_KEY_SENTINEL = "__nodetool_oauth__";

export interface OpenAIOAuthProviderOptions {
  /** Performs the OAuth protocol round-trips. */
  readonly oauthClient: OAuthClient;
  /** Persists / loads the token set (e.g. OS keychain-backed). */
  readonly tokenStore: TokenStore;
  /** Opens the authorization URL in the user's browser. */
  readonly browserLauncher: BrowserLauncher;
  /** Factory for a fresh single-shot callback server per login attempt. */
  readonly callbackServerFactory: () => LocalCallbackServer;
  /** PKCE + CSRF-state generator. */
  readonly pkce?: PKCEHelper;
  /** Builds an OpenAI SDK client from a bearer token. Injectable for tests. */
  readonly openAIClientFactory?: (accessToken: string) => OpenAI;
  /**
   * Override the OpenAI SDK `baseURL`. Used to point the inherited OpenAI
   * capabilities at an alternate backend (e.g. the ChatGPT Codex routes).
   * Ignored when a custom `openAIClientFactory` is supplied.
   */
  readonly apiBaseUrl?: string;
  /**
   * Static headers sent on every request (e.g. a Codex `originator`). Ignored
   * when a custom `openAIClientFactory` is supplied.
   */
  readonly apiHeaders?: Readonly<Record<string, string>>;
  /**
   * Per-token headers derived from the current access token (e.g. the ChatGPT
   * `chatgpt-account-id` decoded from the JWT). Recomputed whenever the bearer
   * changes. Ignored when a custom `openAIClientFactory` is supplied.
   */
  readonly dynamicApiHeaders?: (accessToken: string) => Record<string, string>;
  readonly clock?: Clock;
  readonly logger?: Logger;
  /** Provider id reported to the rest of the system. Defaults to "openai". */
  readonly providerId?: ProviderId;
  /** Seconds of clock skew treated as "already expired". Defaults to 60. */
  readonly expirySkewSeconds?: number;
  /** Default browser timeout for `login()` in ms. Defaults to 300_000. */
  readonly loginTimeoutMs?: number;
}

export interface LoginOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export class OpenAIOAuthProvider extends OpenAIProvider {
  private readonly oauthClient: OAuthClient;
  private readonly tokenStore: TokenStore;
  private readonly browserLauncher: BrowserLauncher;
  private readonly callbackServerFactory: () => LocalCallbackServer;
  private readonly pkce: PKCEHelper;
  private readonly openAIClientFactory: (accessToken: string) => OpenAI;
  private readonly clock: Clock;
  private readonly oauthLogger: Logger;
  private readonly expirySkewMs: number;
  private readonly loginTimeoutMs: number;

  /** In-memory session mirror of the persisted token set. */
  private session: OAuthTokens | null = null;
  /** Cached OpenAI client, keyed by the token it was built for. */
  private oauthOpenAIClient: OpenAI | null = null;
  private cachedForToken: string | null = null;
  /** Single-flight guard so concurrent calls share one refresh round-trip. */
  private refreshInFlight: Promise<OAuthTokens> | null = null;

  constructor(options: OpenAIOAuthProviderOptions) {
    super(
      { OPENAI_API_KEY: OAUTH_API_KEY_SENTINEL },
      { providerId: options.providerId ?? "openai" }
    );
    this.oauthClient = options.oauthClient;
    this.tokenStore = options.tokenStore;
    this.browserLauncher = options.browserLauncher;
    this.callbackServerFactory = options.callbackServerFactory;
    this.pkce = options.pkce ?? new PKCEHelper();
    const apiBaseUrl = options.apiBaseUrl;
    const apiHeaders = options.apiHeaders;
    const dynamicApiHeaders = options.dynamicApiHeaders;
    this.openAIClientFactory =
      options.openAIClientFactory ??
      ((accessToken) => {
        const headers = { ...(apiHeaders ?? {}), ...(dynamicApiHeaders?.(accessToken) ?? {}) };
        return new OpenAI({
          apiKey: accessToken,
          ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
          ...(Object.keys(headers).length > 0 ? { defaultHeaders: headers } : {})
        });
      });
    this.clock = options.clock ?? systemClock;
    this.oauthLogger = options.logger ?? createLogger("nodetool.runtime.oauth.provider");
    this.expirySkewMs = (options.expirySkewSeconds ?? 60) * 1000;
    this.loginTimeoutMs = options.loginTimeoutMs ?? 300_000;
  }

  // --- Authentication lifecycle ------------------------------------------

  /**
   * Run the full browser OAuth flow: spin up a localhost callback server, open
   * the browser, wait for the redirect, exchange the code, and persist tokens.
   * Resolves with the (non-secret) token metadata on success.
   */
  async login(options: LoginOptions = {}): Promise<{ scope: string | null; expiresAt: number | null }> {
    const server = this.callbackServerFactory();
    try {
      const { redirectUri } = await server.listen();
      const pkcePair = await this.pkce.createPkcePair();
      const state = await this.pkce.createState();

      const authUrl = this.oauthClient.buildAuthorizationUrl({
        redirectUri,
        state,
        codeChallenge: pkcePair.challenge,
        codeChallengeMethod: pkcePair.method
      });

      // BrowserLaunchError propagates as a distinct failure mode.
      await this.browserLauncher.open(authUrl);
      this.oauthLogger.info("Waiting for OAuth callback");

      const { code } = await server.waitForCode({
        expectedState: state,
        timeoutMs: options.timeoutMs ?? this.loginTimeoutMs,
        signal: options.signal
      });

      const tokens = await this.oauthClient.exchangeAuthorizationCode({
        code,
        codeVerifier: pkcePair.verifier,
        redirectUri,
        signal: options.signal
      });

      await this.applyTokens(tokens);
      this.oauthLogger.info("OAuth login succeeded", {
        scope: tokens.scope,
        expiresAt: tokens.expiresAt
      });
      return { scope: tokens.scope, expiresAt: tokens.expiresAt };
    } finally {
      await server.close();
    }
  }

  /** Whether a non-expired session is available without hitting the network. */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.currentTokens();
    return tokens != null && !this.isExpired(tokens);
  }

  /**
   * Forget the session locally and, if the server exposes a revocation
   * endpoint, revoke the refresh token. Always clears local storage even if
   * remote revocation fails.
   */
  async logout(): Promise<void> {
    const tokens = await this.currentTokens();
    try {
      if (tokens?.refreshToken) {
        await this.oauthClient.revokeToken(tokens.refreshToken, "refresh_token");
      }
    } finally {
      await this.tokenStore.clear();
      this.session = null;
      this.oauthOpenAIClient = null;
      this.cachedForToken = null;
    }
  }

  /**
   * Return a valid access token, refreshing if expired. Throws
   * `SessionExpiredError`/`NotAuthenticatedError` when re-login is required.
   */
  async getAccessToken(): Promise<string> {
    const tokens = await this.ensureValidSession();
    return tokens.accessToken;
  }

  // --- Token plumbing -----------------------------------------------------

  private async currentTokens(): Promise<OAuthTokens | null> {
    if (!this.session) {
      this.session = await this.tokenStore.load();
    }
    return this.session;
  }

  private isExpired(tokens: OAuthTokens): boolean {
    if (tokens.expiresAt == null) return false;
    return this.clock.now() >= tokens.expiresAt - this.expirySkewMs;
  }

  private async ensureValidSession(): Promise<OAuthTokens> {
    const tokens = await this.currentTokens();
    if (!tokens) {
      throw new NotAuthenticatedError();
    }
    if (!this.isExpired(tokens)) {
      return tokens;
    }
    return this.refresh();
  }

  /** Refresh the access token (single-flight). */
  async refresh(): Promise<OAuthTokens> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<OAuthTokens> {
    const current = await this.currentTokens();
    const refreshToken = current?.refreshToken;
    if (!refreshToken) {
      // Nothing to refresh with — the session is effectively over.
      await this.invalidate();
      throw new SessionExpiredError("No refresh token available; re-authentication required");
    }

    let next: OAuthTokens;
    try {
      next = await this.oauthClient.refreshAccessToken(refreshToken);
    } catch (err) {
      // A rejected or revoked refresh token means the local session is dead.
      if (err instanceof InvalidRefreshTokenError || err instanceof CredentialsRevokedError) {
        await this.invalidate();
      }
      throw err;
    }

    // Providers may omit a rotated refresh token; keep the previous one.
    const merged: OAuthTokens = next.refreshToken ? next : { ...next, refreshToken };
    await this.applyTokens(merged);
    return merged;
  }

  private async applyTokens(tokens: OAuthTokens): Promise<void> {
    await this.tokenStore.save(tokens);
    this.session = tokens;
    // Invalidate the cached SDK client so the next call rebinds the new bearer.
    if (this.cachedForToken !== tokens.accessToken) {
      this.oauthOpenAIClient = null;
      this.cachedForToken = null;
    }
  }

  private async invalidate(): Promise<void> {
    await this.tokenStore.clear();
    this.session = null;
    this.oauthOpenAIClient = null;
    this.cachedForToken = null;
  }

  // --- OpenAIProvider overrides ------------------------------------------

  /** Build (and cache) an OpenAI SDK client bound to the current access token. */
  override getClient(): OpenAI {
    const token = this.session?.accessToken;
    if (!token) {
      throw new NotAuthenticatedError("No active OAuth session; call login() first");
    }
    if (!this.oauthOpenAIClient || this.cachedForToken !== token) {
      this.oauthOpenAIClient = this.openAIClientFactory(token);
      this.cachedForToken = token;
    }
    return this.oauthOpenAIClient;
  }

  /**
   * The OAuth bearer is short-lived and must never be baked into a container's
   * environment as if it were a durable API key. Code runners that need OpenAI
   * access should refresh through the provider instead.
   */
  override getContainerEnv(): Record<string, string> {
    return {};
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const token = await this.getAccessToken();
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    return (payload.data ?? [])
      .filter((row): row is { id: string } => typeof row.id === "string" && row.id.length > 0)
      .map((row) => ({ id: row.id, name: row.id, provider: "openai" }));
  }

  override async generateMessage(
    args: Parameters<OpenAIProvider["generateMessage"]>[0]
  ): Promise<Message> {
    await this.ensureValidSession();
    return super.generateMessage(args);
  }

  override async *generateMessages(
    args: Parameters<OpenAIProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    await this.ensureValidSession();
    yield* super.generateMessages(args);
  }
}
