import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import { handleNodeMetadata } from "../http-api.js";
import { resolveKieDynamicSchema } from "@nodetool-ai/base-nodes";
import { ApiErrorCode, apiError } from "../error-codes.js";

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

  /**
   * Legacy alias for /api/nodes/metadata.
   */
  app.get("/api/node/metadata", async (req, reply) => {
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

    if (typeof modelInfo !== "string" || !modelInfo.trim()) {
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

function extractKieModelInfo(body: unknown): unknown {
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

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      return extractKieModelInfo(parsed);
    } catch {
      return body;
    }
  }

  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  return (
    record.model_info ??
    record.modelInfo ??
    extractKieModelInfo(record.properties) ??
    extractKieModelInfo(record.body)
  );
}

export default nodesRoutes;
