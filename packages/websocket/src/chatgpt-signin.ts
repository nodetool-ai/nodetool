/**
 * Sign in with ChatGPT: the OAuth protocol steps of OpenAI's published flow
 * (https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).
 *
 * - First sign-in registers a public client for this install: the request
 *   carries `client_id=dynamic_agent_client`, `agent_name_hint` and the host
 *   id, and the callback returns the issued `client_id`. Later sign-ins, the
 *   code exchange and refreshes use that issued id.
 * - The redirect is an HTTP loopback callback on `127.0.0.1`.
 * - Scopes add `resource.invoke chatgpt.tokens.use.direct` and every request
 *   names the `https://api.openai.com/v1` resource, so the access token runs
 *   the public Responses API on the user's plan.
 * - The ID token is verified against OpenAI's JWKS (issuer, audience = issued
 *   client id, nonce), and its `sub` identifies the account.
 *
 * HTTP routes, pending-login state and persistence live in `oauth-api.ts`.
 */

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import {
  CHATGPT_AGENT_NAME,
  CHATGPT_DIRECT_SCOPE,
  CHATGPT_DYNAMIC_CLIENT_ID,
  CHATGPT_OAUTH_RESOURCE,
  CHATGPT_OAUTH_SCOPES
} from "@nodetool-ai/protocol";
import type { ChatGptOAuthEndpoints } from "@nodetool-ai/models";

/** Shape of an issued client id: never the registration entry point. */
const ISSUED_CLIENT_ID = /^[A-Za-z0-9_-]{1,200}$/;

export function isIssuedChatGptClientId(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    ISSUED_CLIENT_ID.test(value) &&
    value !== CHATGPT_DYNAMIC_CLIENT_ID
  );
}

// ── Host id ──────────────────────────────────────────────────────────

let hostIdPromise: Promise<string> | null = null;

async function loadOrCreateHostId(path: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    const hostId =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>).host_id
        : undefined;
    if (typeof hostId === "string" && hostId.startsWith("urn:uuid:")) {
      return hostId;
    }
  } catch {
    // Missing or unreadable: create a new one below.
  }
  const hostId = `urn:uuid:${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ host_id: hostId })}\n`, {
    mode: 0o600
  });
  await rename(tmp, path);
  await chmod(path, 0o600).catch(() => {
    // Windows has no POSIX modes; the data directory is per user there.
  });
  return hostId;
}

/**
 * The `ext_agent_host_id` for this install: a `urn:uuid:` value created once
 * and kept in `chatgpt-host.json` in the NodeTool data directory, so it stays
 * the same across restarts and account switches.
 */
export function getChatGptHostId(
  path = join(getNodetoolDataDir(), "chatgpt-host.json")
): Promise<string> {
  hostIdPromise ??= loadOrCreateHostId(path).catch((err: unknown) => {
    hostIdPromise = null;
    throw err;
  });
  return hostIdPromise;
}

/** Forget the cached host id. Tests only. */
export function resetChatGptHostIdForTests(): void {
  hostIdPromise = null;
}

// ── Authorization request ────────────────────────────────────────────

export interface ChatGptAuthorizationRequest {
  authorizationEndpoint: string;
  /** The issued client id of a returning account, or null to register. */
  clientId: string | null;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  hostId: string;
  /** Saved email of a returning account, to pre-select it. */
  loginHint?: string | null;
  /** Ask the user to grant the requested scopes again. */
  reconsent?: boolean;
}

export function buildChatGptAuthorizationUrl(req: ChatGptAuthorizationRequest): string {
  const url = new URL(req.authorizationEndpoint);
  const params = new URLSearchParams({
    client_id: req.clientId ?? CHATGPT_DYNAMIC_CLIENT_ID,
    response_type: "code",
    redirect_uri: req.redirectUri,
    scope: CHATGPT_OAUTH_SCOPES.join(" "),
    resource: CHATGPT_OAUTH_RESOURCE,
    state: req.state,
    nonce: req.nonce,
    code_challenge_method: "S256",
    code_challenge: req.codeChallenge,
    ext_agent_host_id: req.hostId
  });
  // Display metadata, sent only when registering.
  if (!req.clientId) params.set("agent_name_hint", CHATGPT_AGENT_NAME);
  if (req.loginHint) params.set("login_hint", req.loginHint);
  if (req.reconsent) params.set("prompt", "consent");
  url.search = params.toString();
  return url.toString();
}

/**
 * Read `code`, `state` and the issued `client_id` from what the user pastes
 * back: the whole address the browser was sent to, or its query string. The
 * state is required because it is the CSRF check that ties the code to the
 * login it belongs to.
 */
export function parseChatGptRedirect(input: string): {
  code: string;
  state: string;
  clientId: string | null;
} {
  let query = input.trim();
  const questionMark = query.indexOf("?");
  if (questionMark >= 0) {
    query = query.slice(questionMark + 1);
    const hash = query.indexOf("#");
    if (hash >= 0) query = query.slice(0, hash);
  }
  const params = new URLSearchParams(query);

  const error = params.get("error");
  if (error) {
    throw new Error(
      error === "access_denied"
        ? "Sign-in was cancelled in ChatGPT."
        : params.get("error_description") || `Sign-in was refused: ${error}`
    );
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    throw new Error(
      "Paste the whole address the browser was sent to. It carries both the code and the state."
    );
  }
  return { code, state, clientId: params.get("client_id") };
}

/**
 * The client id to exchange the code with. A first sign-in must return an
 * issued id; a returning sign-in keeps its saved id and refuses a different
 * one.
 */
