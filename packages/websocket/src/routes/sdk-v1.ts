import { gzipSync } from "node:zlib";
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest
} from "fastify";
import {
  implementedSdkV1HttpOperations,
  type ImplementedSdkV1HttpOperationId
} from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import { sdkNodeTypeInventoryInput } from "@nodetool-ai/protocol/api-schemas/nodes.js";
import {
  sdkV1ModelCatalogQuery,
  sdkV1ModelDownloadCancelRequest,
  sdkV1ModelDownloadQuery,
  sdkV1ModelDownloadStartRequest
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import { sdkV1PreflightRequest } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import {
  sdkWorkflowSummariesInput,
  workflowInterfacesInput
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { GZIP_THRESHOLD } from "../lib/compression.js";
import { bridge } from "../lib/bridge.js";
import {
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "../http-api.js";
import { handleSdkV1TemporaryAssetUpload } from "../sdk/sdk-temporary-asset-upload-http-handler.js";
import type { SdkV1ImplementationBoundary } from "../sdk/sdk-v1-handler-map.js";
import {
  normalizeSdkV1ServiceError,
  reportSdkV1InternalError,
  sdkV1HttpError
} from "../sdk/sdk-v1-service-error.js";
import { createLogger } from "@nodetool-ai/config";

export type SdkV1RouteApiOptions = HttpApiOptions & {
  readonly sdkV1Boundary: SdkV1ImplementationBoundary;
};

interface SdkV1RoutesOptions {
  readonly apiOptions: SdkV1RouteApiOptions;
}

declare module "fastify" {
  interface FastifyContextConfig {
    sdkV1Operation?: {
      readonly id: ImplementedSdkV1HttpOperationId;
      readonly method: "GET" | "POST";
      readonly path: string;
    };
    sdkV1NotFound?: true;
  }
}

const log = createLogger("nodetool.websocket.sdk-v1");

const SDK_V1_JSON_BODY_OPERATIONS = new Set<ImplementedSdkV1HttpOperationId>([
  "startModelDownload",
  "cancelModelDownload",
  "preflightWorkflow",
  "getWorkflowInterfaces"
]);

type SdkV1FastifyHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

function fastifyPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ":$1");
}

function acceptsGzip(request: FastifyRequest): boolean {
  const value = request.headers["accept-encoding"];
  return (Array.isArray(value) ? value.join(", ") : (value ?? "")).includes(
    "gzip"
  );
}

function sendJson(
  request: FastifyRequest,
  reply: FastifyReply,
  body: unknown,
  status = 200
): void {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  reply.code(status).type("application/json");
  if (bytes.length > GZIP_THRESHOLD && acceptsGzip(request)) {
    const compressed = gzipSync(bytes);
    reply.header("content-encoding", "gzip");
    reply.header("content-length", String(compressed.length));
    reply.send(compressed);
    return;
  }
  reply.header("content-length", String(bytes.length));
  reply.send(bytes);
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  retryable = false
): void {
  sendJson(request, reply, { code, message, retryable }, status);
}

function sendServiceError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown
): void {
  const normalized = normalizeSdkV1ServiceError(error);
  reportSdkV1InternalError(normalized, (cause) => {
    log.error(
      "SDK v1 service failed",
      cause instanceof Error ? cause : new Error(String(cause))
    );
  });
  const mapped = sdkV1HttpError(normalized);
  sendJson(request, reply, mapped.body, mapped.status);
}

function userId(request: FastifyRequest): string {
  return request.userId ?? "1";
}

function queryRecord(request: FastifyRequest): Record<string, unknown> {
  return (request.query ?? {}) as Record<string, unknown>;
}

