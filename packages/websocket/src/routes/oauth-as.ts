/**
 * MCP OAuth 2.1 authorization server + resource-server discovery routes
 * (`docs/mcp-oauth-design.md`). NodeTool is both the AS and the RS for
 * `/mcp` — this plugin registers the seven endpoints that make that work:
 *
 *   GET  /.well-known/oauth-protected-resource/mcp   (RFC 9728)
 *   GET  /.well-known/oauth-protected-resource        (RFC 9728, root form)
 *   GET  /.well-known/oauth-authorization-server       (RFC 8414)
 *   GET  /oauth/authorize
 *   POST /oauth/token
 *   POST /oauth/register                                (RFC 7591)
 *   POST /oauth/revoke                                   (RFC 7009)
 *   POST /oauth/session/end                              (native sessions)
 *
 * The same endpoints serve two scopes. `mcp` is an MCP client connection,
 * gated on the `/mcp` mount. `native` is a device session of the desktop
 * apps (client `nodetool-native`), gated on `nativeSignInState`; its access
 * tokens are `ntd_`, accepted on the API and refused on `/mcp`, and its code
 * exchange also returns the session id, the user, and the revocation handle
 * that `/oauth/session/end` takes (docs/plans/native-cloud-sync/
 * technical-design.md, "Sign-in protocol").
 *
 * Self-contained: no dependency on `server.ts` wiring, no import of the
 * agent-access tRPC router. The consent page and the `approveOauthRequest`
 * mutation (T4) are reached only through `pendingStore` — `/oauth/authorize`
 * parks a request and 302s to `/oauth/consent?request_id=…` (an SPA route
 * this plugin never renders), and `/oauth/token` reads back whatever
 * `pendingStore.putCode` produced, from either the real consent flow or a
 * test driving the store directly.
 *
 * Grant lifetime: the consent step (`approveOauthRequest`) creates the
 * `McpOauthGrant` and threads its id through `pendingStore.putCode`, so the
 * token endpoint mints tokens for exactly that grant — and revokes it when a
 * code is replayed (OAuth 2.1 code-replay rule). One consent, one grant row.
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  McpOauthClient,
  McpOauthGrant,
  McpOauthToken,
  MCP_OAUTH_ACCESS_TTL_MS,
  NATIVE_ACCESS_TTL_MS,
  NATIVE_CLIENT_ID,
  NATIVE_CLIENT_NAME,
  getUserAccount
} from "@nodetool-ai/models";
import { enabledPublicUrl as resolveEnabledPublicUrl } from "../oauth/gate.js";
import {
  NATIVE_SIGNIN_DISABLED_MESSAGE,
  nativeSignInState
} from "../oauth/native-gate.js";
import { endNativeSessionLocally } from "../oauth/native-session.js";
import {
  buildProtectedResourceMetadata,
  buildAuthServerMetadata
} from "../oauth/metadata.js";
import {
  isAllowedRedirectUri,
  isRegisteredRedirectUri,
  canonicalNativeResource,
  canonicalResource,
  nativeResourceMatches,
  resourceMatches,
  validateScope,
  type IssuedScope
} from "../oauth/validate.js";
import { verifyS256 } from "../oauth/pkce.js";
import { pendingStore } from "../oauth/pending-store.js";
import { isClientIdUrl, fetchClientMetadata } from "../oauth/cimd.js";

/**
 * Per-route @fastify/rate-limit config, picked up by the server's globally
 * registered limiter via its onRoute hook. Tighter than the global cap:
 * these endpoints issue and redeem credentials, so a flood is a guessing
 * attack, not load. Register is tightest — anonymous writes a DB row.
 * Inert when no limiter is registered (standalone plugin tests).
 */
const OAUTH_ROUTE_RATE_LIMIT = { max: 30, timeWindow: "1 minute" };
const OAUTH_REGISTER_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

/**
 * Bounds on what an anonymous `/oauth/register` may write. The route is
 * unauthenticated and its row is durable, so the rate limit alone is not a
 * size limit: ten requests a minute at the server's 100 MB body cap is a
 * gigabyte a minute of client metadata. A registration document is a name and
 * a handful of redirect URIs — 8 KB is generous for that.
 */
