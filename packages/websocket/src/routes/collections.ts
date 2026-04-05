import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleCollectionRequest } from "../collection-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const collectionsRoutes: FastifyPluginAsync<RouteOptions> = async (
  app,
  opts
) => {
  const { apiOptions } = opts;

  app.all("/api/collections", async (req, reply) => {
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

  // Debug export
  app.post("/api/debug/export", async (req, reply) => {
    const { handleDebugExportRequest } = await import("../debug-api.js");
    await bridge(req, reply, (request) => handleDebugExportRequest(request));
  });

  // Admin endpoints (stubs)
  app.post("/admin/secrets/import", async (_req, reply) => {
    reply
      .status(501)
      .send({ detail: "Secrets import not available in standalone mode" });
  });
};

export default collectionsRoutes;
