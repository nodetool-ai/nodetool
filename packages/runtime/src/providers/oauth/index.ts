/**
 * OpenAI OAuth subsystem — public surface.
 *
 * Layers (each depends only on the one below, via interfaces):
 *
 *   OpenAIOAuthProvider          orchestration + OpenAI capability inheritance
 *     ├─ OAuthClient             OAuth 2.0 protocol (PKCE code exchange/refresh)
 *     ├─ PKCEHelper              PKCE + CSRF-state generation
 *     ├─ LocalCallbackServer     localhost redirect receiver
 *     ├─ BrowserLauncher         opens the system browser
 *     └─ TokenStore              token persistence
 *          └─ SecureCredentialStore   opaque secret persistence (OS keychain)
 *
 * `createOpenAIOAuthProvider` wires production defaults; every collaborator can
 * be overridden for testing or alternate hosts.
 */

import { createLogger, type Logger } from "@nodetool-ai/config";
import { OAuthClient } from "./oauth-client.js";
import { PKCEHelper } from "./pkce-helper.js";
import { LocalCallbackServer } from "./local-callback-server.js";
import { DefaultBrowserLauncher, type BrowserLauncher } from "./browser-launcher.js";
import {
  KeychainSecureCredentialStore,
  type SecureCredentialStore
} from "./secure-credential-store.js";
import { SecureTokenStore, type TokenStore } from "./token-store.js";
import { OpenAIOAuthProvider } from "./openai-oauth-provider.js";
import { extractChatGptAccountId } from "./jwt-claims.js";
import type { OAuthClientConfig } from "./types.js";

export * from "./types.js";
export * from "./errors.js";
export { decodeJwtPayload, extractChatGptAccountId } from "./jwt-claims.js";
export { redactToken, redactObject } from "./redaction.js";
export { PKCEHelper, nodeRandomSource, type RandomSource } from "./pkce-helper.js";
export { OAuthClient, type OAuthClientOptions, type FetchLike } from "./oauth-client.js";
export {
  LocalCallbackServer,
  type LocalCallbackServerOptions,
  type WaitForCodeOptions
} from "./local-callback-server.js";
export {
  DefaultBrowserLauncher,
  type BrowserLauncher
} from "./browser-launcher.js";
export {
  KeychainSecureCredentialStore,
  InMemorySecureCredentialStore,
  type SecureCredentialStore,
  type KeyringBackend
} from "./secure-credential-store.js";
export { SecureTokenStore, InMemoryTokenStore, type TokenStore } from "./token-store.js";
export {
  OpenAIOAuthProvider,
  type OpenAIOAuthProviderOptions,
  type LoginOptions
} from "./openai-oauth-provider.js";

/**
 * Default OAuth endpoints for OpenAI. These are configuration, not contracts —
 * override them via `createOpenAIOAuthProvider({ oauthConfig })` if OpenAI's
 * published endpoints differ for your tenant.
 */
export const DEFAULT_OPENAI_OAUTH_CONFIG: Omit<OAuthClientConfig, "clientId"> = {
  authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
  tokenEndpoint: "https://auth.openai.com/oauth/token",
  revocationEndpoint: "https://auth.openai.com/oauth/revoke",
  scopes: ["openid", "profile", "email", "offline_access", "api.read", "api.write"]
};

export interface CreateOpenAIOAuthProviderOptions {
  /** OAuth client id registered with OpenAI. */
  readonly clientId: string;
  /** Account identifier used to namespace stored tokens (e.g. user id). */
  readonly accountId?: string;
  /** Override any part of the OAuth endpoint config. */
  readonly oauthConfig?: Partial<OAuthClientConfig>;
  /** Override token persistence (defaults to OS keychain). */
  readonly tokenStore?: TokenStore;
  /** Override the secret backend used by the default token store. */
  readonly credentialStore?: SecureCredentialStore;
  /** Override the browser launcher. */
  readonly browserLauncher?: BrowserLauncher;
  /** Fixed callback port/path, if OpenAI requires a pre-registered redirect. */
  readonly callbackPort?: number;
  readonly callbackPath?: string;
  readonly logger?: Logger;
}

/** Wire an {@link OpenAIOAuthProvider} with production defaults. */
export function createOpenAIOAuthProvider(
  options: CreateOpenAIOAuthProviderOptions
): OpenAIOAuthProvider {
  const logger = options.logger ?? createLogger("nodetool.runtime.oauth");
  const config: OAuthClientConfig = {
    ...DEFAULT_OPENAI_OAUTH_CONFIG,
    clientId: options.clientId,
    ...options.oauthConfig
  };

  const credentialStore =
    options.credentialStore ?? new KeychainSecureCredentialStore({ logger });
  const tokenStore =
    options.tokenStore ??
    new SecureTokenStore({
      credentialStore,
      provider: "openai",
      accountId: options.accountId ?? "default",
      logger
    });

  return new OpenAIOAuthProvider({
    oauthClient: new OAuthClient({ config, logger }),
    tokenStore,
    browserLauncher: options.browserLauncher ?? new DefaultBrowserLauncher({ logger }),
    callbackServerFactory: () =>
      new LocalCallbackServer({
        port: options.callbackPort,
        path: options.callbackPath,
        logger
      }),
    pkce: new PKCEHelper(),
    logger
  });
}

