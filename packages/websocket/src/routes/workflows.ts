/**
 * Workflows REST routes — file downloads and JSON metadata used outside tRPC.
 *
 * The web app uses `/trpc/workflows.*`. These routes serve:
 *   - Workflow list / detail JSON (`GET /api/workflows`, `GET /api/workflows/:id`) for SDKs (e.g. VVVV)
 *   - Public workflows, examples, tools, names (parity with `http-api` router)
 *   - File endpoints that cannot use tRPC's JSON layer (DSL export, thumbnails, Gradio stub)
 */

import type { FastifyPluginAsync } from "fastify";
import { Workflow } from "@nodetool-ai/models";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import {
  handleWorkflowById,
  handleWorkflowDslExport,
  handleWorkflowExportBundle,
  handleWorkflowsExportBundle,
  handleWorkflowImportBundle,
  handleWorkflowExamples,
  handleWorkflowExamplesSearch,
  handleWorkflowGradioExport,
  handleWorkflowExamplesThumbnail,
  handleWorkflowTools,
  handleWorkflowsRoot,
  handlePublicWorkflowById,
  handlePublicWorkflows
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

  // -------------------------------------------------------------------------
  // JSON workflow list/detail — kept on REST for public metadata (VVVV SDK,
  // bootstrapping) alongside tRPC `workflows.*` for the web app.
  // Order: longest/static paths before `/api/workflows/:id`.
  // -------------------------------------------------------------------------

  app.get("/api/workflows/examples/search", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowExamplesSearch(request, apiOptions)
    );
  });

  app.get("/api/workflows/examples", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowExamples(request, apiOptions)
    );
  });

  app.get("/api/workflows/names", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ detail: "Method not allowed" }), {
          status: 405,
          headers: { "content-type": "application/json" }
        });
      }
      const userId = getUserId(
        request,
        apiOptions.userIdHeader ?? "x-user-id"
      );
      const [workflows] = await Workflow.paginate(userId, { limit: 1000 });
      const names: Record<string, string> = {};
      for (const wf of workflows) names[wf.id] = wf.name;
      return new Response(JSON.stringify(names), {
        headers: { "content-type": "application/json" }
      });
    });
  });

  app.get("/api/workflows/tools", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowTools(request, apiOptions)
    );
  });

  // Bundle export/import (.nodetool). Static paths registered before
  // `/api/workflows/:id` so they aren't captured as a workflow id.
  app.post("/api/workflows/export-bundle", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowsExportBundle(request, apiOptions)
    );
  });

  app.post("/api/workflows/import-bundle", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowImportBundle(request, apiOptions)
    );
  });

  app.get("/api/workflows/public/:workflowId", async (req, reply) => {
    const { workflowId } = req.params as { workflowId: string };
    await bridge(req, reply, (request) =>
      handlePublicWorkflowById(request, decodeURIComponent(workflowId))
    );
  });

  app.get("/api/workflows/public", async (req, reply) => {
    await bridge(req, reply, (request) => handlePublicWorkflows(request));
  });

  // Single route: Fastify normalizes `/api/workflows` and `/api/workflows/` to one path.
  app.get("/api/workflows", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowsRoot(request, apiOptions)
    );
  });

  app.get("/api/workflows/:id/dsl-export", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowDslExport(request, id, apiOptions)
    );
  });

  app.get("/api/workflows/:id/export-bundle", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowExportBundle(request, id, apiOptions)
    );
  });

  app.post("/api/workflows/:id/gradio-export", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowGradioExport(request, id, apiOptions)
    );
  });

  app.get("/api/workflows/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowById(request, id, apiOptions)
    );
  });
};

export default workflowsRoutes;
