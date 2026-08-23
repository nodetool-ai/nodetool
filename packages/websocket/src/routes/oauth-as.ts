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
  MCP_OAUTH_ACCESS_TTL_MS
} from "@nodetool-ai/models";
import { configuredMcpUrl } from "../lib/mcp-mount.js";
import {
  buildProtectedResourceMetadata,
  buildAuthServerMetadata
} from "../oauth/metadata.js";
import {
  isAllowedRedirectUri,
  canonicalResource,
  resourceMatches,
  validateScope
} from "../oauth/validate.js";
import { verifyS256 } from "../oauth/pkce.js";
import { pendingStore } from "../oauth/pending-store.js";
import { isClientIdUrl, fetchClientMetadata } from "../oauth/cimd.js";

const DISABLE_ENV_VAR = "NODETOOL_DISABLE_MCP_OAUTH";

/**
 * Per-route @fastify/rate-limit config, picked up by the server's globally
 * registered limiter via its onRoute hook. Tighter than the global cap:
 * these endpoints issue and redeem credentials, so a flood is a guessing
 * attack, not load. Register is tightest — anonymous writes a DB row.
 * Inert when no limiter is registered (standalone plugin tests).
 */
const OAUTH_ROUTE_RATE_LIMIT = { max: 30, timeWindow: "1 minute" };
const OAUTH_REGISTER_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

/** `<PUBLIC_URL>` with no trailing `/mcp` — the base every T2 builder takes.
 * Derived from `configuredMcpUrl()` only, per the pinned contract ("never
 * re-derive from env directly"): that function already appends `/mcp`
 * exactly once, so stripping it back off recovers the base. */
function resolvePublicUrl(): string | null {
  const mcpUrl = configuredMcpUrl();
  if (!mcpUrl) return null;
  return mcpUrl.slice(0, -"/mcp".length);
}

/** The base URL, or null when the flow is disabled or unconfigured — every
 * handler's single gate. */
function resolveEnabledPublicUrl(): string | null {
  if (process.env[DISABLE_ENV_VAR] === "1") return null;
  return resolvePublicUrl();
}

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

async function resolveClient(clientId: string): Promise<ResolvedClient | null> {
  if (isClientIdUrl(clientId)) {
    const result = await fetchClientMetadata(clientId);
    if (!result.ok) return null;
    return { clientName: result.clientName, redirectUris: result.redirectUris };
  }
  const client = await McpOauthClient.get(clientId);
  if (!client) return null;
  return { clientName: client.client_name, redirectUris: client.redirect_uris };
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

  app.get("/.well-known/oauth-protected-resource/mcp", async (_req, reply) =>
    serveWellKnown(reply, buildProtectedResourceMetadata)
  );
  app.get("/.well-known/oauth-protected-resource", async (_req, reply) =>
    serveWellKnown(reply, buildProtectedResourceMetadata)
  );
  app.get("/.well-known/oauth-authorization-server", async (_req, reply) =>
    serveWellKnown(reply, buildAuthServerMetadata)
  );

  // ── GET /oauth/authorize ─────────────────────────────────────────────

  app.get("/oauth/authorize", { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } }, async (req, reply) => {
    const publicUrl = resolveEnabledPublicUrl();
    if (!publicUrl) return notFound(reply);

    const query = req.query as Record<string, unknown>;
    const clientId = firstValue(query["client_id"]);
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
      !resolved.redirectUris.includes(redirectUri)
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
      return redirectWithError("invalid_scope", "the only supported scope is mcp");
    }

    const requestedResource = firstValue(query["resource"]);
    if (!resourceMatches(requestedResource, publicUrl)) {
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

    const requestId = pendingStore.putRequest({
      clientId,
      clientName: resolved.clientName,
      redirectUri,
      codeChallenge,
      scope: scopeResult.scope,
      resource: canonicalResource(publicUrl),
      state,
      redirectHostIsLoopbackOnly
    });

    return reply.redirect(`/oauth/consent?request_id=${encodeURIComponent(requestId)}`);
  });

  // ── POST /oauth/token ────────────────────────────────────────────────

  app.post("/oauth/token", { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } }, async (req, reply) => {
    const publicUrl = resolveEnabledPublicUrl();
    if (!publicUrl) return notFound(reply);

    const params = parseFormBody(req.body);
    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
      return handleAuthorizationCodeGrant(params, publicUrl, reply);
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
    publicUrl: string,
    reply: FastifyReply
  ): Promise<FastifyReply> {
    const code = params.get("code");
    if (!code) {
      return oauthError(reply, 400, "invalid_request", "missing code");
    }

    const entry = pendingStore.consumeCode(code);
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
      return oauthError(
        reply,
        400,
        "invalid_grant",
        "authorization code has already been used"
      );
    }

    const { request } = entry;

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
    if (requestedResource !== null && !resourceMatches(requestedResource, publicUrl)) {
      return oauthError(
        reply,
        400,
        "invalid_target",
        "resource does not match this server's MCP endpoint"
      );
    }

    const pair = await McpOauthToken.mintPair(entry.grantId);
    return reply.status(200).send({
      access_token: pair.accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(MCP_OAUTH_ACCESS_TTL_MS / 1000),
      refresh_token: pair.refreshToken,
      scope: request.scope
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

    const requestedResource = params.get("resource");
    if (requestedResource !== null && !resourceMatches(requestedResource, publicUrl)) {
      return oauthError(
        reply,
        400,
        "invalid_target",
        "resource does not match this server's MCP endpoint"
      );
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

    return reply.status(200).send({
      access_token: result.accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(MCP_OAUTH_ACCESS_TTL_MS / 1000),
      refresh_token: result.refreshToken,
      scope: "mcp"
    });
  }

  // ── POST /oauth/register (RFC 7591) ─────────────────────────────────

  app.post("/oauth/register", { config: { rateLimit: OAUTH_REGISTER_RATE_LIMIT } }, async (req, reply) => {
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
  });

  // ── POST /oauth/revoke (RFC 7009) ───────────────────────────────────

  app.post("/oauth/revoke", { config: { rateLimit: OAUTH_ROUTE_RATE_LIMIT } }, async (req, reply) => {
    const publicUrl = resolveEnabledPublicUrl();
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
};

export default oauthAsRoutes;
