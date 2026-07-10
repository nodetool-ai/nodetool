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
 * Jobs REST plugin — only the trigger-registration routes remain here.
 * CRUD + cancel + running-all moved to the tRPC `jobs` router.
 *
 * These endpoints list and toggle the durable `trigger_registrations` that
 * back host-owned ingestion adapters. Kept on REST to avoid polluting the
 * tRPC type surface.
 */
const jobsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/jobs/triggers/running", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleTriggersRunning(request, apiOptions)
    );
  });

  app.post("/api/jobs/triggers/:id/start", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleTriggerStart(request, id, apiOptions)
    );
  });

  app.post("/api/jobs/triggers/:id/stop", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleTriggerStop(request, id, apiOptions)
    );
  });
};

export default jobsRoutes;
