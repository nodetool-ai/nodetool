import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleTriggersRunning,
  handleTriggerStart,
  handleTriggerStop
} from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/**
 * Jobs REST plugin — only the trigger-job stub routes remain here.
 * CRUD + cancel + running-all moved to the tRPC `jobs` router.
 *
 * Trigger workflows aren't available in standalone mode — these endpoints
 * return empty lists / 501s and are kept on REST to avoid polluting the
 * tRPC type surface with stub-only procedures.
 */
const jobsRoutes: FastifyPluginAsync<RouteOptions> = async (app) => {
  app.get("/api/jobs/triggers/running", async (req, reply) => {
    await bridge(req, reply, (request) => handleTriggersRunning(request));
  });

  app.post("/api/jobs/triggers/:id/start", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) => handleTriggerStart(request, id));
  });

  app.post("/api/jobs/triggers/:id/stop", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) => handleTriggerStop(request, id));
  });
};

export default jobsRoutes;
