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

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { gzipSync } from "node:zlib";
import { TRPCError } from "@trpc/server";
import {
  publicApplication,
  publicApplicationSession
} from "@nodetool-ai/protocol/api-schemas/applications.js";
import { z, type ZodType } from "zod";

import { GZIP_THRESHOLD } from "../lib/compression.js";

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

const publicAppParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["token"],
  properties: { token: { type: "string", minLength: 1 } }
} as const;

const unavailableSchema = {
  type: "object",
  additionalProperties: false,
  required: ["detail"],
  properties: { detail: { type: "string" } }
} as const;

function responseSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any"
  });
  return json;
}

const publicAppSchema = {
  params: publicAppParamsSchema,
  response: {
    200: responseSchema(publicApplication),
    404: unavailableSchema
  }
};

const publicAppSessionSchema = {
  params: publicAppParamsSchema,
  response: {
    200: responseSchema(publicApplicationSession),
    404: unavailableSchema
  }
};

function sendUnavailable(reply: FastifyReply): void {
  reply
    .header("cache-control", "no-store")
    .code(404)
    .send({ detail: "This app is not available" });
}

const publicAppRoutes: FastifyPluginAsync<PublicAppRouteOptions> = async (
  app,
  opts
) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      sendUnavailable(reply);
      return;
    }
    // Hand anything else back to Fastify's own handler rather than deciding
    // here what a visitor may learn about it.
    reply.send(error);
  });

  // A released app document carries every pinned graph, so the one response a
  // visitor gets can be large. The plugin compresses it itself: these routes
  // no longer go through the request bridge, which used to do this.
  app.addHook("onSend", async (request, reply, payload) => {
    if (typeof payload !== "string" || payload.length < GZIP_THRESHOLD) {
      return payload;
    }
    const accepted = request.headers["accept-encoding"];
    if (typeof accepted !== "string" || !accepted.includes("gzip")) {
      return payload;
    }
    const compressed = gzipSync(Buffer.from(payload));
    reply.header("content-encoding", "gzip");
    reply.header("content-length", compressed.byteLength);
    return compressed;
  });

  app.get<{ Params: { token: string } }>(
    "/api/apps/:token",
    { schema: publicAppSchema },
    async (req, reply) => {
      const application = await getPublicApplication(req.params.token);
      reply.header("cache-control", "no-store").send(application);
    }
  );

  app.post<{ Params: { token: string } }>(
    "/api/apps/:token/session",
    { schema: publicAppSessionSchema },
    async (req, reply) => {
      const session = await createPublicApplicationSession(
        req.params.token,
        opts.appSessionSigningKey()
      );
      reply.header("cache-control", "no-store").send(session);
    }
  );
};

export default publicAppRoutes;
