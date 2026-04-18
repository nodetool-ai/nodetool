import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleCollectionRequest } from "../collection-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/**
 * Collections REST plugin — only the multipart file-upload endpoint remains.
 * CRUD + query operations moved to the tRPC `collections` router.
 *
 * The wildcard route intentionally forwards all /api/collections/*
 * paths so the handler can decide whether to respond (for /index) or return
 * null (so we can 404).
 */
const collectionsRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;

  app.all("/api/collections/*", async (req, reply) => {
    const url = new URL(req.url, "http://localhost");
    await bridge(req, reply, async (request) => {
      const res = await handleCollectionRequest(
        request,
        url.pathname,
        apiOptions
      );
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });

  // Admin endpoints (stubs)
  app.post("/admin/secrets/import", async (_req, reply) => {
    reply
      .status(501)
      .send({ detail: "Secrets import not available in standalone mode" });
  });
};

export default collectionsRoutes;
