import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleModelsApiRequest } from "../models-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const modelsRoutes: FastifyPluginAsync<RouteOptions> = async (app, _opts) => {
  app.all("/api/models", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleModelsApiRequest(request);
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });

  app.all("/api/models/*", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleModelsApiRequest(request);
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });
};

export default modelsRoutes;
