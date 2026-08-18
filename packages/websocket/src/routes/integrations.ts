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

import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { mintDelegatedToken } from "@nodetool-ai/auth";
import { ExternalIdentity } from "@nodetool-ai/models";

import {
  integrationExternalIdBodySchema,
  integrationLinkCompleteBodySchema
} from "../http-body-schemas.js";
import { LinkCodeStore, sharedLinkCodes } from "../lib/link-codes.js";

/** Platforms the identity layer accepts. `provider` is data, not a route. */
const ALLOWED_PROVIDERS = ["telegram", "discord"] as const;

/** A service token shorter than this is refused rather than trusted. */
const MIN_SERVICE_TOKEN_LENGTH = 16;

/** Lifetime of a minted delegated token. */
const DELEGATED_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * `/link/complete` body. `user_id` is required only for a bot-minted code:
 * a web-minted code already carries the user who was signed in when it was
 * created, and that user wins over anything the bridge sends.
 */
const linkCompleteBodySchema = integrationLinkCompleteBodySchema.extend({
  user_id: z.string().min(1).optional()
});

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
  /**
   * The link-code store. Defaults to the process-wide one the tRPC router also
   * uses, which is what lets a deep link minted in the browser be redeemed
   * here. Tests pass their own.
   */
  linkCodes?: LinkCodeStore;
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
  const linkCodes =
    options.linkCodes ??
    (options.now ? new LinkCodeStore({ now: options.now }) : sharedLinkCodes);

  return async (app) => {
    const serviceToken = process.env["NODETOOL_INTEGRATION_TOKEN"];
    if (!serviceToken || serviceToken.length < MIN_SERVICE_TOKEN_LENGTH) {
      // No service token, no surface: the routes are never registered, so
      // every path answers 404 rather than 401.
      return;
    }

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

      const { code, expiresAtMs } = linkCodes.mintForExternalAccount(
        provider,
        body.data.external_id
      );

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

        const body = linkCompleteBodySchema.safeParse(req.body);
        if (!body.success) {
          reply
            .status(400)
            .send({ error: "external_id, code and user_id are required" });
          return;
        }

        const pending = linkCodes.consume(body.data.code);
        if (!pending) {
          reply
            .status(410)
            .send({ error: "This link code has expired or was already used" });
          return;
        }

        if (pending.provider !== provider) {
          reply
            .status(400)
            .send({ error: "This link code was issued for a different account" });
          return;
        }

        // A web-minted code carries the user who was signed in when it was
        // created; the bridge supplies the external account it belongs to.
        // A bot-minted code is the mirror image, and the browser that redeems
        // it is what names the user.
        let userId: string;
        if (pending.kind === "user") {
          userId = pending.userId;
        } else {
          if (pending.externalId !== body.data.external_id) {
            reply.status(400).send({
              error: "This link code was issued for a different account"
            });
            return;
          }
          if (!body.data.user_id) {
            reply
              .status(400)
              .send({ error: "external_id, code and user_id are required" });
            return;
          }
          userId = body.data.user_id;
        }

        await ExternalIdentity.link({
          provider,
          externalId: body.data.external_id,
          userId
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
