import type { FastifyPluginAsync } from "fastify";
import { syncCapabilities } from "../trpc/routers/sync.js";

/**
 * `GET /api/sync/capabilities`: the sync capabilities for a client that has
 * not signed in, so it can tell an update prompt from a sign-in prompt on a
 * server that enforces auth. The auth hook exempts exactly this method and
 * path (see `isPublicAuthExemptRoute`).
 */
const syncCapabilitiesRoute: FastifyPluginAsync = async (app) => {
  app.get("/api/sync/capabilities", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    return syncCapabilities();
  });
};

export default syncCapabilitiesRoute;
