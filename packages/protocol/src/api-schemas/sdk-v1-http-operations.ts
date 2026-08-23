/**
 * Declared public SDK v1 HTTP operations. One entry per operation currently
 * published in `schema/sdk-v1.openapi.json`; the generator derives the OpenAPI
 * `paths` table from these declarations, so every string here is contract
 * surface.
 */
import type {
  SdkV1HttpOperationDeclaration,
  SdkV1HttpOperationId
} from "./sdk-v1-operations.js";
import {
  sdkNodeTypeInventoryInput,
  sdkNodeTypeInventoryOutput
} from "./nodes.js";
import {
  sdkV1ModelCatalog,
  sdkV1ModelCatalogQuery,
  sdkV1ModelDownloadCancelRequest,
  sdkV1ModelDownloadQuery,
  sdkV1ModelDownloadSnapshot,
  sdkV1ModelDownloadStartRequest,
  sdkV1ModelDownloadState
} from "./sdk-models-v1.js";
import {
  sdkWorkflowSummariesInput,
  sdkWorkflowSummariesOutput,
  workflowInterfacesInput,
  workflowInterfacesOutput,
  workflowInterfaceV1
} from "./workflows.js";
import {
  sdkV1Capabilities,
  sdkV1PreflightRequest,
  sdkV1PreflightSummary,
  sdkV1TemporaryAssetUpload
} from "./sdk-lifecycle-v1.js";

const queryProperty = { kind: "query-property" } as const;

const opaquePathId = {
  kind: "inline",
  jsonSchema: { minLength: 1, type: "string" }
} as const;