// ── Codex (ChatGPT-backed) OAuth ──────────────────────────────────────────
//
// Rather than a NodeTool-specific OpenAI app, this reuses the public Codex CLI
// OAuth client and talks to the ChatGPT Codex backend the same way the Codex
// CLI does. That means three fixed, non-obvious facts the authorization server
// and backend enforce:
//   1. The client id is the published Codex CLI client. There is no secret.
//   2. The redirect URI is the Codex-registered loopback callback,
//      http://localhost:1455/auth/callback, so the local callback server MUST
//      bind port 1455 with that path — an ephemeral port will be rejected.
//   3. Backend requests must look like Codex: the `originator` header and the
//      `chatgpt-account-id` (decoded from the access-token JWT) are required;
//      a foreign originator is answered with 403.
// These are configuration, not contracts — every value is override-able.

/** Published public OAuth client id of the Codex CLI (no client secret). */
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

/** ChatGPT backend base URL the Codex routes live under. */
export const CODEX_BACKEND_BASE_URL = "https://chatgpt.com/backend-api/codex";

/**
 * `originator` the ChatGPT backend expects from a Codex client. A non-Codex
 * value (e.g. `pi`) is rejected with 403, so we present as the Codex CLI.
 * Override via `CODEX_ORIGINATOR` env for resilience if the backend tightens.
 */
export const CODEX_ORIGINATOR =
  (typeof process !== "undefined" && process.env?.CODEX_ORIGINATOR) || "codex_cli_rs";

/** Loopback port the Codex client's redirect URI is registered against. */
export const CODEX_CALLBACK_PORT = 1455;
/** Path component of the Codex-registered redirect URI. */
export const CODEX_CALLBACK_PATH = "/auth/callback";

/**
 * OAuth endpoint configuration for the Codex CLI client. Scopes and the extra
 * authorization params mirror what the Codex CLI sends; `clientId` is filled in
 * by {@link createCodexOAuthProvider}.
 */
export const DEFAULT_CODEX_OAUTH_CONFIG: Omit<OAuthClientConfig, "clientId"> = {
  authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
  tokenEndpoint: "https://auth.openai.com/oauth/token",
  revocationEndpoint: "https://auth.openai.com/oauth/revoke",
  scopes: ["openid", "profile", "email", "offline_access"],
  extraAuthParams: {
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true"
  }
};

export interface CreateCodexOAuthProviderOptions {
  /** Override the published Codex client id. */
  readonly clientId?: string;
  /** Account identifier used to namespace stored tokens. */
  readonly accountId?: string;
  /** Override any part of the OAuth endpoint config. */
  readonly oauthConfig?: Partial<OAuthClientConfig>;
  /** Override the ChatGPT Codex backend base URL. */
  readonly backendBaseUrl?: string;
  /** Override the `originator` header value. */
  readonly originator?: string;
  /** Override token persistence (defaults to OS keychain). */
  readonly tokenStore?: TokenStore;
  /** Override the secret backend used by the default token store. */
  readonly credentialStore?: SecureCredentialStore;
  /** Override the browser launcher. */
  readonly browserLauncher?: BrowserLauncher;
  readonly logger?: Logger;
}

/**
 * Wire an {@link OpenAIOAuthProvider} that authenticates with the public Codex
 * CLI client and routes requests to the ChatGPT Codex backend.
 *
 * The callback server is pinned to the Codex-registered loopback redirect
 * (port 1455, `/auth/callback`); every request carries the Codex `originator`
 * and the `chatgpt-account-id` decoded from the access-token JWT.
 */
export function createCodexOAuthProvider(
  options: CreateCodexOAuthProviderOptions = {}
): OpenAIOAuthProvider {
  const logger = options.logger ?? createLogger("nodetool.runtime.oauth.codex");
  const config: OAuthClientConfig = {
    ...DEFAULT_CODEX_OAUTH_CONFIG,
    clientId: options.clientId ?? CODEX_OAUTH_CLIENT_ID,
    ...options.oauthConfig
  };

  const credentialStore =
    options.credentialStore ?? new KeychainSecureCredentialStore({ logger });
  const tokenStore =
    options.tokenStore ??
    new SecureTokenStore({
      credentialStore,
      provider: "openai",
      accountId: options.accountId ?? "codex",
      logger
    });

  return new OpenAIOAuthProvider({
    oauthClient: new OAuthClient({ config, logger }),
    tokenStore,
    browserLauncher: options.browserLauncher ?? new DefaultBrowserLauncher({ logger }),
    callbackServerFactory: () =>
      new LocalCallbackServer({
        port: CODEX_CALLBACK_PORT,
        path: CODEX_CALLBACK_PATH,
        logger
      }),
    pkce: new PKCEHelper(),
    apiBaseUrl: options.backendBaseUrl ?? CODEX_BACKEND_BASE_URL,
    apiHeaders: { originator: options.originator ?? CODEX_ORIGINATOR },
    dynamicApiHeaders: (accessToken) => {
      const accountId = extractChatGptAccountId(accessToken);
      const headers: Record<string, string> = {};
      if (accountId) headers["chatgpt-account-id"] = accountId;
      return headers;
    },
    logger
  });
}
