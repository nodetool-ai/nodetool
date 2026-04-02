import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleOpenAIRequest } from "../openai-api.js";
import { getUserId } from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const openaiRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.all("/v1/*", async (req, reply) => {
    const url = new URL(req.url, "http://localhost");
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const res = await handleOpenAIRequest(
        request,
        url.pathname,
        userId,
        apiOptions.openai
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

export default openaiRoutes;
