import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleWorkflowsRoot,
  handleWorkflowById,
  handleWorkflowAutosave,
  handleWorkflowTools,
  handleWorkflowExamples,
  handleWorkflowExamplesSearch,
  handlePublicWorkflows,
  handlePublicWorkflowById,
  handleWorkflowApp,
  handleWorkflowGenerateName,
  handleWorkflowDslExport,
  handleWorkflowGradioExport,
  handleWorkflowVersions,
  handleWorkflowVersionByNumber,
  handleWorkflowVersionDeleteById,
  getUserId
} from "../http-api.js";
import { Workflow } from "@nodetool/models";
import { ApiErrorCode, apiError } from "../error-codes.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const workflowsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;

  // Static sub-routes first (before /:id)
  app.get("/api/workflows/names", async (req, reply) => {
    await bridge(req, reply, async (request) => {
      const userId = getUserId(request, apiOptions.userIdHeader ?? "x-user-id");
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

  // /api/workflows/examples/:id → always 404 in standalone mode
  app.get("/api/workflows/examples/:id", async (_req, reply) => {
    reply
      .status(404)
      .send(
        apiError(
          ApiErrorCode.WORKFLOW_NOT_FOUND,
          "Examples not available in standalone mode"
        )
      );
  });

  app.get("/api/workflows/public", async (req, reply) => {
    await bridge(req, reply, (request) => handlePublicWorkflows(request));
  });

  app.get("/api/workflows/public/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handlePublicWorkflowById(request, id)
    );
  });

  // Root CRUD
  app.get("/api/workflows", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowsRoot(request, apiOptions)
    );
  });
  app.post("/api/workflows", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleWorkflowsRoot(request, apiOptions)
    );
  });

  // Workflow sub-resource routes (before /:id catch-all)
  app.post("/api/workflows/:id/run", async (_req, reply) => {
    reply
      .status(501)
      .send(
        apiError(
          ApiErrorCode.SERVICE_UNAVAILABLE,
          "Workflow execution not available in standalone mode"
        )
      );
  });

  app.post("/api/workflows/:id/autosave", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowAutosave(request, id, apiOptions)
    );
  });
  app.put("/api/workflows/:id/autosave", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowAutosave(request, id, apiOptions)
    );
  });

  app.get("/api/workflows/:id/app", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowApp(request, id, apiOptions)
    );
  });

  app.post("/api/workflows/:id/generate-name", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowGenerateName(request, id, apiOptions)
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

  // Versions
  app.get("/api/workflows/:id/versions", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowVersions(request, id, apiOptions)
    );
  });
  app.post("/api/workflows/:id/versions", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowVersions(request, id, apiOptions)
    );
  });

  // /api/workflows/:id/versions/:version/restore
  app.post(
    "/api/workflows/:id/versions/:version/restore",
    async (req, reply) => {
      const { id, version } = req.params as { id: string; version: string };
      const versionNum = Number.parseInt(version, 10);
      if (Number.isNaN(versionNum)) {
        reply
          .status(400)
          .send(apiError(ApiErrorCode.INVALID_INPUT, "Invalid version number"));
        return;
      }
      await bridge(req, reply, (request) =>
        handleWorkflowVersionByNumber(request, id, versionNum, apiOptions)
      );
    }
  );

  // /api/workflows/:id/versions/:version (GET by number)
  app.get("/api/workflows/:id/versions/:version", async (req, reply) => {
    const { id, version } = req.params as { id: string; version: string };
    const versionNum = Number.parseInt(version, 10);
    if (Number.isNaN(versionNum)) {
      // It's a version ID (string), treat as DELETE target
      reply
        .status(405)
        .send(apiError(ApiErrorCode.INVALID_INPUT, "Method not allowed"));
      return;
    }
    await bridge(req, reply, (request) =>
      handleWorkflowVersionByNumber(request, id, versionNum, apiOptions)
    );
  });

  // /api/workflows/:id/versions/:versionId (DELETE by id)
  app.delete("/api/workflows/:id/versions/:versionId", async (req, reply) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    await bridge(req, reply, (request) =>
      handleWorkflowVersionDeleteById(request, id, versionId, apiOptions)
    );
  });

  // Generic /:id (GET/PUT/DELETE)
  app.get("/api/workflows/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowById(request, id, apiOptions)
    );
  });
  app.put("/api/workflows/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowById(request, id, apiOptions)
    );
  });
  app.delete("/api/workflows/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await bridge(req, reply, (request) =>
      handleWorkflowById(request, id, apiOptions)
    );
  });
};

export default workflowsRoutes;