const REGISTER_BODY_LIMIT_BYTES = 8 * 1024;
const MAX_CLIENT_NAME_LENGTH = 256;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;

function notFound(reply: FastifyReply): FastifyReply {
  return reply.status(404).send({ error: "not_found" });
}

function oauthError(
  reply: FastifyReply,
  status: number,
  error: string,
  description?: string
): FastifyReply {
  return reply
    .status(status)
    .type("application/json")
    .send(
      description === undefined
        ? { error }
        : { error, error_description: description }
    );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pre-redirect-validation failure: rendered in-page, never redirects
 * (open-redirect rule — the client's own redirect_uri isn't trusted yet). */
function htmlError(
  reply: FastifyReply,
  status: number,
  error: string,
  description: string
): FastifyReply {
  return reply
    .status(status)
    .type("text/html")
    .send(
      `<!doctype html><title>Authorization error</title>` +
        `<p><strong>${escapeHtml(error)}</strong>: ${escapeHtml(description)}</p>`
    );
}

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

interface ResolvedClient {
  clientName: string;
  redirectUris: string[];
}

/**
 * The seeded native client. Its redirect is the loopback listener the app
 * opens on a free port (RFC 8252 §7.3), so the port is not registered.
 */
const NATIVE_CLIENT: ResolvedClient = {
  clientName: NATIVE_CLIENT_NAME,
  redirectUris: ["http://127.0.0.1/callback"]
};

/** The apps that may sign in with the native scope. */
const NATIVE_APPS = new Set(["node-editor", "timeline", "desktop"]);
const MAX_DEVICE_NAME_LENGTH = 100;

/**
 * A device name as the consent page and Settings show it: control
 * characters removed, whitespace collapsed, at most 100 characters. Null
 * when nothing printable is left.
 */
export function cleanDeviceName(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DEVICE_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * The public URL the AS issues for, by scope: the MCP gate for `mcp`, the
 * native gate for `native`. Null when that scope is not served here.
 */
function issuerFor(scope: IssuedScope): string | null {
  if (scope === "mcp") return resolveEnabledPublicUrl();
  const native = nativeSignInState();
  return native.state === "unavailable" ? null : native.publicUrl;
}

/** The issuer when any scope is served here, else null (routes 404). */
function anyIssuer(): string | null {
  return issuerFor("mcp") ?? issuerFor("native");
}

async function resolveClient(clientId: string): Promise<ResolvedClient | null> {
  if (clientId === NATIVE_CLIENT_ID) return NATIVE_CLIENT;
  if (isClientIdUrl(clientId)) {
    const result = await fetchClientMetadata(clientId);
    if (!result.ok) return null;
    return { clientName: result.clientName, redirectUris: result.redirectUris };
  }
  const client = await McpOauthClient.get(clientId);
  if (!client) return null;
  return { clientName: client.client_name, redirectUris: client.redirect_uris };
}

/** The env var naming the web app's address when it is not served by this
 * server, such as a SPA on its own origin in front of an API host. */
export const WEB_URL_ENV_VAR = "NODETOOL_WEB_URL";

/**
 * Where `/oauth/authorize` sends the browser for consent. The consent page
 * must open on the origin where the user is signed in: a session lives in
 * that origin's storage, and the remembered return path in its
 * sessionStorage. With `NODETOOL_WEB_URL` unset the page is this server's
 * own `/oauth/consent`. A value that is not https (or http on loopback) is
 * ignored rather than trusted.
 */
export function consentPageUrl(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const path = `/oauth/consent?request_id=${encodeURIComponent(requestId)}`;
  const raw = env[WEB_URL_ENV_VAR]?.trim();
  if (!raw) return path;
  try {
    const url = new URL(raw);
    const loopback =
      url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
      return path;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${path}`;
  } catch {
    return path;
  }
}

function parseFormBody(body: unknown): URLSearchParams {
  return typeof body === "string" ? new URLSearchParams(body) : new URLSearchParams();
}

export const oauthAsRoutes: FastifyPluginAsync = async (app) => {
  // Body parsing is registered on this plugin's own encapsulation context,
  // so it applies to these routes regardless of what the outer app does
  // with content-type parsers (the real server parses everything as a raw
  // buffer — see `server.ts`'s `addContentTypeParser("*", …)`).
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => done(null, body.toString())
  );
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const text = body.toString();
        done(null, text.length > 0 ? JSON.parse(text) : {});
      } catch (err) {
        done(err instanceof Error ? err : new Error("invalid JSON"), undefined);
      }
    }
  );

  // ── Well-known discovery documents ──────────────────────────────────

  function serveWellKnown(
    reply: FastifyReply,
    build: (publicUrl: string) => unknown
  ): FastifyReply {
    const publicUrl = resolveEnabledPublicUrl();
    if (!publicUrl) return notFound(reply);
    return reply
      .status(200)
      .header("Cache-Control", "public, max-age=3600")
      .type("application/json")
      .send(build(publicUrl));
  }

  /** The issuer's path component with no trailing slash — "" when the
   * public URL is at the origin root. RFC 8414/9728 path-insertion appends
   * this to the well-known prefix, so a sub-path deployment's documents
   * live at `/.well-known/<suffix>/<issuer-path>[...]`. */
  function issuerPath(publicUrl: string): string {
    const path = new URL(publicUrl).pathname;
    return path === "/" ? "" : path.replace(/\/$/, "");
  }

  function serveWellKnownAt(
    req: { params: unknown },
    reply: FastifyReply,
    expectedSuffixPath: (publicUrl: string) => string,
    build: (publicUrl: string) => unknown
  ): FastifyReply {
    const publicUrl = resolveEnabledPublicUrl();
    if (!publicUrl) return notFound(reply);
    const wildcard = (req.params as Record<string, string>)["*"] ?? "";
    if (`/${wildcard}` !== expectedSuffixPath(publicUrl)) {
      return notFound(reply);
    }
    return reply
      .status(200)
      .header("Cache-Control", "public, max-age=3600")
      .type("application/json")
      .send(build(publicUrl));
  }

  // Path-inserted forms (the only valid forms when the issuer carries a
  // sub-path): metadata for issuer https://host/base lives at
  // /.well-known/oauth-authorization-server/base, and the protected-resource
  // document for https://host/base/mcp at
  // /.well-known/oauth-protected-resource/base/mcp. A root deployment's
  // resource form /.well-known/oauth-protected-resource/mcp is the same
  // wildcard with issuerPath = "".
  app.get("/.well-known/oauth-protected-resource/*", async (req, reply) =>
    serveWellKnownAt(
      req,
      reply,
      (publicUrl) => `${issuerPath(publicUrl)}/mcp`,
      buildProtectedResourceMetadata
    )
  );
  app.get("/.well-known/oauth-protected-resource", async (_req, reply) =>
    serveWellKnown(reply, buildProtectedResourceMetadata)
  );
  app.get("/.well-known/oauth-authorization-server/*", async (req, reply) =>
    serveWellKnownAt(
      req,
      reply,
      (publicUrl) => issuerPath(publicUrl) || "/",
      buildAuthServerMetadata
    )
  );
  app.get("/.well-known/oauth-authorization-server", async (_req, reply) =>
    serveWellKnown(reply, buildAuthServerMetadata)
  );

  // ── GET /oauth/authorize ─────────────────────────────────────────────

  app.get("/oauth/authorize", { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } }, async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const clientId = firstValue(query["client_id"]);
    const isNativeClient = clientId === NATIVE_CLIENT_ID;
    const publicUrl = issuerFor(isNativeClient ? "native" : "mcp");
    if (!publicUrl) return notFound(reply);
    if (!clientId) {
      return htmlError(reply, 400, "invalid_request", "missing client_id");
    }

    const resolved = await resolveClient(clientId);
    if (!resolved) {
      return htmlError(reply, 400, "invalid_client", "unknown client_id");
    }
    if (clientId.startsWith("ntc_")) {
      await McpOauthClient.touch(clientId).catch(() => {
        // best-effort — a missed touch never blocks the flow
      });
    }

    const redirectUri = firstValue(query["redirect_uri"]);
    if (!redirectUri) {
      return htmlError(reply, 400, "invalid_request", "missing redirect_uri");
    }
    if (
      !isAllowedRedirectUri(redirectUri) ||
      !isRegisteredRedirectUri(redirectUri, resolved.redirectUris)
    ) {
      return htmlError(
        reply,
        400,
        "invalid_request",
        "redirect_uri is not registered for this client"
      );
    }

    // redirect_uri is trusted from here on — later failures redirect with
    // an error instead of rendering in-page.
    const state = firstValue(query["state"]);
    const iss = buildAuthServerMetadata(publicUrl).issuer;

    function redirectWithError(error: string, description: string): FastifyReply {
      const url = new URL(redirectUri as string);
      url.searchParams.set("error", error);
      url.searchParams.set("error_description", description);
      if (state !== undefined) url.searchParams.set("state", state);
      url.searchParams.set("iss", iss);
      return reply.redirect(url.toString());
    }

    if (firstValue(query["response_type"]) !== "code") {
      return redirectWithError(
        "unsupported_response_type",
        "response_type must be code"
      );
    }

    const codeChallenge = firstValue(query["code_challenge"]);
    if (!codeChallenge) {
      return redirectWithError("invalid_request", "code_challenge is required");
    }
    if (firstValue(query["code_challenge_method"]) !== "S256") {
      return redirectWithError(
        "invalid_request",
        "code_challenge_method must be S256 — plain is not supported"
      );
    }

    const scopeResult = validateScope(firstValue(query["scope"]));
    if (!scopeResult.ok) {
      return redirectWithError("invalid_scope", "supported scopes are mcp and native");
    }
    // The native scope belongs to the seeded native client, and that client
    // signs in with nothing else: a grant holds exactly one scope.
    if ((scopeResult.scope === "native") !== isNativeClient) {
      return redirectWithError(
        "invalid_scope",
        isNativeClient
          ? "the nodetool-native client requests scope native"
          : "scope native is reserved for the NodeTool desktop apps"
      );
    }

    const requestedResource = firstValue(query["resource"]);
    let appName: string | undefined;
    let deviceName: string | undefined;
    if (scopeResult.scope === "native") {
      if (nativeSignInState().state === "disabled") {
        return redirectWithError("access_denied", NATIVE_SIGNIN_DISABLED_MESSAGE);
      }
      if (!nativeResourceMatches(requestedResource, publicUrl)) {
        return redirectWithError(
          "invalid_target",
          "resource does not match this server's origin"
        );
      }
      const app = firstValue(query["app"]);
      if (!app || !NATIVE_APPS.has(app)) {
        return redirectWithError(
          "invalid_request",
          "app must be node-editor, timeline or desktop"
        );
      }
      const device = cleanDeviceName(firstValue(query["device_name"]));
      if (!device) {
        return redirectWithError("invalid_request", "device_name is required");
      }
      appName = app;
      deviceName = device;
    } else if (!resourceMatches(requestedResource, publicUrl)) {
      return redirectWithError(
        "invalid_target",
        "resource does not match this server's MCP endpoint"
      );
    }

    const redirectHostIsLoopbackOnly = resolved.redirectUris.every((uri) => {
      try {
        const parsed = new URL(uri);
        return (
          parsed.protocol === "http:" &&
          (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
        );
      } catch {
        return false;
      }
    });

    const parked: Parameters<typeof pendingStore.putRequest>[0] = {
      clientId,
      clientName: resolved.clientName,
      redirectUri,
      codeChallenge,
      scope: scopeResult.scope,
      resource:
        scopeResult.scope === "native"
          ? canonicalNativeResource(publicUrl)
          : canonicalResource(publicUrl),
      state,
      redirectHostIsLoopbackOnly
    };
    if (appName !== undefined) {
      parked.appName = appName;
      parked.deviceName = deviceName;
    }
    const requestId = await pendingStore.putRequest(parked);

    return reply.redirect(consentPageUrl(requestId));
  });

  // ── POST /oauth/token ────────────────────────────────────────────────

  app.post("/oauth/token", { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } }, async (req, reply) => {
    const publicUrl = anyIssuer();
    if (!publicUrl) return notFound(reply);

    const params = parseFormBody(req.body);
    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
      return handleAuthorizationCodeGrant(params, reply);
    }
    if (grantType === "refresh_token") {
      return handleRefreshTokenGrant(params, publicUrl, reply);
    }
    return oauthError(
      reply,
      400,
      "unsupported_grant_type",
      "grant_type must be authorization_code or refresh_token"
    );
  });

  async function handleAuthorizationCodeGrant(
    params: URLSearchParams,
    reply: FastifyReply
  ): Promise<FastifyReply> {
    const code = params.get("code");
    if (!code) {
      return oauthError(reply, 400, "invalid_request", "missing code");
    }

    // Every binding the code carries is checked before the code is spent.
    // Consuming first meant one bad exchange from anyone holding a leaked
    // code burned it permanently, and the legitimate client's exchange then
    // read as a replay and revoked the grant.
    const peeked = await pendingStore.peekCode(code);
    if (!peeked) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "authorization code is invalid or expired"
      );
    }

    const { request } = peeked;
    const isNative = request.scope === "native";
    // The scope's gate decides, not whichever scope opened the endpoint.
    const scopeIssuer = issuerFor(request.scope);
    if (!scopeIssuer || (isNative && nativeSignInState().state !== "enabled")) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        isNative ? NATIVE_SIGNIN_DISABLED_MESSAGE : "authorization code is invalid or expired"
      );
    }

    if (params.get("client_id") !== request.clientId) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "client_id does not match the authorization request"
      );
    }
    if (params.get("redirect_uri") !== request.redirectUri) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "redirect_uri does not match the authorization request"
      );
    }

    const verifier = params.get("code_verifier");
    if (!verifier || !verifyS256(verifier, request.codeChallenge)) {
      return oauthError(reply, 400, "invalid_grant", "PKCE verification failed");
    }

    const requestedResource = params.get("resource");
    const resourceOk = isNative
      ? nativeResourceMatches(requestedResource, scopeIssuer)
      : requestedResource === null || resourceMatches(requestedResource, scopeIssuer);
    if (!resourceOk) {
      return oauthError(
        reply,
        400,
        "invalid_target",
        isNative
          ? "resource does not match this server's origin"
          : "resource does not match this server's MCP endpoint"
      );
    }

    // Bindings hold: spend the code. A second correctly-bound exchange is the
    // OAuth 2.1 replay case and revokes the grant.
    const entry = await pendingStore.consumeCode(code);
    if (!entry) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "authorization code is invalid or expired"
      );
    }
    if (entry.consumedBefore) {
      await McpOauthGrant.revoke(entry.userId, entry.grantId);
      endNativeSessionLocally(entry.grantId);
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "authorization code has already been used"
      );
    }

    if (!isNative) {
      const pair = await McpOauthToken.mintPair(entry.grantId);
      return reply.status(200).send({
        access_token: pair.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(MCP_OAUTH_ACCESS_TTL_MS / 1000),
        refresh_token: pair.refreshToken,
        scope: request.scope
      });
    }

    // The handle is issued once, here. A refresh never returns it, so a
    // process that only ever refreshed cannot have learned it.
    const handle = await McpOauthGrant.issueRevocationHandle(entry.grantId);
    if (!handle) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "authorization code is invalid or expired"
      );
    }
    const pair = await McpOauthToken.mintPair(entry.grantId, "native");
    const account = await getUserAccount(entry.userId).catch(() => null);
    return reply.status(200).send({
      access_token: pair.accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(NATIVE_ACCESS_TTL_MS / 1000),
      refresh_token: pair.refreshToken,
      scope: "native",
      session_id: entry.grantId,
      user_id: entry.userId,
      display_name: account?.displayName ?? account?.email ?? null,
      revocation_handle: handle
    });
  }

  async function handleRefreshTokenGrant(
    params: URLSearchParams,
    publicUrl: string,
    reply: FastifyReply
  ): Promise<FastifyReply> {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) {
      return oauthError(reply, 400, "invalid_request", "missing refresh_token");
    }

    // The resource names the audience: the server origin for a native
    // session, the `/mcp` URI for an MCP connection. Either is accepted
    // here, and the rotation below decides which one the grant holds.
    const requestedResource = params.get("resource");
    const nativeResource =
      requestedResource !== null && nativeResourceMatches(requestedResource, publicUrl);
    if (
      requestedResource !== null &&
      !nativeResource &&
      !resourceMatches(requestedResource, publicUrl)
    ) {
      return oauthError(
        reply,
        400,
        "invalid_target",
        "resource does not match this server"
      );
    }
    // Each scope's gate decides before anything rotates, so a refresh the
    // server will not answer never spends the client's token.
    const grantKind = await McpOauthToken.grantKindOfRefresh(refreshToken);
    if (grantKind === "native" && nativeSignInState().state !== "enabled") {
      return oauthError(reply, 400, "invalid_grant", NATIVE_SIGNIN_DISABLED_MESSAGE);
    }
    if (grantKind === "mcp" && !resolveEnabledPublicUrl()) {
      return notFound(reply);
    }

    const result = await McpOauthToken.rotateRefresh(refreshToken);
    if (result === null) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "refresh_token is invalid or expired"
      );
    }
    if ("reuseDetected" in result) {
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "refresh token reuse detected — the grant has been revoked"
      );
    }

    // RFC 6749 §3.2.1: when the client identifies itself, the refresh chain
    // must belong to it. Public clients may omit client_id; a mismatched one
    // is a valid token presented under the wrong identity — a compromise
    // signal, handled like refresh reuse: the whole grant is revoked,
    // including the pair the rotation just minted.
    const presentedClientId = params.get("client_id");
    if (presentedClientId !== null) {
      const grant = await McpOauthGrant.get(result.grantId);
      if (!grant || grant.client_id !== presentedClientId) {
        await McpOauthToken.revokeByRawToken(result.refreshToken);
        endNativeSessionLocally(result.grantId);
        return oauthError(
          reply,
          400,
          "invalid_grant",
          "client_id does not match the grant"
        );
      }
    }

    const native = result.grantKind === "native";
    // A token presented for the other audience is the same compromise signal
    // as a wrong client_id: the chain was used where it was never issued.
    if (
      requestedResource !== null &&
      native !== nativeResource
    ) {
      await McpOauthToken.revokeByRawToken(result.refreshToken);
      endNativeSessionLocally(result.grantId);
      return oauthError(
        reply,
        400,
        "invalid_target",
        "resource does not match the grant"
      );
    }
    // An access token minted near the grant's maximum age ends with the
    // grant, so it can live less than the usual lifetime.
    const accessTtlMs = native ? NATIVE_ACCESS_TTL_MS : MCP_OAUTH_ACCESS_TTL_MS;
    const body: Record<string, string | number> = {
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: Math.max(
        0,
        Math.min(
          Math.floor(accessTtlMs / 1000),
          Math.ceil((result.expiresAt.getTime() - Date.now()) / 1000)
        )
      ),
      refresh_token: result.refreshToken,
      scope: native ? "native" : "mcp"
    };
    if (native) body.session_id = result.grantId;
    return reply.status(200).send(body);
  }

  // ── POST /oauth/register (RFC 7591) ─────────────────────────────────

  app.post(
    "/oauth/register",
    {
      bodyLimit: REGISTER_BODY_LIMIT_BYTES,
      config: { rateLimit: OAUTH_REGISTER_RATE_LIMIT }
    },
    async (req, reply) => {
      const publicUrl = resolveEnabledPublicUrl();
      if (!publicUrl) return notFound(reply);

      const body = req.body;
      const doc =
        typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : null;
      if (!doc) {
        return oauthError(
          reply,
          400,
          "invalid_client_metadata",
          "request body must be a JSON object"
        );
      }

      const authMethod = doc["token_endpoint_auth_method"];
      if (authMethod !== undefined && authMethod !== "none") {
        return oauthError(
          reply,
          400,
          "invalid_client_metadata",
          "only public clients (token_endpoint_auth_method=none) are supported"
        );
      }

      const clientName = doc["client_name"];
      if (typeof clientName !== "string" || clientName.length === 0) {
        return oauthError(
          reply,
          400,
          "invalid_client_metadata",
          "client_name is required"
        );
      }
      if (clientName.length > MAX_CLIENT_NAME_LENGTH) {
        return oauthError(
          reply,
          400,
          "invalid_client_metadata",
          `client_name must be at most ${MAX_CLIENT_NAME_LENGTH} characters`
        );
      }

      const redirectUris = doc["redirect_uris"];
      if (
        !Array.isArray(redirectUris) ||
        redirectUris.length === 0 ||
        !redirectUris.every((uri): uri is string => typeof uri === "string")
      ) {
        return oauthError(
          reply,
          400,
          "invalid_client_metadata",
          "redirect_uris must be a non-empty array of strings"
        );
      }
      if (redirectUris.length > MAX_REDIRECT_URIS) {
        return oauthError(
          reply,
          400,
          "invalid_client_metadata",
          `redirect_uris must hold at most ${MAX_REDIRECT_URIS} entries`
        );
      }
      if (redirectUris.some((uri) => uri.length > MAX_REDIRECT_URI_LENGTH)) {
        return oauthError(
          reply,
          400,
          "invalid_redirect_uri",
          `each redirect_uri must be at most ${MAX_REDIRECT_URI_LENGTH} characters`
        );
      }
      if (!redirectUris.every((uri) => isAllowedRedirectUri(uri))) {
        return oauthError(
          reply,
          400,
          "invalid_redirect_uri",
          "redirect_uris must be https, or http on 127.0.0.1/localhost"
        );
      }

      const { id } = await McpOauthClient.create({
        client_name: clientName,
        redirect_uris: redirectUris
      });

      return reply.status(201).send({
        client_id: id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      });
    }
  );

  // ── POST /oauth/revoke (RFC 7009) ───────────────────────────────────

  app.post("/oauth/revoke", { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } }, async (req, reply) => {
    const publicUrl = anyIssuer();
    if (!publicUrl) return notFound(reply);

    const params = parseFormBody(req.body);
    const token = params.get("token");
    if (token) {
      // RFC 7009: the endpoint always answers 200, whether or not a
      // matching token was found — it must not leak which is the case.
      await McpOauthToken.revokeByRawToken(token).catch(() => {
        // best-effort
      });
    }
    return reply.status(200).send({});
  });

  // ── POST /oauth/session/end (native sessions) ───────────────────────
  //
  // Ends one device session with its revocation handle and no other
  // credential: the app may already have dropped its tokens when it signs
  // out offline, and the handle is what it kept to finish the job. 200 for an
  // active or already ended session, 404 for a handle this server never
  // issued. It works while native sign-in is turned off, so an
  // administrator's switch never strands a session that wants to end.

  app.post(
    "/oauth/session/end",
    { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } },
    async (req, reply) => {
      if (nativeSignInState().state === "unavailable") return notFound(reply);
      const handle =
        typeof req.body === "string"
          ? parseFormBody(req.body).get("handle")
          : typeof req.body === "object" && req.body !== null
            ? (req.body as Record<string, unknown>)["handle"]
            : undefined;
      if (typeof handle !== "string" || handle.length === 0) {
        return oauthError(reply, 400, "invalid_request", "missing handle");
      }
      const { outcome, grantId } = await McpOauthGrant.endByRevocationHandle(handle);
      if (outcome === "unknown") return notFound(reply);
      if (grantId) endNativeSessionLocally(grantId);
      return reply.status(200).send({ ended: true, already_ended: outcome === "already_ended" });
    }
  );
};

export default oauthAsRoutes;