export const sdkV1HttpOperations = [
  {
    id: "getNodeTypeInventory",
    transport: "http",
    method: "GET",
    path: "/api/sdk/v1/node-types",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    summary: "List node types used by the loaded registry",
    request: {
      query: {
        profile: "discovery",
        name: "NodeTypeInventoryInput",
        schema: sdkNodeTypeInventoryInput
      },
      parameters: [
        { name: "cursor", in: "query", required: false, schema: queryProperty },
        { name: "limit", in: "query", required: false, schema: queryProperty }
      ]
    },
    response: {
      status: "200",
      description: "Bounded hybrid node-type inventory",
      contentType: "application/json",
      schema: {
        profile: "discovery",
        name: "NodeTypeInventoryOutput",
        schema: sdkNodeTypeInventoryOutput
      }
    },
    errors: [
      { status: "400", description: "Invalid cursor or limit" },
      { status: "503", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "getCapabilities",
    transport: "http",
    method: "GET",
    path: "/api/sdk/v1/capabilities",
    status: "implemented",
    auth: "discovery",
    feature: "lifecycle",
    summary: "Get public SDK capabilities",
    request: {},
    response: {
      status: "200",
      description: "Server capabilities and advertised limits",
      contentType: "application/json",
      schema: {
        profile: "lifecycle",
        name: "Capabilities",
        schema: sdkV1Capabilities
      }
    },
    errors: [{ status: "503", description: "Capabilities are unavailable" }]
  },
  {
    id: "listModels",
    transport: "http",
    method: "GET",
    path: "/api/sdk/v1/models",
    status: "implemented",
    auth: "discovery",
    feature: null,
    summary: "List execution-compatible models",
    request: {
      query: {
        profile: "discovery",
        name: "ModelCatalogQuery",
        schema: sdkV1ModelCatalogQuery
      },
      parameters: [
        {
          name: "compatibility",
          in: "query",
          required: false,
          schema: queryProperty
        },
        {
          name: "availability",
          in: "query",
          required: false,
          schema: queryProperty
        },
        {
          name: "provider",
          in: "query",
          required: false,
          schema: queryProperty
        },
        { name: "scope", in: "query", required: false, schema: queryProperty },
        { name: "cursor", in: "query", required: false, schema: queryProperty },
        { name: "limit", in: "query", required: false, schema: queryProperty }
      ]
    },
    response: {
      status: "200",
      description: "A bounded page of models visible to this SDK principal",
      contentType: "application/json",
      schema: {
        profile: "discovery",
        name: "ModelCatalog",
        schema: sdkV1ModelCatalog
      }
    },
    errors: [
      { status: "400", description: "Invalid catalog query" },
      {
        status: "501",
        description: "Requested execution scope is not available"
      },
      { status: "503", description: "Model catalog is unavailable" }
    ]
  },
  {
    id: "listModelDownloads",
    transport: "http",
    method: "GET",
    path: "/api/sdk/v1/model-downloads",
    status: "implemented",
    auth: "authenticated",
    feature: null,
    summary: "List model downloads",
    request: {
      query: {
        profile: "lifecycle",
        name: "ModelDownloadQuery",
        schema: sdkV1ModelDownloadQuery
      },
      parameters: [
        { name: "scope", in: "query", required: false, schema: queryProperty },
        {
          name: "operation_id",
          in: "query",
          required: false,
          schema: queryProperty
        }
      ]
    },
    response: {
      status: "200",
      description: "Current reconnectable model download states",
      contentType: "application/json",
      schema: {
        profile: "lifecycle",
        name: "ModelDownloadSnapshot",
        schema: sdkV1ModelDownloadSnapshot
      }
    },
    errors: [
      { status: "400", description: "Invalid download query" },
      {
        status: "501",
        description: "Requested execution scope is not available"
      }
    ]
  },
  {
    id: "startModelDownload",
    transport: "http",
    method: "POST",
    path: "/api/sdk/v1/model-downloads",
    status: "implemented",
    auth: "authenticated",
    feature: null,
    summary: "Start or retry a model download",
    request: {
      body: {
        kind: "json",
        required: true,
        schema: {
          profile: "lifecycle",
          name: "ModelDownloadStartRequest",
          schema: sdkV1ModelDownloadStartRequest
        }
      }
    },
    response: {
      status: "202",
      description: "Accepted download state",
      contentType: "application/json",
      schema: {
        profile: "lifecycle",
        name: "ModelDownloadState",
        schema: sdkV1ModelDownloadState
      }
    },
    errors: [
      { status: "400", description: "Invalid download request" },
      {
        status: "501",
        description: "Requested model download is not available"
      }
    ]
  },
  {
    id: "cancelModelDownload",
    transport: "http",
    method: "POST",
    path: "/api/sdk/v1/model-downloads/cancel",
    status: "implemented",
    auth: "authenticated",
    feature: null,
    summary: "Cancel a model download",
    request: {
      body: {
        kind: "json",
        required: true,
        schema: {
          profile: "lifecycle",
          name: "ModelDownloadCancelRequest",
          schema: sdkV1ModelDownloadCancelRequest
        }
      }
    },
    response: {
      status: "200",
      description: "Current terminal download state",
      contentType: "application/json",
      schema: {
        profile: "lifecycle",
        name: "ModelDownloadState",
        schema: sdkV1ModelDownloadState
      }
    },
    errors: [
      { status: "400", description: "Invalid cancellation request" },
      { status: "404", description: "Download operation was not found" }
    ]
  },
  {
    id: "preflightWorkflow",
    transport: "http",
    method: "POST",
    path: "/api/sdk/v1/preflight",
    status: "implemented",
    auth: "authenticated",
    feature: "lifecycle",
    summary: "Preflight a workflow without starting paid work",
    request: {
      body: {
        kind: "json",
        required: true,
        schema: {
          profile: "lifecycle",
          name: "PreflightRequest",
          schema: sdkV1PreflightRequest
        }
      }
    },
    response: {
      status: "200",
      description: "Side-effect-free workflow preflight",
      contentType: "application/json",
      schema: {
        profile: "lifecycle",
        name: "PreflightSummary",
        schema: sdkV1PreflightSummary
      }
    },
    errors: [
      { status: "400", description: "Invalid preflight request" },
      { status: "404", description: "Workflow not found or inaccessible" },
      { status: "503", description: "Requested preflight level is unavailable" }
    ]
  },
  {
    id: "listWorkflowSummaries",
    transport: "http",
    method: "GET",
    path: "/api/sdk/v1/workflows",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    summary: "List compact workflow summaries",
    request: {
      query: {
        profile: "discovery",
        name: "WorkflowSummariesInput",
        schema: sdkWorkflowSummariesInput
      },
      parameters: [
        { name: "limit", in: "query", required: false, schema: queryProperty },
        { name: "cursor", in: "query", required: false, schema: queryProperty }
      ]
    },
    response: {
      status: "200",
      description: "Compact workflow summaries",
      contentType: "application/json",
      schema: {
        profile: "discovery",
        name: "WorkflowSummariesOutput",
        schema: sdkWorkflowSummariesOutput
      }
    },
    errors: [
      { status: "400", description: "Invalid cursor or limit" },
      { status: "503", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "getWorkflowInterfaces",
    transport: "http",
    method: "POST",
    path: "/api/sdk/v1/workflow-interfaces",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    summary: "Get up to 100 workflow interfaces",
    request: {
      body: {
        kind: "json",
        required: true,
        schema: {
          profile: "discovery",
          name: "WorkflowInterfacesInput",
          schema: workflowInterfacesInput
        }
      }
    },
    response: {
      status: "200",
      description: "Ordered accessible interfaces and isolated errors",
      contentType: "application/json",
      schema: {
        profile: "discovery",
        name: "WorkflowInterfacesOutput",
        schema: workflowInterfacesOutput
      }
    },
    errors: [
      { status: "400", description: "Invalid request" },
      { status: "503", description: "SDK discovery is disabled" }
    ]
  },
  {
    // Public SDK v1 operation on a compatible URL outside the /api/sdk prefix.
    id: "getWorkflowInterface",
    transport: "http",
    method: "GET",
    path: "/api/sdk/v1/workflows/{id}/interface",
    status: "implemented",
    auth: "discovery",
    feature: "workflow-interface",
    summary: "Get one graph-derived workflow interface",
    request: {
      parameters: [
        { name: "id", in: "path", required: true, schema: opaquePathId },
        {
          name: "version",
          in: "query",
          required: true,
          schema: {
            kind: "inline",
            jsonSchema: { const: 1, type: "integer" }
          }
        }
      ]
    },
    response: {
      status: "200",
      description: "Graph-derived workflow interface",
      contentType: "application/json",
      schema: {
        profile: "discovery",
        name: "WorkflowInterface",
        schema: workflowInterfaceV1
      }
    },
    errors: [
      { status: "400", description: "Unsupported interface version" },
      { status: "404", description: "Workflow not found or not accessible" },
      { status: "422", description: "Workflow graph is invalid" },
      { status: "503", description: "SDK discovery is disabled" }
    ]
  },
  {
    id: "uploadTemporaryAsset",
    transport: "http",
    method: "POST",
    path: "/api/sdk/v1/assets/temporary",
    status: "implemented",
    auth: "authenticated",
    feature: "lifecycle",
    summary: "Upload one transient workflow input without asset autosave",
    request: {
      body: { kind: "binary-multipart", required: true, field: "file" }
    },
    response: {
      status: "200",
      description: "Temporary storage URI without persistent asset metadata",
      contentType: "application/json",
      schema: {
        profile: "lifecycle",
        name: "TemporaryAssetUpload",
        schema: sdkV1TemporaryAssetUpload
      }
    },
    errors: [
      { status: "400", description: "Invalid multipart upload" },
      { status: "413", description: "Upload exceeds the configured limit" },
      { status: "503", description: "SDK lifecycle is unavailable" }
    ]
  }
] as const satisfies readonly SdkV1HttpOperationDeclaration[];

export type ImplementedSdkV1HttpOperation = Extract<
  (typeof sdkV1HttpOperations)[number],
  { readonly status: "implemented" }
>;
export type ImplementedSdkV1HttpOperationId =
  ImplementedSdkV1HttpOperation["id"];

export const implementedSdkV1HttpOperations = sdkV1HttpOperations.filter(
  (operation): operation is ImplementedSdkV1HttpOperation =>
    operation.status === "implemented"
);

export function getSdkV1HttpOperation(
  id: SdkV1HttpOperationId
): SdkV1HttpOperationDeclaration | undefined {
  return sdkV1HttpOperations.find((operation) => operation.id === id);
}

export type SdkV1HttpOperationMatch = {
  readonly operation: SdkV1HttpOperationDeclaration;
  readonly params: Readonly<Record<string, string>>;
};

/**
 * Match a concrete request path against the declared operations, binding
 * `{param}` path segments. Exact paths win over parameterized ones.
 */
export function matchSdkV1HttpOperation(
  method: string,
  pathname: string
): SdkV1HttpOperationMatch | undefined {
  const wanted = method.toUpperCase();
  const candidates = sdkV1HttpOperations.filter(
    (operation) => operation.method === wanted
  );

  const exact = candidates.find((operation) => operation.path === pathname);
  if (exact) {
    return { operation: exact, params: {} };
  }

  const segments = pathname.split("/");
  for (const operation of candidates) {
    if (!operation.path.includes("{")) {
      continue;
    }
    const parts = operation.path.split("/");
    if (parts.length !== segments.length) {
      continue;
    }
    const params: Record<string, string> = {};
    let matched = true;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const segment = segments[index];
      if (part.startsWith("{") && part.endsWith("}")) {
        if (segment.length === 0) {
          matched = false;
          break;
        }
        params[part.slice(1, -1)] = decodeURIComponent(segment);
      } else if (part !== segment) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { operation, params };
    }
  }
  return undefined;
}
