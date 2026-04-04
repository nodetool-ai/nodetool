import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleJobsRoot,
  handleJobById,
  handleJobCancel,
  handleTriggersRunning,
  handleTriggerStart,
  handleTriggerStop,
  getUserId
} from "../http-api.js";
import { Job } from "@nodetool/models";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

function toBackgroundJobResponse(job: Job) {
  return {
    job_id: job.id,
    status: job.status,
    workflow_id: job.workflow_id,
    created_at: job.started_at ?? null,
    is_running: job.status === "running" || job.status === "scheduled",
    is_completed:
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
  };
}

const jobsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  app.get("/api/jobs/running/all", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
      const [jobs] = await Job.paginate(userId, { limit: 500 });
      const running = jobs.filter(
        (j) => j.status === "running" || j.status === "scheduled"
      );
      return new Response(
        JSON.stringify(running.map(toBackgroundJobResponse)),
        {
          headers: { "content-type": "application/json" }
        }
      );
    });
  });

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

  app.post("/api/jobs/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleJobCancel(request, id, apiOptions)
    );
  });

  app.get("/api/jobs", async (req, reply) => {
    await bridge(req, reply, (request) => handleJobsRoot(request, apiOptions));
  });

  app.get("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleJobById(request, id, apiOptions)
    );
  });

  app.delete("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleJobById(request, id, apiOptions)
    );
  });
};

export default jobsRoutes;
