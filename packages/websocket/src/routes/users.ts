import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleUsersRequest } from "../users-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const usersRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.all("/api/users", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleUsersRequest(request, "/api/users", apiOptions);
      return (
        res ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  });

  app.all("/api/users/*", async (req, reply) => {
    const url = new URL(req.url, "http://localhost");
    await bridge(req, reply, async (request) => {
      const res = await handleUsersRequest(request, url.pathname, apiOptions);
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

export default usersRoutes;
