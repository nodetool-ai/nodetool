import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  getUserId,
  handleNodeMetadata
} from "../http-api.js";
import {
  handleComfyImportGraph,
  handleComfyNodes,
  handleComfyResolveWorkflow,
  handleComfyServerStatus
} from "../lib/comfy-api.js";
import { importPack, MissingPackError } from "@nodetool-ai/node-catalog";
type IntegrationModule = typeof import("@nodetool-ai/integration-nodes");
import { ApiErrorCode, apiError } from "../error-codes.js";
import {
  isNonBlankString,
  isObjectLike,
  isString
} from "../lib/wire-values.js";
import { parseJsonBodies } from "../lib/json-body.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const nodesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  parseJsonBodies(app);
  const { apiOptions } = opts;

  /**
   * /api/nodes/metadata — stays as REST (public, consumed at client boot).
   * Must NOT require authentication — the frontend calls this before auth.
   */
  app.get("/api/nodes/metadata", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleNodeMetadata(request, apiOptions)
    );
  });

  /**
   * KIE dynamic schema resolution — stays as REST (fast, stateless, no auth needed).
   */
  app.post("/api/kie/resolve-dynamic-schema", async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    const modelInfo = extractKieModelInfo(body);

    if (!isNonBlankString(modelInfo)) {
      reply
        .status(400)
        .send(
          apiError(
            ApiErrorCode.INVALID_INPUT,
            "model_info must be a non-empty string"
          )
        );
      return;
    }

    try {
      const { resolveKieDynamicSchema } = await importPack<IntegrationModule>("integration");
      reply.send(resolveKieDynamicSchema(modelInfo.trim()));
    } catch (error) {
      if (error instanceof MissingPackError) {
        reply.status(503).send({ ...error.details, ...apiError(ApiErrorCode.SERVICE_UNAVAILABLE, error.message) });
        return;
      }
      reply
        .status(400)
        .send(
          apiError(
            ApiErrorCode.INVALID_INPUT,
            error instanceof Error ? error.message : String(error)
          )
        );
    }
  });

  /**
   * ComfyUI workflow parsing for the Comfy runner nodes. Takes a workflow in
   * API format (`workflow`, JSON text or object) or a ComfyUI-exported PNG
   * (`png_base64`), and returns the normalized prompt with the dynamic inputs,
   * outputs, and exposable params the editor shows. Stateless, like the KIE
   * route above.
   */
  app.post("/api/comfy/resolve-workflow", async (req, reply) => {
    await bridge(req, reply, (request) => handleComfyResolveWorkflow(request));
  });

  /**
   * Comfy workflows (`run_mode: "comfy"`): the selected server's node catalog as
   * NodeTool node metadata. Per user, unlike `/api/nodes/metadata`.
   */
  app.get("/api/comfy/nodes", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleComfyNodes(request, getUserId(request, apiOptions.userIdHeader ?? "x-user-id"))
    );
  });

  /** The saved ComfyUI server's version, GPU and model files. */
  app.get("/api/comfy/server-status", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleComfyServerStatus(request, getUserId(request, apiOptions.userIdHeader ?? "x-user-id"))
    );
  });

  /** Import a ComfyUI API-format workflow as a Comfy workflow graph. */
  app.post("/api/comfy/import-graph", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleComfyImportGraph(request, getUserId(request, apiOptions.userIdHeader ?? "x-user-id"))
    );
  });
};

/** A decoded JSON value from the request body. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function extractKieModelInfo(body: unknown): JsonValue | undefined {
  if (Buffer.isBuffer(body)) {
    const text = body.toString("utf8").trim();
    if (!text) {
      return undefined;
    }
    try {
      return extractKieModelInfo(JSON.parse(text));
    } catch {
      return text;
    }
  }

  if (isString(body)) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return extractKieModelInfo(parsed);
    } catch {
      return body;
    }
  }

  if (!isObjectLike(body)) {
    return undefined;
  }

  // SAFETY: the checks above proved `body` is a non-null object; its members
  // came out of a JSON request body.
  const record = body as { [key: string]: JsonValue };
  return (
    record.model_info ??
    record.modelInfo ??
    extractKieModelInfo(record.properties) ??
    extractKieModelInfo(record.body)
  );
}

export default nodesRoutes;
