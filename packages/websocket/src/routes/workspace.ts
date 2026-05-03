import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleWorkspaceRequest } from "../workspace-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/**
 * Workspace REST plugin — only the binary file-download endpoint remains.
 * CRUD + listFiles moved to the tRPC `workspace` router.
 *
 * Wildcard forwards all /api/workspaces/* paths so the handler can decide
 * whether to respond (for `/:id/download/:path`) or return null (→ 404).
 */
const workspaceRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.all("/api/workspaces/*", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const res = await handleWorkspaceRequest(request, apiOptions);
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

export default workspaceRoutes;
