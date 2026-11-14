/**
 * OAuth API handler – third-party service authentication via OAuth 2.0 PKCE.
 *
 * Port of Python's `nodetool.api.oauth`.
 *
 * Supports HuggingFace and GitHub OAuth flows with PKCE.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  createLogger,
  isAuthEnforced,
  isGoogleWorkspaceEnabled
} from "@nodetool-ai/config";
import {
  OAuthCredential,
  storeGoogleCredential,
  deleteGoogleCredentials,
  GOOGLE_CREDENTIAL_PROVIDER,
  chatGptAccountKey,
  discoverChatGptOAuth,
  findChatGptRegistration,
  isUsableChatGptCredential,
  parseChatGptAccountKey,
  type ChatGptOAuthEndpoints
} from "@nodetool-ai/models";
import {
  CHATGPT_CALLBACK_HOST,
  CHATGPT_CALLBACK_PATH,
  CHATGPT_CALLBACK_PORT,
  CHATGPT_CREDENTIAL_PROVIDER
} from "@nodetool-ai/protocol";
import {
  AuthorizationDeniedError,
  LocalCallbackServer,
  ClaudeCodeLogin,
  type PendingClaudeCodeLogin
} from "@nodetool-ai/runtime/oauth";
import {
  ChatGptSignInError,
  buildChatGptAuthorizationUrl,
  exchangeChatGptCode,
  getChatGptHostId,
  grantsChatGptPlanUsage,
  parseChatGptRedirect,
  resolveIssuedClientId,
  revokeChatGptRefreshToken,
  verifyChatGptIdToken
} from "./chatgpt-signin.js";
import { clearProviderCache } from "@nodetool-ai/runtime";
import { isAdmin } from "./lib/admin.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isString
} from "./lib/wire-values.js";

const logger = createLogger("nodetool.websocket.oauth");

// ── Constants ────────────────────────────────────────────────────────

const HF_AUTHORIZATION_URL = "https://huggingface.co/oauth/authorize";
const HF_TOKEN_URL = "https://huggingface.co/oauth/token";
const HF_WHOAMI_URL = "https://huggingface.co/api/whoami-v2";
const HF_CLIENT_ID = "54d170bb-b441-445b-a167-56935d718d4e";
const HF_SCOPES = ["openid", "read-repos", "inference-api"];

const GITHUB_AUTHORIZATION_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_SCOPES = ["user:email", "read:user"];

/**
 * `OAuthCredential.provider` of the earlier Codex CLI login. Those tokens were
 * not issued for the public API; disconnect deletes them.
 */
const LEGACY_CODEX_CREDENTIAL_PROVIDER = "openai";

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── PKCE Utilities ───────────────────────────────────────────────────