export function resolveIssuedClientId(
  savedClientId: string | null,
  returnedClientId: string | null | undefined
): string {
  if (savedClientId) {
    if (returnedClientId && returnedClientId !== savedClientId) {
      throw new Error(
        "ChatGPT returned a different app registration. Start the sign-in again."
      );
    }
    return savedClientId;
  }
  if (!isIssuedChatGptClientId(returnedClientId)) {
    throw new Error(
      "ChatGPT did not complete the app registration. Start the sign-in again."
    );
  }
  return returnedClientId;
}

// ── Token exchange ───────────────────────────────────────────────────

export interface ChatGptTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
  receivedAt: number;
}

/** A token endpoint or callback error, with the OAuth error code when known. */
export class ChatGptSignInError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null
  ) {
    super(message);
    this.name = "ChatGptSignInError";
  }
}

function oauthErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as Record<string, unknown>).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** Validate a token response; throws on anything a later request would trip on. */
export function parseChatGptTokenResponse(
  data: Record<string, unknown>,
  receivedAt = Date.now()
): ChatGptTokens {
  if (typeof data.scope !== "string") {
    throw new ChatGptSignInError(
      "ChatGPT did not confirm the granted permissions. Sign in again."
    );
  }
  if (
    typeof data.access_token !== "string" ||
    !data.access_token ||
    typeof data.token_type !== "string" ||
    data.token_type.toLowerCase() !== "bearer" ||
    typeof data.expires_in !== "number" ||
    !(data.expires_in > 0) ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token
  ) {
    throw new ChatGptSignInError(
      "ChatGPT returned incomplete credentials. Sign in again."
    );
  }
  if (typeof data.id_token !== "string" || !data.id_token) {
    throw new ChatGptSignInError(
      "ChatGPT did not return a verifiable identity. Sign in again."
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    tokenType: data.token_type,
    scope: data.scope,
    expiresAt: receivedAt + data.expires_in * 1000,
    receivedAt
  };
}

export async function exchangeChatGptCode(args: {
  tokenEndpoint: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  signal?: AbortSignal;
}): Promise<ChatGptTokens> {
  const res = await fetch(args.tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    redirect: "error",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: args.clientId,
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
      resource: CHATGPT_OAUTH_RESOURCE
    }).toString(),
    signal: args.signal
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = oauthErrorCode(body);
    throw new ChatGptSignInError(
      code === "invalid_grant"
        ? "The sign-in code expired or was already used. Start the sign-in again."
        : `ChatGPT rejected the sign-in (${code ?? res.status}).`,
      code
    );
  }
  if (!body || typeof body !== "object") {
    throw new ChatGptSignInError("ChatGPT returned an invalid token response.");
  }
  return parseChatGptTokenResponse(body as Record<string, unknown>);
}

export function grantsChatGptPlanUsage(scope: string): boolean {
  return scope.split(/\s+/).includes(CHATGPT_DIRECT_SCOPE);
}

// ── ID token ─────────────────────────────────────────────────────────

const keySets = new Map<string, JWTVerifyGetKey>();

export interface ChatGptIdentity {
  subject: string;
  email: string | null;
  name: string | null;
}

/**
 * Verify the ID token's signature against OpenAI's JWKS and its issuer,
 * audience (the issued client id), expiry and nonce. Returns the verified
 * identity. `keys` overrides the JWKS resolver in tests.
 */
export async function verifyChatGptIdToken(args: {
  idToken: string;
  clientId: string;
  nonce: string;
  endpoints: ChatGptOAuthEndpoints;
  keys?: JWTVerifyGetKey;
}): Promise<ChatGptIdentity> {
  let keys = args.keys;
  if (!keys) {
    const jwksUri = args.endpoints.jwksUri;
    if (!jwksUri) {
      throw new ChatGptSignInError(
        "ChatGPT identity verification is unavailable right now. Try again shortly."
      );
    }
    let set = keySets.get(jwksUri);
    if (!set) {
      set = createRemoteJWKSet(new URL(jwksUri), { timeoutDuration: 15_000 });
      keySets.set(jwksUri, set);
    }
    keys = set;
  }

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(args.idToken, keys, {
      issuer: args.endpoints.issuer,
      audience: args.clientId,
      algorithms: ["RS256"],
      clockTolerance: 5,
      requiredClaims: ["iss", "aud", "exp", "iat", "sub"]
    }));
  } catch {
    throw new ChatGptSignInError(
      "The ChatGPT identity could not be verified. Sign in again.",
      "invalid_id_token"
    );
  }
  const audience = payload.aud;
  if (
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.nonce !== args.nonce ||
    (payload.azp !== undefined && payload.azp !== args.clientId) ||
    (Array.isArray(audience) && audience.length > 1 && payload.azp !== args.clientId)
  ) {
    throw new ChatGptSignInError(
      "The ChatGPT identity could not be verified. Sign in again.",
      "invalid_id_token"
    );
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : null
  };
}

// ── Revocation ───────────────────────────────────────────────────────

/**
 * Revoke a refresh token, which ends the renewable session. Returns false when
 * revocation could not be confirmed; the user can then disconnect NodeTool in
 * ChatGPT's settings.
 */
export async function revokeChatGptRefreshToken(args: {
  revocationEndpoint: string | null;
  refreshToken: string;
  clientId: string;
}): Promise<boolean> {
  if (!args.revocationEndpoint) return false;
  try {
    const res = await fetch(args.revocationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      redirect: "error",
      body: new URLSearchParams({
        token: args.refreshToken,
        token_type_hint: "refresh_token",
        client_id: args.clientId
      }).toString(),
      signal: AbortSignal.timeout(10_000)
    });
    await res.body?.cancel().catch(() => {
      // Nothing to read from a revocation response.
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
