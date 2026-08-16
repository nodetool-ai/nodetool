/**
 * ClaudeCodeLogin — orchestration for signing in with a Claude subscription,
 * exactly as the `claude` CLI does it, and persisting the result where the
 * Claude Agent SDK will find it.
 *
 * Two completion paths share one authorization request:
 *
 *  - **Loopback** — the browser is redirected to an ephemeral `127.0.0.1`
 *    listener this process binds. Works when the browser runs on the same
 *    machine as the server (desktop, local dev).
 *  - **Manual** — the console shows a `<code>#<state>` string the user pastes
 *    back. The only option on a headless or remote host.
 *
 * The two differ only in `redirect_uri`, which must match between the
 * authorization request and the token exchange — hence the two URLs handed back
 * from {@link ClaudeCodeLogin.begin} and the `manual` flag carried through to
 * completion.
 */

import { createLogger, type Logger } from "@nodetool-ai/config";
import {
  CLAUDE_CODE_CALLBACK_PATH,
  CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL
} from "@nodetool-ai/protocol";
import {
  ClaudeCodeCredentialsStore,
  isExpired,
  type ClaudeAiOAuthCredentials
} from "./claude-code-credentials.js";
import {
  ClaudeCodeOAuthClient,
  type ClaudeCodeLoginMethod,
  type ClaudeCodeTokens
} from "./claude-code-oauth-client.js";
import {
  NotAuthenticatedError,
  OAuthError,
  StateMismatchError
} from "./errors.js";
import { LocalCallbackServer } from "./local-callback-server.js";
import { PKCEHelper } from "./pkce-helper.js";
import { systemClock, type Clock } from "./types.js";

/** How long a started login stays completable before the listener is torn down. */
export const CLAUDE_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export interface ClaudeCodeLoginOptions {
  /** Sign in with a claude.ai subscription (default) or a console account. */
  readonly loginMethod?: ClaudeCodeLoginMethod;
  /**
   * Skip the loopback listener entirely. Set on hosts where the browser can't
   * reach this process — only the manual paste path will be offered.
   */
  readonly manualOnly?: boolean;
  /** Abort waiting for the redirect. */
  readonly timeoutMs?: number;
}

/** Non-secret summary of a stored login. */
export interface ClaudeCodeAuthStatus {
  readonly connected: boolean;
  readonly expiresAt: number | null;
  readonly expired: boolean;
  readonly scopes: readonly string[];
  readonly subscriptionType: string | null;
  readonly rateLimitTier: string | null;
  /** Where the credentials live, so the UI can point at the right file. */
  readonly credentialsPath: string;
}

/** A login in progress: the URLs to open, and the two ways to finish it. */
export interface PendingClaudeCodeLogin {
  /** Authorization URL for the loopback flow. Null when `manualOnly`. */
  readonly authUrl: string | null;
  /** Authorization URL whose redirect shows a paste-able `code#state`. */
  readonly manualAuthUrl: string;
  /** CSRF state; the caller may key the pending login on it. */
  readonly state: string;
  /**
   * Wait for the browser to hit the loopback listener, then exchange and
   * persist. Rejects if the login was started with `manualOnly`.
   */
  waitForRedirect(signal?: AbortSignal): Promise<ClaudeAiOAuthCredentials>;
  /**
   * Finish from a pasted `code#state` (or a bare code plus the state this
   * object carries). Exchanges against the manual redirect URI and persists.
   */
  completeWithPastedCode(input: string): Promise<ClaudeAiOAuthCredentials>;
  /** Tear down the listener. Idempotent; safe to call after completion. */
  cancel(): Promise<void>;
}

export interface ClaudeCodeLoginDeps {
  readonly client?: ClaudeCodeOAuthClient;
  readonly credentials?: ClaudeCodeCredentialsStore;
  readonly pkce?: PKCEHelper;
  /** Factory so tests can supply a fake listener. */
  readonly callbackServerFactory?: () => LocalCallbackServer;
  readonly clock?: Clock;
  readonly logger?: Logger;
}

export class ClaudeCodeLogin {
  private readonly client: ClaudeCodeOAuthClient;
  private readonly credentials: ClaudeCodeCredentialsStore;
  private readonly pkce: PKCEHelper;
  private readonly callbackServerFactory: () => LocalCallbackServer;
  private readonly clock: Clock;
  private readonly logger: Logger;

  constructor(deps: ClaudeCodeLoginDeps = {}) {
    this.logger =
      deps.logger ?? createLogger("nodetool.runtime.oauth.claude-login");
    this.client =
      deps.client ?? new ClaudeCodeOAuthClient({ logger: this.logger });
    this.credentials =
      deps.credentials ??
      new ClaudeCodeCredentialsStore({ logger: this.logger });
    this.pkce = deps.pkce ?? new PKCEHelper();
    this.callbackServerFactory =
      deps.callbackServerFactory ??
      (() =>
        new LocalCallbackServer({
          host: "127.0.0.1",
          path: CLAUDE_CODE_CALLBACK_PATH,
          logger: this.logger
        }));
    this.clock = deps.clock ?? systemClock;
  }

  /** Where the credentials the SDK reads are stored. */
  get credentialsPath(): string {
    return this.credentials.path;
  }

