/**
 * Workflows REST routes — minimal file-download remnant.
 *
 * All JSON-based workflow operations have been migrated to the tRPC router
 * at `/trpc/workflows.*`.
 *
 * Retained here (file downloads that can't travel through tRPC's JSON layer):
 *   GET  /api/workflows/:id/dsl-export   — TypeScript DSL source download
 *   POST /api/workflows/:id/gradio-export — 501 stub (Gradio not supported in standalone mode)
 *   GET  /api/workflows/examples/thumbnails/:filename — Example workflow thumbnail images
 */

import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleWorkflowDslExport,
  handleWorkflowGradioExport,
  handleWorkflowExamplesThumbnail
} from "../http-api.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const workflowsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  // Must be registered before /:id/dsl-export to avoid the literal "examples"
  // being captured as a workflow :id.
  app.get("/api/workflows/examples/thumbnails/:filename", async (req, reply) => {
    const { filename } = req.params as { filename: string };
    await bridge(req, reply, (request) =>
      handleWorkflowExamplesThumbnail(request, decodeURIComponent(filename), apiOptions)
    );
  });

  app.get("/api/workflows/:id/dsl-export", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowDslExport(request, id, apiOptions)
    );
  });

  app.post("/api/workflows/:id/gradio-export", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowGradioExport(request, id, apiOptions)
    );
  });
};

export default workflowsRoutes;
