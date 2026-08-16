import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleNodeMetadata,
  handleSdkCapabilities,
  handleSdkModelCatalog,
  handleSdkModelDownloadCancel,
  handleSdkModelDownloads,
  handleSdkModelDownloadStart,
  handleSdkNodeTypeInventory,
  handleSdkPreflight
} from "../http-api.js";
import { resolveKieDynamicSchema } from "@nodetool-ai/base-nodes";
import { ApiErrorCode, apiError } from "../error-codes.js";
import {
  isNonBlankString,
  isObjectLike,
  isString
} from "../lib/wire-values.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const nodesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
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

  app.get("/api/sdk/v1/node-types", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkNodeTypeInventory(request, apiOptions)
    );
  });

  app.get("/api/sdk/v1/capabilities", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkCapabilities(request, apiOptions)
    );
  });

  app.get("/api/sdk/v1/models", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkModelCatalog(request, apiOptions)
    );
  });

  app.get("/api/sdk/v1/model-downloads", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkModelDownloads(request, apiOptions)
    );
  });

  app.post("/api/sdk/v1/model-downloads", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkModelDownloadStart(request, apiOptions)
    );
  });

  app.post("/api/sdk/v1/model-downloads/cancel", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkModelDownloadCancel(request, apiOptions)
    );
  });

  app.post("/api/sdk/v1/preflight", async (req, reply) => {
    await bridge(req, reply, (request) =>
      handleSdkPreflight(request, apiOptions)
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
      reply.send(resolveKieDynamicSchema(modelInfo.trim()));
    } catch (error) {
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