  /**
   * Start an authorization request. Binds the loopback listener (unless
   * `manualOnly`) and returns both authorization URLs plus the handles to
   * finish the flow. The caller owns teardown via `cancel()`.
   */
  async begin(
    options: ClaudeCodeLoginOptions = {}
  ): Promise<PendingClaudeCodeLogin> {
    const { verifier, challenge } = await this.pkce.createPkcePair();
    const state = await this.pkce.createState();
    const timeoutMs = options.timeoutMs ?? CLAUDE_LOGIN_TIMEOUT_MS;

    let server: LocalCallbackServer | null = null;
    let loopbackRedirectUri: string | null = null;
    if (!options.manualOnly) {
      server = this.callbackServerFactory();
      const { port } = await server.listen();
      // The listener binds 127.0.0.1, but the registered redirect uses the
      // `localhost` spelling the authorization server expects from the CLI.
      loopbackRedirectUri = `http://localhost:${port}${CLAUDE_CODE_CALLBACK_PATH}`;
    }

    const manualAuthUrl = this.client.buildAuthorizationUrl({
      codeChallenge: challenge,
      state,
      redirectUri: CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL,
      loginMethod: options.loginMethod
    });
    const authUrl = loopbackRedirectUri
      ? this.client.buildAuthorizationUrl({
          codeChallenge: challenge,
          state,
          redirectUri: loopbackRedirectUri,
          loginMethod: options.loginMethod
        })
      : null;

    const cancel = async (): Promise<void> => {
      const current = server;
      server = null;
      await current?.close().catch(() => {});
    };

    return {
      authUrl,
      manualAuthUrl,
      state,
      waitForRedirect: async (signal?: AbortSignal) => {
        if (!server || !loopbackRedirectUri) {
          throw new OAuthError(
            "callback_timeout",
            "This login was started without a loopback listener; paste the code instead"
          );
        }
        try {
          const result = await server.waitForCode({
            expectedState: state,
            timeoutMs,
            signal
          });
          return await this.exchangeAndStore({
            code: result.code,
            state,
            codeVerifier: verifier,
            redirectUri: loopbackRedirectUri,
            signal
          });
        } finally {
          await cancel();
        }
      },
      completeWithPastedCode: async (input: string) => {
        const parsed = parsePastedCode(input, state);
        try {
          return await this.exchangeAndStore({
            code: parsed.code,
            state: parsed.state,
            codeVerifier: verifier,
            redirectUri: CLAUDE_CODE_OAUTH_MANUAL_REDIRECT_URL
          });
        } finally {
          await cancel();
        }
      },
      cancel
    };
  }

  /** Non-secret summary of the stored login. */
  async status(): Promise<ClaudeCodeAuthStatus> {
    const stored = await this.credentials.read();
    if (!stored) {
      return {
        connected: false,
        expiresAt: null,
        expired: false,
        scopes: [],
        subscriptionType: null,
        rateLimitTier: null,
        credentialsPath: this.credentials.path
      };
    }
    return {
      connected: true,
      expiresAt: stored.expiresAt,
      expired: isExpired(stored, this.clock.now()),
      scopes: stored.scopes ?? [],
      subscriptionType: stored.subscriptionType ?? null,
      rateLimitTier: stored.rateLimitTier ?? null,
      credentialsPath: this.credentials.path
    };
  }

  /**
   * Refresh the stored access token. Returns the credentials unchanged when
   * they are still valid, unless `force` is set.
   *
   * The `claude` CLI refreshes on its own, so this is for callers that need a
   * usable token *outside* the SDK (status display, `CLAUDE_CODE_OAUTH_TOKEN`)
   * rather than a prerequisite for running the provider.
   */
  async refresh(
    options: { force?: boolean; signal?: AbortSignal } = {}
  ): Promise<ClaudeAiOAuthCredentials> {
    const stored = await this.credentials.read();
    if (!stored)
      throw new NotAuthenticatedError("No stored Claude credentials");
    if (!options.force && !isExpired(stored, this.clock.now())) return stored;
    if (!stored.refreshToken) {
      throw new NotAuthenticatedError(
        "Stored Claude credentials have no refresh token; sign in again"
      );
    }
    const tokens = await this.client.refreshAccessToken(
      stored.refreshToken,
      options.signal
    );
    return this.credentials.save({ tokens });
  }

  /** Remove the stored login. Returns false when there was nothing to remove. */
  async logout(): Promise<boolean> {
    return this.credentials.clear();
  }

  private async exchangeAndStore(params: {
    code: string;
    state: string;
    codeVerifier: string;
    redirectUri: string;
    signal?: AbortSignal;
  }): Promise<ClaudeAiOAuthCredentials> {
    const tokens: ClaudeCodeTokens =
      await this.client.exchangeAuthorizationCode(params);
    const profile = await this.client.fetchProfile(
      tokens.accessToken,
      params.signal
    );
    const saved = await this.credentials.save({
      tokens,
      subscriptionType: profile?.subscriptionType ?? null,
      rateLimitTier: profile?.rateLimitTier ?? null
    });
    this.logger.info("Claude Code login completed", {
      subscriptionType: saved.subscriptionType,
      scopes: saved.scopes,
      credentialsPath: this.credentials.path
    });
    return saved;
  }
}

/**
 * Parse what the console shows after a manual authorization: `<code>#<state>`.
 * A bare code is accepted too, falling back to the state of the login it is
 * completing — but a mismatched state is a CSRF signal and always rejected.
 */
export function parsePastedCode(
  input: string,
  expectedState: string
) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new OAuthError(
      "authorization_denied",
      "No authorization code provided"
    );
  }
  const [code, state] = trimmed.split("#", 2);
  if (!code) {
    throw new OAuthError(
      "authorization_denied",
      "No authorization code provided"
    );
  }
  if (state !== undefined && state !== expectedState) {
    throw new StateMismatchError();
  }
  return { code, state: expectedState };
}
