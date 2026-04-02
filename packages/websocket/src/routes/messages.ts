import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleMessagesRoot, handleMessageById } from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const messagesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/messages", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleMessagesRoot(request, apiOptions)
    );
  });
  app.post("/api/messages", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleMessagesRoot(request, apiOptions)
    );
  });

  app.get("/api/messages/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleMessageById(request, id, apiOptions)
    );
  });
  app.delete("/api/messages/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleMessageById(request, id, apiOptions)
    );
  });
};

export default messagesRoutes;
