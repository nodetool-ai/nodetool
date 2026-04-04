import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleThreadsRoot,
  handleThreadById,
  handleThreadSummarize
} from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const threadsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/threads", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleThreadsRoot(request, apiOptions)
    );
  });
  app.post("/api/threads", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleThreadsRoot(request, apiOptions)
    );
  });

  app.post("/api/threads/:id/summarize", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleThreadSummarize(request, id, apiOptions)
    );
  });

  app.get("/api/threads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleThreadById(request, id, apiOptions)
    );
  });
  app.put("/api/threads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleThreadById(request, id, apiOptions)
    );
  });
  app.delete("/api/threads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleThreadById(request, id, apiOptions)
    );
  });
};

export default threadsRoutes;
