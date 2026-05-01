/**
 * OAuth API handler – third-party service authentication via OAuth 2.0 PKCE.
 *
 * Port of Python's `nodetool.api.oauth`.
 *
 * Supports HuggingFace and GitHub OAuth flows with PKCE.
 */

import { createHash, randomBytes } from "node:crypto";
import { OAuthCredential } from "@nodetool-ai/models";

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

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── PKCE Utilities ───────────────────────────────────────────────────

export function generatePkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
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

function toTokenMetadata(cred: OAuthCredential): Record<string, unknown> {
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
    const tokenRes = await fetch(HF_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credential.encrypted_refresh_token,
        client_id: HF_CLIENT_ID
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return errorResponse(400, `Failed to refresh token: ${text}`);
    }

    const tokenData = (await tokenRes.json()) as Record<string, unknown>;
    const accessToken = tokenData.access_token as string | undefined;
    const newRefreshToken =
      (tokenData.refresh_token as string) ?? credential.encrypted_refresh_token;
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

    credential.encrypted_access_token = accessToken;
    credential.encrypted_refresh_token = newRefreshToken;
    credential.token_type = tokenType;
    credential.scope = scope;
    credential.received_at = new Date().toISOString();
    credential.expires_at = expiresAt;
    await credential.save();

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
    const res = await fetch(HF_WHOAMI_URL, {
      headers: {
        Authorization: `${credential.token_type} ${credential.encrypted_access_token}`
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
    const res = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `${credential.token_type} ${credential.encrypted_access_token}`,
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

    default:
      return null;
  }
}
