import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleOAuthRequest } from "../oauth-api.js";
import { getUserId } from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const oauthRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.all("/api/oauth/*", async (req, reply) => {
    const url = new URL(req.url, "http://localhost");
    await bridge(req, reply, async (request) => {
      const res = await handleOAuthRequest(request, url.pathname, () =>
        getUserId(request, apiOptions.userIdHeader ?? "x-user-id")
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
};

export default oauthRoutes;