function createSdkV1RouteHandlers(
  apiOptions: SdkV1RouteApiOptions
): Readonly<Record<ImplementedSdkV1HttpOperationId, SdkV1FastifyHandler>> {
  const boundary = apiOptions.sdkV1Boundary;

  return {
    getNodeTypeInventory: async (request, reply) => {
      const raw = queryRecord(request);
      const input: { cursor?: number; limit?: number } = {};
      if (raw.cursor !== undefined) {
        input.cursor = Number(raw.cursor);
      }
      if (raw.limit !== undefined) {
        input.limit = Number(raw.limit);
      }
      const parsed = sdkNodeTypeInventoryInput.safeParse(input);
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_INPUT",
          "cursor must be >= 0 and limit 1..100"
        );
        return;
      }
      try {
        const registry =
          apiOptions.registry ??
          (await getWorkflowRuntimeEnvironment(apiOptions)).registry;
        sendJson(
          request,
          reply,
          await boundary.handlers.getNodeTypeInventory({
            request: parsed.data,
            registry,
            pythonBridgeReady: apiOptions.getPythonBridgeReady?.() ?? false
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    getCapabilities: async (request, reply) => {
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.getCapabilities(undefined)
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    listModels: async (request, reply) => {
      const parsed = sdkV1ModelCatalogQuery.safeParse(queryRecord(request));
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_INPUT",
          "Invalid model catalog query"
        );
        return;
      }
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.listModels({
            userId: userId(request),
            query: parsed.data
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    listModelDownloads: async (request, reply) => {
      const parsed = sdkV1ModelDownloadQuery.safeParse(queryRecord(request));
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_INPUT",
          "Invalid model download query"
        );
        return;
      }
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.listModelDownloads({
            userId: userId(request),
            query: parsed.data
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    startModelDownload: async (request, reply) => {
      const parsed = sdkV1ModelDownloadStartRequest.safeParse(request.body);
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_INPUT",
          "Invalid model download request"
        );
        return;
      }
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.startModelDownload({
            userId: userId(request),
            request: parsed.data
          }),
          202
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    cancelModelDownload: async (request, reply) => {
      const parsed = sdkV1ModelDownloadCancelRequest.safeParse(request.body);
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_INPUT",
          "Invalid model download cancellation request"
        );
        return;
      }
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.cancelModelDownload({
            userId: userId(request),
            operationId: parsed.data.operation_id
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    preflightWorkflow: async (request, reply) => {
      const parsed = sdkV1PreflightRequest.safeParse(request.body);
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_REQUEST",
          "Invalid preflight request"
        );
        return;
      }
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.preflightWorkflow({
            request: parsed.data,
            principal: request.userId ? { userId: request.userId } : null
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    listWorkflowSummaries: async (request, reply) => {
      const raw = queryRecord(request);
      const input: { limit?: number; cursor?: string } = {};
      if (raw.limit !== undefined) {
        input.limit = Number(raw.limit);
      }
      if (typeof raw.cursor === "string") {
        input.cursor = raw.cursor;
      }
      const parsed = sdkWorkflowSummariesInput.safeParse(input);
      if (!parsed.success) {
        sendError(request, reply, 400, "INVALID_INPUT", "Invalid workflow summary query");
        return;
      }
      try {
        sendJson(
          request,
          reply,
          await boundary.handlers.listWorkflowSummaries({
            userId: userId(request),
            request: parsed.data,
            registryRevision: Number.isSafeInteger(apiOptions.registry?.revision)
              ? apiOptions.registry!.revision
              : null
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    getWorkflowInterfaces: async (request, reply) => {
      const parsed = workflowInterfacesInput.safeParse(request.body);
      if (!parsed.success) {
        sendError(
          request,
          reply,
          400,
          "INVALID_INPUT",
          "Expected 1 to 100 unique workflow ids"
        );
        return;
      }
      try {
        const registry =
          apiOptions.registry ??
          (await getWorkflowRuntimeEnvironment(apiOptions)).registry;
        sendJson(
          request,
          reply,
          await boundary.handlers.getWorkflowInterfaces({
            userId: userId(request),
            request: parsed.data,
            registry
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    getWorkflowInterface: async (request, reply) => {
      const { id } = request.params as { readonly id: string };
      const { version } = queryRecord(request);
      if (version !== "1") {
        sendError(
          request,
          reply,
          400,
          "UNSUPPORTED_WORKFLOW_INTERFACE_VERSION",
          "Workflow interface version 1 is required"
        );
        return;
      }
      try {
        const registry =
          apiOptions.registry ??
          (await getWorkflowRuntimeEnvironment(apiOptions)).registry;
        sendJson(
          request,
          reply,
          await boundary.handlers.getWorkflowInterface({
            userId: userId(request),
            workflowId: id,
            registry
          })
        );
      } catch (error) {
        sendServiceError(request, reply, error);
      }
    },

    uploadTemporaryAsset: async (request, reply) => {
      await bridge(
        request,
        reply,
        (webRequest) =>
          handleSdkV1TemporaryAssetUpload(webRequest, { boundary }),
        apiOptions.userIdHeader ?? "x-user-id"
      );
    }
  };
}

/** Registers every implemented SDK v1 HTTP declaration exactly once. */
const sdkV1Routes: FastifyPluginAsync<SdkV1RoutesOptions> = async (
  app,
  options
) => {
  const handlers = createSdkV1RouteHandlers(options.apiOptions);

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      error !== null &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (statusCode === 415) {
      sendError(
        request,
        reply,
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json"
      );
      return;
    }
    if (statusCode === 400) {
      sendError(request, reply, 400, "INVALID_REQUEST", "Invalid JSON body");
      return;
    }
    log.error("SDK v1 route failed", error);
    sendError(
      request,
      reply,
      500,
      "INTERNAL_ERROR",
      "Internal server error"
    );
  });

  app.addHook("preValidation", async (request, reply) => {
    const operation = request.routeOptions.config.sdkV1Operation;
    if (!operation || !SDK_V1_JSON_BODY_OPERATIONS.has(operation.id)) {
      return;
    }
    const contentType = request.headers["content-type"];
    if (
      typeof contentType !== "string" ||
      !contentType.toLowerCase().startsWith("application/json")
    ) {
      sendError(
        request,
        reply,
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type must be application/json"
      );
      return;
    }
    if (
      Buffer.isBuffer(request.body) ||
      request.body instanceof Uint8Array ||
      typeof request.body === "string"
    ) {
      try {
        const text =
          typeof request.body === "string"
            ? request.body
            : Buffer.from(request.body).toString("utf8");
        request.body = JSON.parse(text) as unknown;
      } catch {
        sendError(request, reply, 400, "INVALID_REQUEST", "Invalid JSON body");
      }
    }
  });

  for (const operation of implementedSdkV1HttpOperations) {
    app.route({
      method: operation.method,
      url: fastifyPath(operation.path),
      exposeHeadRoute: false,
      config: {
        sdkV1Operation: {
          id: operation.id,
          method: operation.method,
          path: operation.path
        }
      },
      handler: handlers[operation.id]
    });
  }

  const notFoundHandler: SdkV1FastifyHandler = async (request, reply) => {
    sendError(request, reply, 404, "NOT_FOUND", "SDK endpoint not found");
  };
  for (const path of ["/api/sdk/v1", "/api/sdk/v1/*"]) {
    app.route({
      method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      url: fastifyPath(path),
      config: { sdkV1NotFound: true },
      handler: notFoundHandler
    });
  }
};

export default sdkV1Routes;
