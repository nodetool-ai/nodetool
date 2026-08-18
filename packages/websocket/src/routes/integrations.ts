/**
 * Integration routes — linking an external messaging account to a NodeTool
 * user, and exchanging that mapping for a short-lived delegated token.
 *
 * The caller is a bridge process (the Telegram bot, later Discord), not a
 * browser: every route authenticates with the server's own
 * `NODETOOL_INTEGRATION_TOKEN` rather than a user session, which is why these
 * paths are exempt from the session-auth hook the way the webhook routes are.
 * A server without that env var registers none of this — every path 404s.
 *
 * The bridge never holds a user credential. It proves *which external account*
 * is speaking; the server decides which NodeTool user that is, and mints a
 * token scoped to them. Tenant isolation is then the server's usual rules.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { mintDelegatedToken } from "@nodetool-ai/auth";
import { ExternalIdentity } from "@nodetool-ai/models";

import {
  integrationExternalIdBodySchema,
  integrationLinkCompleteBodySchema
} from "../http-body-schemas.js";

/** Platforms the identity layer accepts. `provider` is data, not a route. */
const ALLOWED_PROVIDERS = ["telegram", "discord"] as const;

/** A service token shorter than this is refused rather than trusted. */
const MIN_SERVICE_TOKEN_LENGTH = 16;

/** How long a link code stays usable. */
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Lifetime of a minted delegated token. */
const DELEGATED_TOKEN_TTL_SECONDS = 60 * 60;

interface PendingLink {
  provider: string;
  externalId: string;
  expiresAtMs: number;
}

export interface IntegrationRoutesOptions {
  /**
   * The HMAC key delegated tokens are signed with, read lazily so a server
   * that never mints one never needs the master key.
   */
  signingKey: () => Buffer | string;
  /**
   * Whether the server enforces authentication. In local single-user trust
   * mode there is no second user to isolate from, so "link any Telegram
   * account to user 1" is not linking — `/token` refuses (design §9).
   */
  enforceAuth: boolean;
  /** Injected clock, so code expiry is testable without waiting. */
  now?: () => number;
}

/** Whether the request carries the configured service token. */
function hasServiceToken(req: FastifyRequest, serviceToken: string): boolean {
  const header = req.headers.authorization;
  if (typeof header !== "string") return false;
  const parts = header.split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return false;
  const presented = Buffer.from(parts[1], "utf-8");
  const expected = Buffer.from(serviceToken, "utf-8");
  return (
    presented.length === expected.length &&
    timingSafeEqual(presented, expected)
  );
}

function readProvider(req: FastifyRequest): string | null {
  const params = req.params as { provider?: unknown };
  const provider = params.provider;
  if (typeof provider !== "string") return null;
  return (ALLOWED_PROVIDERS as readonly string[]).includes(provider)
    ? provider
    : null;
}

/**
 * The base URL a link confirmation page is reachable at, taken from the
 * request the bridge made. `NODETOOL_PUBLIC_URL` wins when set, because a
 * bridge on the same host reaches the server at an address the user's browser
 * may not.
 */
function baseUrl(req: FastifyRequest): string {
  const configured = process.env["NODETOOL_PUBLIC_URL"];
  if (configured) return configured.replace(/\/+$/, "");
  const host = req.headers.host ?? "127.0.0.1:7777";
  return `${req.protocol}://${host}`;
}

