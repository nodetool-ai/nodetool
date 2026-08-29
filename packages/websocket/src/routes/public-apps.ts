/**
 * The two unauthenticated routes a deployed mini app is served from.
 *
 *   GET  /api/apps/:token          → PublicApplication
 *   POST /api/apps/:token/session  → PublicApplicationSession
 *
 * They sit outside `/api/applications` deliberately: everything under that
 * prefix reads the caller's own library and stays behind auth, and a public
 * route added there would be one `startsWith` away from exempting the rest.
 * The prefix is the allowlist entry (`isPublicAppDeploymentRequest`), so the
 * shape of the URL is what makes it public — not a flag inside a handler.
 *
 * Registered on every server; the handlers refuse outside production, so
 * whether the surface exists is decided at request time by one predicate
 * rather than by boot order.
 */

import type { FastifyPluginAsync } from "fastify";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";

import { bridge } from "../lib/bridge.js";
import {
  createPublicApplicationSession,
  getPublicApplication
} from "../lib/app-deployment-service.js";

export interface PublicAppRouteOptions {
  /**
   * HMAC key for minting run sessions. An accessor rather than the key: a
   * server that never serves a deployed app never derives it.
   */
  appSessionSigningKey: () => Buffer | string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    // A deployment's release moves under the URL when the owner publishes, and
    // a session token is single-use-ish and short-lived. Neither may sit in a
    // shared cache.
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}

/**
 * Shape a service call into a response. Everything a visitor can trip is
 * already a `TRPCError` carrying the one 404 the service uses for every
 * failure, so nothing here needs to decide what to disclose.
 */
async function respond<T>(produce: () => Promise<T>): Promise<Response> {
  try {
    return jsonResponse(await produce());
  } catch (error) {
    if (error instanceof TRPCError) {
      return jsonResponse(
        { detail: error.message },
        getHTTPStatusCodeFromError(error)
      );
    }
    throw error;
  }
}

const publicAppRoutes: FastifyPluginAsync<PublicAppRouteOptions> = async (
  app,
  opts
) => {
  app.get("/api/apps/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    await bridge(req, reply, () => respond(() => getPublicApplication(token)));
  });

  app.post("/api/apps/:token/session", async (req, reply) => {
    const { token } = req.params as { token: string };
    await bridge(req, reply, () =>
      respond(() =>
        createPublicApplicationSession(token, opts.appSessionSigningKey())
      )
    );
  });
};

export default publicAppRoutes;
