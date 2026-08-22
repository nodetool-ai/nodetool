import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  HTTPMethods
} from "fastify";
import {
  implementedSdkV1HttpOperations,
  type ImplementedSdkV1HttpOperationId
} from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import { bridge } from "../lib/bridge.js";
import {
  handleSdkCapabilities,
  handleSdkModelCatalog,
  handleSdkModelDownloadCancel,
  handleSdkModelDownloads,
  handleSdkModelDownloadStart,
  handleSdkNodeTypeInventory,
  handleSdkPreflight,
  handleSdkWorkflowSummaries,
  handleWorkflowInterface,
  handleWorkflowInterfaces,
  resolveSdkV1Boundary,
  type HttpApiOptions
} from "../http-api.js";
import { handleSdkV1TemporaryAssetUpload } from "../sdk/sdk-temporary-asset-upload-http-handler.js";

interface SdkV1RoutesOptions {
  readonly apiOptions: HttpApiOptions;
  /** Test-only or temporary mount prefix used for shadow parity checks. */
  readonly routePrefix?: string;
}

declare module "fastify" {
  interface FastifyContextConfig {
    sdkV1Operation?: {
      readonly id: ImplementedSdkV1HttpOperationId;
      readonly method: "GET" | "POST";
      readonly path: string;
    };
    sdkV1MethodFallback?: true;
  }
}

const SDK_V1_ROUTABLE_METHODS: HTTPMethods[] = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT"
];

// These operations historically also passed through handleApiRequest, which
// returned its handler-owned 405 envelope for a wrong method. The other SDK
// routes were Fastify-only and therefore retain Fastify's frozen 404 instead.
const LEGACY_METHOD_HANDLER_IDS = new Set<ImplementedSdkV1HttpOperationId>([
  "getNodeTypeInventory",
  "getCapabilities",
  "preflightWorkflow",
  "listWorkflowSummaries",
  "getWorkflowInterfaces",
  "getWorkflowInterface"
]);

type SdkV1FastifyHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

function fastifyPath(path: string, prefix = ""): string {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return `${normalizedPrefix}${path}`.replaceAll(/\{([^}]+)\}/g, ":$1");
}

function createSdkV1RouteHandlers(
  apiOptions: HttpApiOptions
): Readonly<Record<ImplementedSdkV1HttpOperationId, SdkV1FastifyHandler>> {
  return {
    getNodeTypeInventory: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkNodeTypeInventory(webRequest, apiOptions)
      );
    },
    getCapabilities: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkCapabilities(webRequest, apiOptions)
      );
    },
    listModels: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkModelCatalog(webRequest, apiOptions)
      );
    },
    listModelDownloads: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkModelDownloads(webRequest, apiOptions)
      );
    },
    startModelDownload: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkModelDownloadStart(webRequest, apiOptions)
      );
    },
    cancelModelDownload: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkModelDownloadCancel(webRequest, apiOptions)
      );
    },
    preflightWorkflow: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkPreflight(webRequest, apiOptions)
      );
    },
    listWorkflowSummaries: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkWorkflowSummaries(webRequest, apiOptions)
      );
    },
    getWorkflowInterfaces: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleWorkflowInterfaces(webRequest, apiOptions)
      );
    },
    getWorkflowInterface: async (request, reply) => {
      const { id } = request.params as { readonly id: string };
      await bridge(request, reply, (webRequest) =>
        handleWorkflowInterface(webRequest, id, apiOptions)
      );
    },
    uploadTemporaryAsset: async (request, reply) => {
      await bridge(request, reply, (webRequest) =>
        handleSdkV1TemporaryAssetUpload(webRequest, {
          boundary: resolveSdkV1Boundary(apiOptions)
        })
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
  const operationsByPath = new Map<
    string,
    typeof implementedSdkV1HttpOperations[number][]
  >();
  for (const operation of implementedSdkV1HttpOperations) {
    app.route({
      method: operation.method,
      url: fastifyPath(operation.path, options.routePrefix),
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
    const pathOperations = operationsByPath.get(operation.path) ?? [];
    pathOperations.push(operation);
    operationsByPath.set(operation.path, pathOperations);
  }

  for (const [path, pathOperations] of operationsByPath) {
    if (
      !pathOperations.some((operation) =>
        LEGACY_METHOD_HANDLER_IDS.has(operation.id)
      )
    ) {
      continue;
    }
    const declaredMethods = new Set<HTTPMethods>(
      pathOperations.map((operation) => operation.method)
    );
    const fallbackMethods = SDK_V1_ROUTABLE_METHODS.filter(
      (method) => !declaredMethods.has(method)
    );
    if (fallbackMethods.length === 0) continue;
    const fallbackOperation = pathOperations[0]!;
    app.route({
      method: fallbackMethods,
      url: fastifyPath(path, options.routePrefix),
      exposeHeadRoute: false,
      config: { sdkV1MethodFallback: true },
      handler: handlers[fallbackOperation.id]
    });
  }
};

export default sdkV1Routes;