export function generatePkcePair() {
  const codeVerifier = randomBytes(96).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

// ── In-memory State Store ────────────────────────────────────────────

interface OAuthStateData {
  userId: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export const oauthStateStore = new Map<string, OAuthStateData>();

/** Remove expired entries from the state store. */
function pruneExpiredStates(): void {
  const now = Date.now();
  for (const [key, data] of oauthStateStore) {
    if (now - data.createdAt > STATE_TTL_MS) {
      oauthStateStore.delete(key);
    }
  }
}

// ── HTML Sanitization ────────────────────────────────────────────────

/** Escape HTML special characters to prevent XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ── Response Helpers ─────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function oauthHtmlResponse(opts: {
  title: string;
  success: boolean;
  username?: string | null;
  error?: string | null;
  errorDescription?: string | null;
  autoClose?: boolean;
}): Response {
  const successColor = "#22C55E";
  const errorColor = "#EF4444";
  const primaryColor = "#FFD21E";

  const icon = opts.success ? "\u2713" : "\u2717";
  const iconColor = opts.success ? successColor : errorColor;

  let heading: string;
  let message: string;
  let details: string;

  if (opts.success) {
    heading = "Authentication Successful";
    message = "Your account has been connected successfully.";
    details = opts.username
      ? `<strong>Username:</strong> ${escapeHtml(opts.username)}`
      : "";
  } else {
    heading = "Authentication Failed";
    message = escapeHtml(
      opts.errorDescription || "An error occurred during authentication."
    );
    details = opts.error
      ? `<strong>Error:</strong> ${escapeHtml(opts.error)}`
      : "";
  }

  const autoCloseScript = opts.autoClose
    ? `<script>setTimeout(function(){ window.close(); }, 5000);</script>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); padding: 48px; max-width: 500px; width: 100%; text-align: center; }
    .icon { font-size: 64px; color: ${iconColor}; margin-bottom: 24px; }
    h1 { font-size: 28px; font-weight: 600; color: #1a1a1a; margin-bottom: 16px; }
    .message { font-size: 16px; color: #4a4a4a; margin-bottom: 24px; line-height: 1.5; }
    .details { background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 24px 0; font-size: 14px; color: #666; }
    .close-hint { margin-top: 24px; font-size: 14px; color: #888; }
    .logo { margin-top: 32px; font-size: 14px; color: #999; }
    .close-button { background: ${primaryColor}; color: #1a1a1a; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${heading}</h1>
    <p class="message">${message}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
    <button class="close-button" onclick="window.close()">Close Window</button>
    <div class="close-hint">You can also close this window manually</div>
    <div class="logo">Powered by NodeTool</div>
  </div>
  ${autoCloseScript}
</body>
</html>`;

  return htmlResponse(html);
}

// ── Token metadata helper ────────────────────────────────────────────

function toTokenMetadata(cred: OAuthCredential) {
  return {
    id: cred.id,
    provider: cred.provider,
    account_id: cred.account_id,
    username: cred.username,
    token_type: cred.token_type,
    scope: cred.scope,
    received_at: cred.received_at,
    expires_at: cred.expires_at,
    created_at: cred.created_at,
    updated_at: cred.updated_at
  };
}

// ── HuggingFace Endpoints ────────────────────────────────────────────

async function handleHfStart(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const userId = getUserId();
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState();

  // Determine redirect URI from request host
  let host = request.headers.get("host") ?? "localhost:7777";
  if (host.includes("://")) {
    host = host.split("://")[1];
  }
  if (host.startsWith("127.0.0.1")) {
    host = host.replace("127.0.0.1", "localhost");
  }
  const scheme = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${scheme}://${host}/api/oauth/hf/callback`;

  // Store state
  pruneExpiredStates();
  oauthStateStore.set(state, {
    userId,
    codeVerifier,
    redirectUri,
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_id: HF_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: HF_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return jsonResponse({ auth_url: `${HF_AUTHORIZATION_URL}?${params}` });
}

async function handleHfCallback(request: Request): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error,
      errorDescription: errorDescription || "No description provided"
    });
  }

  if (!code || !state) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "invalid_request",
      errorDescription: "Missing required parameters (code or state)."
    });
  }

  const stateData = oauthStateStore.get(state);
  if (!stateData) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "invalid_state",
      errorDescription:
        "The authentication request has expired or is invalid. Please try again."
    });
  }

  // Check TTL
  if (Date.now() - stateData.createdAt > STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "invalid_state",
      errorDescription:
        "The authentication request has expired. Please try again."
    });
  }

  const { userId, codeVerifier, redirectUri } = stateData;
  oauthStateStore.delete(state);

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(HF_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: HF_CLIENT_ID,
        code_verifier: codeVerifier
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return oauthHtmlResponse({
        title: "OAuth Error",
        success: false,
        error: "token_exchange_failed",
        errorDescription: `Failed to exchange authorization code for tokens: ${text}`
      });
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokenData.access_token as string | undefined;
    const refreshToken = (tokenData.refresh_token as string) ?? null;
    const tokenType = (tokenData.token_type as string) ?? "Bearer";
    const scope = (tokenData.scope as string) ?? null;
    const expiresIn = tokenData.expires_in as number | undefined;

    if (!accessToken) {
      return oauthHtmlResponse({
        title: "OAuth Error",
        success: false,
        error: "token_exchange_failed",
        errorDescription: "No access token received from Hugging Face."
      });
    }

    // Get user info
    const whoamiRes = await fetch(HF_WHOAMI_URL, {
      headers: { Authorization: `${tokenType} ${accessToken}` }
    });

    let username: string | null = null;
    let accountId: string;

    if (whoamiRes.ok) {
      const userInfo = (await whoamiRes.json()) as Record<string, unknown>;
      username = (userInfo.name as string) ?? (userInfo.id as string) ?? null;
      accountId = (userInfo.id as string) ?? accessToken.slice(0, 16);
    } else {
      accountId = accessToken.slice(0, 16);
    }

    const now = new Date().toISOString();
    let expiresAt: string | null = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }

    await OAuthCredential.upsert({
      user_id: userId,
      provider: "huggingface",
      account_id: accountId,
      access_token: accessToken,
      refresh_token: refreshToken,
      username,
      token_type: tokenType,
      scope,
      received_at: now,
      expires_at: expiresAt
    });

    return oauthHtmlResponse({
      title: "OAuth Success",
      success: true,
      username,
      autoClose: true
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "internal_error",
      errorDescription: `An unexpected error occurred: ${message}`
    });
  }
}

async function handleHfTokens(getUserId: () => string): Promise<Response> {
  const userId = getUserId();
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    "huggingface"
  );
  return jsonResponse({
    tokens: credentials.map(toTokenMetadata)
  });
}

async function handleHfRefresh(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) return errorResponse(400, "Missing account_id parameter");

  const userId = getUserId();
  const credential = await OAuthCredential.findByAccount(
    userId,
    "huggingface",
    accountId
  );

  if (!credential) {
    return errorResponse(
      404,
      `No credential found for account_id: ${accountId}`
    );
  }

  if (!credential.encrypted_refresh_token) {
    return errorResponse(
      400,
      "No refresh token available. Please re-authenticate."
    );
  }

  try {
    // Send the decrypted refresh token, not the at-rest ciphertext.
    const currentRefreshToken = await credential.getDecryptedRefreshToken();
    if (!currentRefreshToken) {
      return errorResponse(
        400,
        "No refresh token available. Please re-authenticate."
      );
    }
    const tokenRes = await fetch(HF_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
        client_id: HF_CLIENT_ID
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return errorResponse(400, `Failed to refresh token: ${text}`);
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokenData.access_token as string | undefined;
    // Reuse the current (plaintext) refresh token if the response omits one.
    const newRefreshToken =
      (tokenData.refresh_token as string) ?? currentRefreshToken;
    const tokenType = (tokenData.token_type as string) ?? credential.token_type;
    const scope = (tokenData.scope as string) ?? credential.scope;
    const expiresIn = tokenData.expires_in as number | undefined;

    if (!accessToken) {
      return errorResponse(400, "No access token in refresh response");
    }

    let expiresAt: string | null = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }

    // updateTokens encrypts before persisting — never assign plaintext to the
    // encrypted_* columns directly.
    await credential.updateTokens({
      accessToken,
      refreshToken: newRefreshToken,
      tokenType,
      scope,
      expiresAt
    });

    return jsonResponse({
      success: true,
      message: "Token refreshed successfully"
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(
      500,
      `Failed to communicate with Hugging Face: ${message}`
    );
  }
}

async function handleHfWhoami(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) return errorResponse(400, "Missing account_id parameter");

  const userId = getUserId();
  const credential = await OAuthCredential.findByAccount(
    userId,
    "huggingface",
    accountId
  );

  if (!credential) {
    return errorResponse(
      404,
      `No credential found for account_id: ${accountId}`
    );
  }

  try {
    // Send the decrypted token, not the at-rest ciphertext, or HF always 401s.
    const accessToken = await credential.getDecryptedAccessToken();
    const res = await fetch(HF_WHOAMI_URL, {
      headers: {
        Authorization: `${credential.token_type} ${accessToken}`
      }
    });

    if (res.status === 401) {
      return errorResponse(
        401,
        "Token expired or invalid. Please refresh or re-authenticate."
      );
    }

    if (!res.ok) {
      const text = await res.text();
      return errorResponse(res.status, `Hugging Face API error: ${text}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    return jsonResponse({
      id: data.id ?? "",
      name: data.name ?? null,
      email: data.email ?? null,
      type: data.type ?? null,
      orgs: data.orgs ?? null
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(
      500,
      `Failed to communicate with Hugging Face: ${message}`
    );
  }
}

// ── GitHub Endpoints ─────────────────────────────────────────────────

async function handleGithubStart(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const githubClientId = process.env.GITHUB_CLIENT_ID;
  if (!githubClientId) {
    return errorResponse(
      500,
      "GitHub OAuth not configured. Please set GITHUB_CLIENT_ID."
    );
  }

  const userId = getUserId();
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState();

  let host = request.headers.get("host") ?? "localhost:7777";
  if (host.includes("://")) {
    host = host.split("://")[1];
  }
  if (host.startsWith("127.0.0.1")) {
    host = host.replace("127.0.0.1", "localhost");
  }
  const scheme = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${scheme}://${host}/api/oauth/github/callback`;

  pruneExpiredStates();
  oauthStateStore.set(state, {
    userId,
    codeVerifier,
    redirectUri,
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GITHUB_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return jsonResponse({
    auth_url: `${GITHUB_AUTHORIZATION_URL}?${params}`
  });
}

async function handleGithubCallback(request: Request): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error,
      errorDescription: errorDescription || "No description provided"
    });
  }

  if (!code || !state) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "invalid_request",
      errorDescription: "Missing required parameters (code or state)."
    });
  }

  const stateData = oauthStateStore.get(state);
  if (!stateData) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "invalid_state",
      errorDescription:
        "The authentication request has expired or is invalid. Please try again."
    });
  }

  if (Date.now() - stateData.createdAt > STATE_TTL_MS) {
    oauthStateStore.delete(state);
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "invalid_state",
      errorDescription:
        "The authentication request has expired. Please try again."
    });
  }

  const { userId, codeVerifier, redirectUri } = stateData;
  oauthStateStore.delete(state);

  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!githubClientId || !githubClientSecret) {
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "configuration_error",
      errorDescription: "GitHub OAuth is not properly configured."
    });
  }

  try {
    const tokenRes = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return oauthHtmlResponse({
        title: "OAuth Error",
        success: false,
        error: "token_exchange_failed",
        errorDescription: `Failed to exchange authorization code for tokens: ${text}`
      });
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokenData.access_token as string | undefined;
    const tokenType = (tokenData.token_type as string) ?? "Bearer";
    const scope = (tokenData.scope as string) ?? null;

    if (!accessToken) {
      return oauthHtmlResponse({
        title: "OAuth Error",
        success: false,
        error: "token_exchange_failed",
        errorDescription: "No access token received from GitHub."
      });
    }

    // Get user info
    const userRes = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `${tokenType} ${accessToken}`,
        Accept: "application/json"
      }
    });

    let username: string | null = null;
    let accountId: string;

    if (userRes.ok) {
      const userInfo = (await userRes.json()) as Record<string, unknown>;
      username = (userInfo.login as string) ?? null;
      accountId = String(userInfo.id);
    } else {
      accountId = String(Math.abs(hashCode(accessToken.slice(0, 16))));
    }

    const now = new Date().toISOString();

    await OAuthCredential.upsert({
      user_id: userId,
      provider: "github",
      account_id: accountId,
      access_token: accessToken,
      refresh_token: null,
      username,
      token_type: tokenType,
      scope,
      received_at: now,
      expires_at: null
    });

    return oauthHtmlResponse({
      title: "OAuth Success",
      success: true,
      username,
      autoClose: true
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return oauthHtmlResponse({
      title: "OAuth Error",
      success: false,
      error: "internal_error",
      errorDescription: `An unexpected error occurred: ${message}`
    });
  }
}

async function handleGithubTokens(getUserId: () => string): Promise<Response> {
  const userId = getUserId();
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    "github"
  );
  return jsonResponse({
    tokens: credentials.map(toTokenMetadata)
  });
}

async function handleGithubUser(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) return errorResponse(400, "Missing account_id parameter");

  const userId = getUserId();
  const credential = await OAuthCredential.findByAccount(
    userId,
    "github",
    accountId
  );

  if (!credential) {
    return errorResponse(
      404,
      `No credential found for account_id: ${accountId}`
    );
  }

  try {
    // Send the decrypted token, not the at-rest ciphertext, or GitHub 401s.
    const accessToken = await credential.getDecryptedAccessToken();
    const res = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `${credential.token_type} ${accessToken}`,
        Accept: "application/json"
      }
    });

    if (res.status === 401) {
      return errorResponse(
        401,
        "Token expired or invalid. Please re-authenticate."
      );
    }

    if (!res.ok) {
      const text = await res.text();
      return errorResponse(res.status, `GitHub API error: ${text}`);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, `Failed to communicate with GitHub: ${message}`);
  }
}

// ── OpenAI (Sign in with ChatGPT) Endpoints ──────────────────────────
//
// Follows OpenAI's Sign in with ChatGPT flow (protocol steps in
// `chatgpt-signin.ts`). The redirect must be an HTTP loopback address on
// 127.0.0.1, so the flow can't bounce back through a server route. Two ways to
// finish, both from the one authorization request `start` creates:
//
//  - **Loopback** — `start` binds a one-shot listener on 127.0.0.1 (port 1455,
//    or any free port when 1455 is taken) and finishes the exchange in the
//    background. Only works when the browser runs on this machine (desktop,
//    local dev).
//  - **Manual** — the browser is redirected to its own 127.0.0.1, where nothing
//    answers, and the user pastes the address back to `/complete`. The only
//    option on a shared server, which is what `start` offers there.
//
// The UI reflects success by polling `/api/oauth/openai/tokens`, and failure
// by polling `/status`.

/** How long a started login stays completable. */
const CHATGPT_LOGIN_TTL_MS = 10 * 60 * 1000;

interface PendingChatGptLogin {
  userId: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  /** The issued client id of the account being signed in again, if any. */
  savedClientId: string | null;
  createdAt: number;
}

/** Logins awaiting their redirect, keyed by their CSRF state. */
export const pendingChatGptLogins = new Map<string, PendingChatGptLogin>();

interface ChatGptLoginResult {
  userId: string;
  status: "completed" | "failed" | "cancelled";
  detail?: string;
  createdAt: number;
}

const chatGptLoginResults = new Map<string, ChatGptLoginResult>();

function pruneExpiredChatGptLogins(): void {
  const now = Date.now();
  for (const [state, result] of chatGptLoginResults) {
    if (now - result.createdAt > CHATGPT_LOGIN_TTL_MS) {
      chatGptLoginResults.delete(state);
    }
  }
  for (const [state, pending] of pendingChatGptLogins) {
    if (now - pending.createdAt > CHATGPT_LOGIN_TTL_MS) {
      pendingChatGptLogins.delete(state);
    }
  }
}

/** The single in-flight login, so a re-click can supersede a stale listener. */
let activeChatGptLogin: {
  server: LocalCallbackServer;
  abort: AbortController;
  state: string;
} | null = null;

/** Abort and tear down any in-flight ChatGPT login listener. Idempotent. */
export async function closeActiveChatGptCallbackServer(): Promise<void> {
  const active = activeChatGptLogin;
  if (!active) return;
  activeChatGptLogin = null;
  active.abort.abort();
  await active.server.close().catch(() => {});
}

/** The fixed redirect a manual login uses; the browser's own 127.0.0.1. */
const CHATGPT_MANUAL_REDIRECT_URI = `http://${CHATGPT_CALLBACK_HOST}:${CHATGPT_CALLBACK_PORT}${CHATGPT_CALLBACK_PATH}`;

/** Bind the loopback listener on 1455, or on any free port when it is taken. */
async function listenForChatGptCallback(): Promise<LocalCallbackServer> {
  for (const port of [CHATGPT_CALLBACK_PORT, 0]) {
    const server = new LocalCallbackServer({
      host: CHATGPT_CALLBACK_HOST,
      port,
      path: CHATGPT_CALLBACK_PATH
    });
    try {
      await server.listen();
      return server;
    } catch (err) {
      if (port === 0) throw err;
      logger.info("ChatGPT callback port is busy, using a free port", {
        port,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  throw new Error("unreachable");
}

async function handleOpenAIStart(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const userId = getUserId();
  const url = new URL(request.url);
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = generateState();
  const nonce = generateState();

  // A shared server's users browse from their own machines, where the loopback
  // redirect lands — so binding it here would receive nothing. The caller can
  // also ask for the paste flow outright.
  const manual = url.searchParams.get("manual") === "true" || isAuthEnforced();

  let endpoints: ChatGptOAuthEndpoints;
  let hostId: string;
  let registration: Awaited<ReturnType<typeof findChatGptRegistration>>;
  try {
    [endpoints, hostId, registration] = await Promise.all([
      discoverChatGptOAuth(),
      getChatGptHostId(),
      findChatGptRegistration(userId)
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, `Could not prepare the ChatGPT sign-in: ${message}`);
  }
  // Ask for consent again when the last sign-in did not grant plan usage, or
  // when the user asks to enable it. Ordinary sign-ins never force consent.
  const reconsent =
    url.searchParams.get("reconsent") === "true" ||
    (registration !== null && !registration.planScopeGranted);

  // A new attempt supersedes any listener left over from an abandoned one.
  await closeActiveChatGptCallbackServer();
  pruneExpiredChatGptLogins();

  let redirectUri = CHATGPT_MANUAL_REDIRECT_URI;
  let server: LocalCallbackServer | null = null;
  if (!manual) {
    try {
      server = await listenForChatGptCallback();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResponse(
        500,
        `Could not start the sign-in callback listener: ${message}`
      );
    }
    redirectUri = server.redirectUri();
  }

  const pending: PendingChatGptLogin = {
    userId,
    codeVerifier,
    nonce,
    redirectUri,
    savedClientId: registration?.clientId ?? null,
    createdAt: Date.now()
  };
  pendingChatGptLogins.set(state, pending);

  if (server) {
    const abort = new AbortController();
    activeChatGptLogin = { server, abort, state };
    // Finish the exchange off the request path; the UI polls /tokens.
    void completeChatGptLoopbackLogin({ server, state, pending, abort });
  }

  const authUrl = buildChatGptAuthorizationUrl({
    authorizationEndpoint: endpoints.authorizationEndpoint,
    clientId: pending.savedClientId,
    redirectUri,
    state,
    nonce,
    codeChallenge,
    hostId,
    loginHint: registration?.email,
    reconsent
  });

  return jsonResponse({
    auth_url: authUrl,
    manual,
    redirect_uri: redirectUri
  });
}

/**
 * Exchange the code, verify the identity, and store the sign-in. Throws a
 * user-facing error; a sign-in that did not grant plan usage is stored (so
 * the next attempt reuses its registration and asks for consent) and then
 * reported as a failure.
 */
async function finishChatGptLogin(args: {
  pending: PendingChatGptLogin;
  code: string;
  returnedClientId: string | null | undefined;
  signal?: AbortSignal;
}): Promise<string> {
  const { pending, code, returnedClientId, signal } = args;
  const clientId = resolveIssuedClientId(pending.savedClientId, returnedClientId);
  const endpoints = await discoverChatGptOAuth();
  const tokens = await exchangeChatGptCode({
    tokenEndpoint: endpoints.tokenEndpoint,
    clientId,
    code,
    codeVerifier: pending.codeVerifier,
    redirectUri: pending.redirectUri,
    signal
  });
  const identity = await verifyChatGptIdToken({
    idToken: tokens.idToken,
    clientId,
    nonce: pending.nonce,
    endpoints
  });

  const accountId = chatGptAccountKey(clientId, identity.subject);
  await OAuthCredential.upsert({
    user_id: pending.userId,
    provider: CHATGPT_CREDENTIAL_PROVIDER,
    account_id: accountId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    username: identity.email ?? identity.name,
    token_type: tokens.tokenType,
    scope: tokens.scope,
    received_at: new Date(tokens.receivedAt).toISOString(),
    expires_at: new Date(tokens.expiresAt).toISOString()
  });
  // The chat agent holds a per-user provider set built from the credentials it
  // could resolve at the time. Without this the sign-in lands in the database
  // and the agent goes on without ChatGPT until the process restarts — which a
  // production server does not do.
  clearProviderCache();

  if (!grantsChatGptPlanUsage(tokens.scope)) {
    throw new ChatGptSignInError(
      "You signed in, but NodeTool was not allowed to use your ChatGPT plan. Sign in again and allow plan usage.",
      "plan_usage_not_granted"
    );
  }
  return accountId;
}

/** Await the loopback redirect, then finish the login. */
async function completeChatGptLoopbackLogin(args: {
  server: LocalCallbackServer;
  state: string;
  pending: PendingChatGptLogin;
  abort: AbortController;
}): Promise<void> {
  const { server, state, pending, abort } = args;
  try {
    const callback = await server.waitForCode({
      expectedState: state,
      timeoutMs: CHATGPT_LOGIN_TTL_MS,
      signal: abort.signal
    });
    pendingChatGptLogins.delete(state);
    const accountId = await finishChatGptLogin({
      pending,
      code: callback.code,
      returnedClientId: callback.clientId,
      signal: abort.signal
    });
    chatGptLoginResults.set(state, {
      userId: pending.userId,
      status: "completed",
      createdAt: Date.now()
    });
    logger.info("ChatGPT sign-in completed", { clientId: accountId.split(":")[0] });
  } catch (err) {
    const detail =
      err instanceof ChatGptSignInError || err instanceof AuthorizationDeniedError
        ? err.message
        : undefined;
    const result: ChatGptLoginResult = {
      userId: pending.userId,
      status: abort.signal.aborted ? "cancelled" : "failed",
      createdAt: Date.now()
    };
    if (detail) result.detail = detail;
    chatGptLoginResults.set(state, result);
    logger.warn("ChatGPT sign-in did not complete", {
      error: err instanceof Error ? err.message : String(err)
    });
  } finally {
    pendingChatGptLogins.delete(state);
    await server.close().catch(() => {});
    if (activeChatGptLogin?.server === server) activeChatGptLogin = null;
  }
}

/** Complete a started login from the address the browser was redirected to. */
async function handleOpenAIComplete(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }
  const raw = isString(body.code) ? body.code : "";
  if (!raw.trim()) return errorResponse(400, "code is required");

  let redirect: ReturnType<typeof parseChatGptRedirect>;
  try {
    redirect = parseChatGptRedirect(raw);
  } catch (err) {
    return errorResponse(400, err instanceof Error ? err.message : String(err));
  }

  pruneExpiredChatGptLogins();
  const pending = pendingChatGptLogins.get(redirect.state);
  const userId = getUserId();
  // An unknown state and another user's state are the same answer: this login
  // is not one we can finish, and saying which it was leaks the difference.
  if (!pending || pending.userId !== userId) {
    return errorResponse(
      400,
      "That sign-in expired or was never started here. Start it again and paste the new address."
    );
  }
  pendingChatGptLogins.delete(redirect.state);

  // The code is spent; any loopback listener still up is waiting for nothing.
  await closeActiveChatGptCallbackServer();

  try {
    const accountId = await finishChatGptLogin({
      pending,
      code: redirect.code,
      returnedClientId: redirect.clientId
    });
    logger.info("ChatGPT sign-in completed from a pasted address", {
      clientId: accountId.split(":")[0]
    });
    return jsonResponse({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("ChatGPT sign-in failed", { error: message });
    return errorResponse(400, message);
  }
}

async function handleOpenAIStatus(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("state" in body) || !isNonEmptyString(body.state)) {
    return errorResponse(400, "Login state is required");
  }
  pruneExpiredChatGptLogins();
  const userId = getUserId();
  const result = chatGptLoginResults.get(body.state);
  if (result?.userId === userId) {
    return jsonResponse(
      result.detail
        ? { status: result.status, detail: result.detail }
        : { status: result.status }
    );
  }
  const pending = pendingChatGptLogins.get(body.state);
  return jsonResponse({ status: pending?.userId === userId ? "pending" : "expired" });
}

async function handleOpenAICancel(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("state" in body) || !isNonEmptyString(body.state)) {
    return errorResponse(400, "Login state is required");
  }
  const pending = pendingChatGptLogins.get(body.state);
  if (pending?.userId === getUserId()) {
    pendingChatGptLogins.delete(body.state);
    if (activeChatGptLogin?.state === body.state) {
      await closeActiveChatGptCallbackServer();
    }
  }
  return jsonResponse({ success: true });
}

/** Signed-in ChatGPT accounts whose tokens can run requests on the plan. */
async function handleOpenAITokens(getUserId: () => string): Promise<Response> {
  const userId = getUserId();
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    CHATGPT_CREDENTIAL_PROVIDER
  );
  return jsonResponse({
    tokens: credentials.filter(isUsableChatGptCredential).map(toTokenMetadata)
  });
}

/**
 * Revoke and clear the user's ChatGPT tokens. The rows stay, without tokens,
 * so a later sign-in reuses each account's app registration. Rows left by the
 * earlier Codex CLI login are deleted.
 */
async function handleOpenAIDisconnect(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");

  const userId = getUserId();
  const credentials = await OAuthCredential.listForUserAndProvider(
    userId,
    CHATGPT_CREDENTIAL_PROVIDER
  );
  const { revocationEndpoint } = await discoverChatGptOAuth();
  let removed = 0;
  let revocationUnconfirmed = false;
  for (const credential of credentials) {
    const key = parseChatGptAccountKey(credential.account_id);
    const refreshToken = await credential.getDecryptedRefreshToken();
    if (!refreshToken) continue;
    if (key) {
      const revoked = await revokeChatGptRefreshToken({
        revocationEndpoint,
        refreshToken,
        clientId: key.clientId
      });
      if (!revoked) revocationUnconfirmed = true;
    }
    await credential.clearTokens();
    removed += 1;
  }
  const legacy = await OAuthCredential.listForUserAndProvider(
    userId,
    LEGACY_CODEX_CREDENTIAL_PROVIDER
  );
  for (const credential of legacy) {
    await credential.delete();
    removed += 1;
  }
  clearProviderCache();
  const body: { success: true; removed: number; detail?: string } = {
    success: true,
    removed
  };
  if (revocationUnconfirmed) {
    body.detail =
      "NodeTool removed its tokens but could not confirm the disconnect with OpenAI. You can also disconnect NodeTool in ChatGPT's settings.";
  }
  return jsonResponse(body);
}

// ── Claude (subscription) Endpoints ──────────────────────────────────
//
// Signs in with a Claude subscription using the same public OAuth client the
// `claude` CLI uses, and writes the tokens to the Claude Agent SDK's credential
// file (`~/.claude/.credentials.json`). That file — not the database — is the
// store, because the SDK spawns the `claude` binary as this process's user and
// reads it directly; a per-user DB row would be invisible to it.
//
// Two ways to finish, both from the one authorization request `start` creates,
// mirroring the ChatGPT flow above:
//
//  - **Loopback** — `start` binds the `claude` CLI's own callback port (54545)
//    and finishes the exchange in the background. Only works when the browser
//    runs on this machine (desktop, local dev).
//  - **Manual** — the browser is sent to the console, which displays a
//    `code#state` the user pastes back to `/complete`. What `start` offers on a
//    shared server (`isAuthEnforced()`) or when asked with `?manual=true`.
//
// The UI reflects success by polling `/api/oauth/claude/tokens`.

// The login is process-wide: every user's Claude Agent SDK traffic runs on it.
// So only an admin may start, finish or remove it, or read its plan details.
// Other users see only whether the server is connected.

/** Answers 403 unless the caller is an admin. */
async function refuseUnlessAdmin(
  getUserId: () => string
): Promise<Response | null> {
  if (await isAdmin(getUserId())) return null;
  return errorResponse(
    403,
    "Only an admin can change this server's Claude login."
  );
}

/** The single in-flight login, so a re-click supersedes a stale listener. */
let activeClaudeLogin: {
  pending: PendingClaudeCodeLogin;
  abort: AbortController;
} | null = null;

/** Abort and tear down any in-flight Claude login. Idempotent. */
export async function closeActiveClaudeLogin(): Promise<void> {
  const active = activeClaudeLogin;
  if (!active) return;
  activeClaudeLogin = null;
  active.abort.abort();
  await active.pending.cancel().catch(() => {});
}

async function handleClaudeStart(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");
  const refused = await refuseUnlessAdmin(getUserId);
  if (refused) return refused;

  const url = new URL(request.url);
  const loginMethod =
    url.searchParams.get("login_method") === "console" ? "console" : "claude-ai";
  // A shared server's users browse from their own machines, where the loopback
  // redirect lands — so binding it here would receive nothing. The caller can
  // also ask for the paste flow outright.
  const manual = url.searchParams.get("manual") === "true" || isAuthEnforced();

  await closeActiveClaudeLogin();

  const login = new ClaudeCodeLogin();
  let pending: PendingClaudeCodeLogin;
  try {
    pending = await login.begin({ loginMethod, manualOnly: manual });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, `Could not start the Claude login: ${message}`);
  }

  const abort = new AbortController();
  activeClaudeLogin = { pending, abort };

  if (pending.authUrl) {
    // Finish off the request path; the UI polls /tokens for success.
    void pending
      .waitForRedirect(abort.signal)
      .then(() => logger.info("Claude OAuth login completed"))
      .catch((err: unknown) => {
        logger.warn("Claude OAuth login did not complete", {
          error: err instanceof Error ? err.message : String(err)
        });
      })
      .finally(() => {
        if (activeClaudeLogin?.pending === pending) activeClaudeLogin = null;
      });
  }

  return jsonResponse({
    auth_url: pending.authUrl ?? pending.manualAuthUrl,
    manual_auth_url: pending.manualAuthUrl,
    manual,
    redirect_uri: pending.redirectUri,
    state: pending.state
  });
}

/** Complete a started login from the `code#state` the console displayed. */
async function handleClaudeComplete(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");
  const refused = await refuseUnlessAdmin(getUserId);
  if (refused) return refused;

  const active = activeClaudeLogin;
  if (!active) {
    return errorResponse(
      400,
      "No Claude login in progress. Start one and try again."
    );
  }

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }
  const code = isString(body.code) ? body.code : "";
  if (!code) return errorResponse(400, "code is required");

  try {
    await active.pending.completeWithPastedCode(code);
    logger.info("Claude OAuth login completed from a pasted code");
    return jsonResponse({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(400, message);
  } finally {
    if (activeClaudeLogin === active) activeClaudeLogin = null;
  }
}

/**
 * Connection status, shaped like the other providers' `tokens` responses so the
 * shared `useOAuthConnection` hook works unchanged. There is at most one login.
 */
async function handleClaudeTokens(
  getUserId: () => string
): Promise<Response> {
  const status = await new ClaudeCodeLogin().status();
  if (!status.connected) return jsonResponse({ tokens: [] });
  const token = {
    provider: "claude",
    scope: status.scopes.join(" "),
    expires_at:
      status.expiresAt != null ? new Date(status.expiresAt).toISOString() : null,
    expired: status.expired
  };
  if (!(await isAdmin(getUserId()))) return jsonResponse({ tokens: [token] });
  return jsonResponse({
    tokens: [
      {
        ...token,
        subscription_type: status.subscriptionType,
        rate_limit_tier: status.rateLimitTier,
        credentials_path: status.credentialsPath
      }
    ]
  });
}

async function handleClaudeDisconnect(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");
  const refused = await refuseUnlessAdmin(getUserId);
  if (refused) return refused;
  await closeActiveClaudeLogin();
  const removed = await new ClaudeCodeLogin().logout();
  return jsonResponse({ success: true, removed: removed ? 1 : 0 });
}

// ── Google Workspace Endpoints ───────────────────────────────────────
//
// Unlike the flows above, there is no authorization round-trip here. The user
// already signed in with Google through Supabase, which handed the browser a
// Google `provider_token` (and, with `access_type=offline`, a
// `provider_refresh_token`). Supabase does not expose those server-side, so the
// web app posts them once per login and the server keeps them for agent tools
// and workflow nodes.

interface GoogleSessionBody {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  scope?: unknown;
  email?: unknown;
  account_id?: unknown;
}

/** Coerce Supabase's `expires_at` (unix seconds or ISO string) to ISO. */
function toIsoExpiry(value: unknown): string | null {
  if (isFiniteNumber(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (isNonEmptyString(value)) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

async function handleGoogleSession(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");
  if (!isGoogleWorkspaceEnabled()) {
    return errorResponse(404, "Google Workspace integration is not enabled");
  }

  let body: GoogleSessionBody;
  try {
    body = (await request.json()) as GoogleSessionBody;
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const accessToken =
    isString(body.access_token) ? body.access_token : "";
  if (!accessToken) {
    return errorResponse(400, "access_token is required");
  }

  const userId = getUserId();
  const email = isString(body.email) ? body.email : null;
  const credential = await storeGoogleCredential({
    userId,
    // One credential row per Google account. The email is the stable identity
    // the user recognises; fall back to the NodeTool user id.
    accountId:
      (isNonEmptyString(body.account_id) && body.account_id) ||
      email ||
      userId,
    accessToken,
    refreshToken:
      isString(body.refresh_token) ? body.refresh_token : null,
    email,
    scope: isString(body.scope) ? body.scope : null,
    expiresAt: toIsoExpiry(body.expires_at)
  });

  logger.info("Google session token stored", { accountId: credential.account_id });
  return jsonResponse({ success: true, token: toTokenMetadata(credential) });
}

async function handleGoogleTokens(getUserId: () => string): Promise<Response> {
  if (!isGoogleWorkspaceEnabled()) {
    return jsonResponse({ enabled: false, tokens: [] });
  }
  const credentials = await OAuthCredential.listForUserAndProvider(
    getUserId(),
    GOOGLE_CREDENTIAL_PROVIDER
  );
  return jsonResponse({
    enabled: true,
    tokens: credentials.map(toTokenMetadata)
  });
}

async function handleGoogleDisconnect(
  request: Request,
  getUserId: () => string
): Promise<Response> {
  if (request.method !== "POST")
    return errorResponse(405, "Method not allowed");
  const removed = await deleteGoogleCredentials(getUserId());
  return jsonResponse({ success: true, removed });
}

// ── Simple hash helper (replicates Python's hash() for fallback) ─────

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash;
}

// ── Normalise path ───────────────────────────────────────────────────

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

// ── Main Router ──────────────────────────────────────────────────────

/**
 * Handle an OAuth API request.
 *
 * Returns a Response for recognized routes under /api/oauth/,
 * or null if the path is not an OAuth route.
 */
export async function handleOAuthRequest(
  request: Request,
  pathname: string,
  getUserId: () => string
): Promise<Response | null> {
  const normalised = normalizePath(pathname);

  switch (normalised) {
    // HuggingFace
    case "/api/oauth/hf/start":
      return handleHfStart(request, getUserId);
    case "/api/oauth/hf/callback":
      return handleHfCallback(request);
    case "/api/oauth/hf/tokens":
      return handleHfTokens(getUserId);
    case "/api/oauth/hf/refresh":
      return handleHfRefresh(request, getUserId);
    case "/api/oauth/hf/whoami":
      return handleHfWhoami(request, getUserId);

    // GitHub
    case "/api/oauth/github/start":
      return handleGithubStart(request, getUserId);
    case "/api/oauth/github/callback":
      return handleGithubCallback(request);
    case "/api/oauth/github/tokens":
      return handleGithubTokens(getUserId);
    case "/api/oauth/github/user":
      return handleGithubUser(request, getUserId);

    // OpenAI (Sign in with ChatGPT)
    case "/api/oauth/openai/start":
      return handleOpenAIStart(request, getUserId);
    case "/api/oauth/openai/complete":
      return handleOpenAIComplete(request, getUserId);
    case "/api/oauth/openai/status":
      return handleOpenAIStatus(request, getUserId);
    case "/api/oauth/openai/cancel":
      return handleOpenAICancel(request, getUserId);
    case "/api/oauth/openai/tokens":
      return handleOpenAITokens(getUserId);
    case "/api/oauth/openai/disconnect":
      return handleOpenAIDisconnect(request, getUserId);

    // Claude subscription (Claude Agent SDK credentials)
    case "/api/oauth/claude/start":
      return handleClaudeStart(request, getUserId);
    case "/api/oauth/claude/complete":
      return handleClaudeComplete(request, getUserId);
    case "/api/oauth/claude/tokens":
      return handleClaudeTokens(getUserId);
    case "/api/oauth/claude/disconnect":
      return handleClaudeDisconnect(request, getUserId);

    // Google Workspace (token comes from the Supabase Google login)
    case "/api/oauth/google/session":
      return handleGoogleSession(request, getUserId);
    case "/api/oauth/google/tokens":
      return handleGoogleTokens(getUserId);
    case "/api/oauth/google/disconnect":
      return handleGoogleDisconnect(request, getUserId);

    default:
      return null;
  }
}
