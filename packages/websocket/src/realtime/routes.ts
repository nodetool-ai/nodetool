import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { HttpApiOptions } from "../http-api.js";
import { realtimeSessionManager } from "./session-manager.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

type AuthedRequest = FastifyRequest & { userId?: string | null };

const getRequestUserId = (request: FastifyRequest): string =>
  (request as AuthedRequest).userId ?? "1";

const realtimeRoutes: FastifyPluginAsync<RouteOptions> = async (app) => {
  app.get("/api/realtime/sessions", async (req, reply) => {
    const sessions = realtimeSessionManager.listSessions(getRequestUserId(req));
    return reply.send({ sessions });
  });

  app.get("/api/realtime/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = realtimeSessionManager.getSession(id, getRequestUserId(req));

    if (!session) {
      return reply.status(404).send({ error: "Realtime session not found" });
    }

    return reply.send(session);
  });
};

export default realtimeRoutes;
