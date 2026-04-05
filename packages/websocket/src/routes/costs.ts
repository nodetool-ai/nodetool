import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleCostRequest } from "../cost-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const costsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.all("/api/costs", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleCostRequest(request, apiOptions);
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });

  app.all("/api/costs/*", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleCostRequest(request, apiOptions);
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

export default costsRoutes;
