import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import type { HttpApiOptions } from "../http-api.js";
import {
  handleNodeMetadata
} from "../http-api.js";
import {
  resolveComfyWorkflow,
  resolveKieDynamicSchema
} from "@nodetool-ai/base-nodes";
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

  /**
   * ComfyUI workflow parsing for the Comfy runner nodes. Takes a workflow in
   * API format (`workflow`, JSON text or object) or a ComfyUI-exported PNG
   * (`png_base64`), and returns the normalized prompt with the dynamic inputs,
   * outputs, and exposable params the editor shows. Stateless, like the KIE
   * route above.
   */
  app.post(
    "/api/comfy/resolve-workflow",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            workflow: {},
            png_base64: { type: "string", minLength: 1 }
          },
          oneOf: [{ required: ["workflow"] }, { required: ["png_base64"] }]
        }
      }
    },
    async (req, reply) => {
      const body = req.body as { workflow?: unknown; png_base64?: string };
      try {
        reply.send(
          resolveComfyWorkflow(
            isString(body.png_base64)
              ? { png_base64: body.png_base64 }
              : { workflow: body.workflow }
          )
        );
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
    }
  );
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
