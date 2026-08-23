/**
 * Workflows REST routes — file downloads and JSON metadata used outside tRPC.
 *
 * The web app uses `/trpc/workflows.*`. These routes serve:
 *   - Workflow list, creation, and detail JSON for SDKs and agents
 *   - Public workflows, examples, tools, names (parity with `http-api` router)
 *   - File endpoints that cannot use tRPC's JSON layer (DSL export, thumbnails)
 */

import type { FastifyPluginAsync } from "fastify";
import { Workflow } from "@nodetool-ai/models";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import {
  handleWorkflowById,
  handleWorkflowRun,
  handleDebugSessionRequest,
  handleWorkflowDslExport,
  handleWorkflowExportBundle,
  handleWorkflowsExportBundle,
  handleWorkflowImportBundle,
  handleWorkflowExamples,
  handleWorkflowExamplesSearch,
  handleWorkflowExamplesThumbnail,
  handleWorkflowExampleByName,
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

  // One example workflow, graph included — the fetch counterpart of the list
  // above, and what the `get_example_workflow` agent tool calls.
  app.get(
    "/api/workflows/examples/:package_name/:example_name",
    async (req, reply) => {
      const { package_name, example_name } = req.params as {
        package_name: string;
        example_name: string;
      };
      await bridge(req, reply, (request) =>
        handleWorkflowExampleByName(request, package_name, example_name, apiOptions)
      );
    }
  );

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
  app.route({
    method: ["GET", "POST"],
    url: "/api/workflows",
    handler: async (req, reply) => {
      await bridge(req, reply, (request) =>
        handleWorkflowsRoot(request, apiOptions)
      );
    }
  });

  // Execute a saved workflow. The editor runs workflows over the WebSocket, so
  // these two are the agent surface: `run_workflow`, `debug_workflow`,
  // `start_background_job`, and the `nodetool debug` harness all POST here.
  app.post("/api/workflows/:id/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowRun(request, id, apiOptions)
    );
  });

  app.post("/api/workflows/:id/debug", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowRun(request, id, apiOptions, true)
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

  // Interactive debug sessions — the escalation channel an agent polls after a
  // `run`/`debug` call made with `interactive: true`.
  app.get("/api/debug/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleDebugSessionRequest(request, id, null, apiOptions)
    );
  });

  app.post("/api/debug/sessions/:id/:action", async (req, reply) => {
    const { id, action } = req.params as { id: string; action: string };
    await bridge(req, reply, (request) =>
      handleDebugSessionRequest(request, id, action, apiOptions)
    );
  });

  app.route({
    method: ["GET", "PUT", "DELETE"],
    url: "/api/workflows/:id",
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      await bridge(req, reply, (request) =>
        handleWorkflowById(request, id, apiOptions)
      );
    }
  });
};

export default workflowsRoutes;