export function createIntegrationRoutes(
  options: IntegrationRoutesOptions
): FastifyPluginAsync {
  const now = options.now ?? Date.now;

  return async (app) => {
    const serviceToken = process.env["NODETOOL_INTEGRATION_TOKEN"];
    if (!serviceToken || serviceToken.length < MIN_SERVICE_TOKEN_LENGTH) {
      // No service token, no surface: the routes are never registered, so
      // every path answers 404 rather than 401.
      return;
    }

    /**
     * Codes minted by `/link/start` and not yet consumed. In-memory is
     * deliberate for v1: a code lives ten minutes and losing one on restart
     * costs the user a second `/link`, not data.
     */
    const pendingLinks = new Map<string, PendingLink>();

    const prune = (): void => {
      const cutoff = now();
      for (const [code, pending] of pendingLinks) {
        if (pending.expiresAtMs <= cutoff) pendingLinks.delete(code);
      }
    };

    /** Common preamble: service token, then provider. */
    const authorize = (
      req: FastifyRequest,
      reply: FastifyReply
    ): string | null => {
      if (!hasServiceToken(req, serviceToken)) {
        reply.status(401).send({ error: "Unauthorized" });
        return null;
      }
      const provider = readProvider(req);
      if (!provider) {
        reply.status(400).send({
          error: `Unknown integration provider. Expected one of: ${ALLOWED_PROVIDERS.join(", ")}`
        });
        return null;
      }
      return provider;
    };

    app.post("/api/integrations/:provider/link/start", async (req, reply) => {
      const provider = authorize(req, reply);
      if (!provider) return;

      const body = integrationExternalIdBodySchema.safeParse(req.body);
      if (!body.success) {
        reply.status(400).send({ error: "external_id is required" });
        return;
      }

      prune();
      const code = randomBytes(24).toString("base64url");
      const expiresAtMs = now() + LINK_CODE_TTL_MS;
      pendingLinks.set(code, {
        provider,
        externalId: body.data.external_id,
        expiresAtMs
      });

      reply.send({
        code,
        url: `${baseUrl(req)}/integrations/link?code=${encodeURIComponent(code)}`,
        expires_at: new Date(expiresAtMs).toISOString()
      });
    });

    app.post(
      "/api/integrations/:provider/link/complete",
      async (req, reply) => {
        const provider = authorize(req, reply);
        if (!provider) return;

        const body = integrationLinkCompleteBodySchema.safeParse(req.body);
        if (!body.success) {
          reply
            .status(400)
            .send({ error: "external_id, code and user_id are required" });
          return;
        }

        prune();
        const pending = pendingLinks.get(body.data.code);
        if (!pending) {
          reply
            .status(410)
            .send({ error: "This link code has expired or was already used" });
          return;
        }
        // Single use: consumed whether or not it matches, so a guessed code
        // cannot be probed against several accounts.
        pendingLinks.delete(body.data.code);

        if (
          pending.provider !== provider ||
          pending.externalId !== body.data.external_id
        ) {
          reply
            .status(400)
            .send({ error: "This link code was issued for a different account" });
          return;
        }

        await ExternalIdentity.link({
          provider,
          externalId: body.data.external_id,
          userId: body.data.user_id
        });
        reply.send({ linked: true });
      }
    );

    app.post("/api/integrations/:provider/token", async (req, reply) => {
      const provider = authorize(req, reply);
      if (!provider) return;

      const body = integrationExternalIdBodySchema.safeParse(req.body);
      if (!body.success) {
        reply.status(400).send({ error: "external_id is required" });
        return;
      }

      if (!options.enforceAuth) {
        reply.status(409).send({
          error:
            "This server runs in local single-user mode, where every request " +
            "is user \"1\": delegated tokens would not isolate anything. Run " +
            "with an enforcing auth provider (Supabase) to use integrations."
        });
        return;
      }

      const identity = await ExternalIdentity.findByExternal(
        provider,
        body.data.external_id
      );
      if (!identity) {
        reply
          .status(404)
          .send({ error: "This account is not linked to a NodeTool user" });
        return;
      }

      const minted = mintDelegatedToken(
        options.signingKey(),
        identity.user_id,
        DELEGATED_TOKEN_TTL_SECONDS,
        now
      );
      reply.send({
        token: minted.token,
        expires_at: minted.expiresAt,
        user_id: identity.user_id
      });
    });

    app.delete("/api/integrations/:provider/link", async (req, reply) => {
      const provider = authorize(req, reply);
      if (!provider) return;

      const body = integrationExternalIdBodySchema.safeParse(req.body);
      if (!body.success) {
        reply.status(400).send({ error: "external_id is required" });
        return;
      }

      const unlinked = await ExternalIdentity.unlink(
        provider,
        body.data.external_id
      );
      reply.send({ unlinked });
    });
  };
}
