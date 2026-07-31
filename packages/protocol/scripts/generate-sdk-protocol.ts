import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  sdkNodeTypeInventoryInput,
  sdkNodeTypeInventoryOutput
} from "../src/api-schemas/nodes.js";
import {
  sdkV1ModelCatalog,
  sdkV1ModelCatalogEntry,
  sdkV1ModelCatalogQuery
} from "../src/api-schemas/sdk-models-v1.js";
import {
  sdkV1Error,
  sdkV1HttpError,
  sdkV1RpcError,
  sdkV1RpcRequest,
  sdkV1RpcResponse
} from "../src/api-schemas/sdk-v1.js";
import {
  sdkWorkflowSummariesInput,
  sdkWorkflowSummariesOutput,
  workflowInterfaceInput,
  workflowInterfacesInput,
  workflowInterfaceV1,
  workflowInterfacesOutput
} from "../src/api-schemas/workflows.js";
import {
  sdkV1AssetReference,
  sdkV1CancelJobResponse,
  sdkV1Capabilities,
  sdkV1CapabilitiesRequest,
  sdkV1CostActual,
  sdkV1CostSummary,
  sdkV1JobEvent,
  sdkV1JobRequest,
  sdkV1JobSnapshot,
  sdkV1JobStatus,
  sdkV1LifecycleRpcRequest,
  sdkV1LifecycleRpcResponse,
  sdkV1PreflightRequest,
  sdkV1PreflightSummary,
  sdkV1Requirement,
  sdkV1ResultManifest,
  sdkV1SubmitJobRequest,
  sdkV1SubmitJobResponse,
  sdkV1SubscribeJobRequest,
  sdkV1SubscribeJobResponse,
  sdkV1TemporaryAssetUpload,
  sdkV1TerminalJobStatus,
  sdkV1ValidationIssue
} from "../src/api-schemas/sdk-lifecycle-v1.js";

const PROTOCOL_VERSION = "1";
const SCHEMA_FILE = "sdk-v1.discovery.schema.json";
const LIFECYCLE_SCHEMA_FILE = "sdk-v1.lifecycle.schema.json";
const OPENAPI_FILE = "sdk-v1.openapi.json";
const ASYNCAPI_FILE = "sdk-v1.asyncapi.json";
const MANIFEST_FILE = "sdk-v1.manifest.json";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortJson(child)])
    );
  }
  return value;
}

function serialize(value: JsonValue): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function allowAdditiveResponseFields(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(allowAdditiveResponseFields);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const result = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      allowAdditiveResponseFields(child)
    ])
  );
  if (result.type === "object" && result.additionalProperties === false) {
    result.additionalProperties = true;
  }
  return result;
}

function disallowUnknownRequestFields(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(disallowUnknownRequestFields);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const result = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      disallowUnknownRequestFields(child)
    ])
  );
  if (
    result.type === "object" &&
    result.properties !== undefined &&
    result.additionalProperties === undefined
  ) {
    result.additionalProperties = false;
  }
  return result;
}

function component(
  schema: z.ZodType,
  io: "input" | "output" = "output"
): JsonValue {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, {
    io,
    target: "draft-2020-12",
    unrepresentable: "any"
  });
  const result = jsonSchema as JsonValue;
  return io === "output"
    ? allowAdditiveResponseFields(result)
    : disallowUnknownRequestFields(result);
}

function schemaReference(name: string): JsonValue {
  return {
    $ref: `./${SCHEMA_FILE}#/$defs/${name}`
  };
}

function lifecycleSchemaReference(name: string): JsonValue {
  return {
    $ref: `./${LIFECYCLE_SCHEMA_FILE}#/$defs/${name}`
  };
}

function errorResponses(statuses: ReadonlyArray<[string, string]>): JsonValue {
  return Object.fromEntries(
    statuses.map(([status, description]) => [
      status,
      {
        content: {
          "application/json": {
            schema: schemaReference("HttpError")
          }
        },
        description
      }
    ])
  );
}

export function generateSdkProtocolArtifacts(): Record<string, string> {
  const schema = serialize({
    $defs: {
      Error: component(sdkV1Error),
      HttpError: component(sdkV1HttpError),
      ModelCatalog: component(sdkV1ModelCatalog),
      ModelCatalogEntry: component(sdkV1ModelCatalogEntry),
      ModelCatalogQuery: component(sdkV1ModelCatalogQuery, "input"),
      NodeTypeInventoryInput: component(sdkNodeTypeInventoryInput, "input"),
      NodeTypeInventoryOutput: component(sdkNodeTypeInventoryOutput),
      RpcError: component(sdkV1RpcError),
      RpcRequest: component(sdkV1RpcRequest, "input"),
      RpcResponse: component(sdkV1RpcResponse),
      WorkflowInterface: component(workflowInterfaceV1),
      WorkflowInterfaceInput: component(workflowInterfaceInput, "input"),
      WorkflowInterfacesInput: component(workflowInterfacesInput, "input"),
      WorkflowInterfacesOutput: component(workflowInterfacesOutput),
      WorkflowSummariesInput: component(sdkWorkflowSummariesInput, "input"),
      WorkflowSummariesOutput: component(sdkWorkflowSummariesOutput)
    },
    $id: "https://nodetool.ai/schemas/sdk/v1/discovery.schema.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    description:
      "Public NodeTool SDK v1 discovery and correlated read-only RPC components.",
    title: "NodeTool SDK v1 discovery profile"
  });

  const lifecycleSchema = serialize({
    $defs: {
      AssetReference: component(sdkV1AssetReference),
      CancelJobResponse: component(sdkV1CancelJobResponse),
      Capabilities: component(sdkV1Capabilities),
      CapabilitiesRequest: component(sdkV1CapabilitiesRequest, "input"),
      CostActual: component(sdkV1CostActual),
      CostSummary: component(sdkV1CostSummary),
      JobEvent: component(sdkV1JobEvent),
      JobRequest: component(sdkV1JobRequest, "input"),
      JobSnapshot: component(sdkV1JobSnapshot),
      JobStatus: component(sdkV1JobStatus),
      LifecycleRpcRequest: component(sdkV1LifecycleRpcRequest, "input"),
      LifecycleRpcResponse: component(sdkV1LifecycleRpcResponse),
      PreflightRequest: component(sdkV1PreflightRequest, "input"),
      PreflightSummary: component(sdkV1PreflightSummary),
      Requirement: component(sdkV1Requirement),
      ResultManifest: component(sdkV1ResultManifest),
      SubmitJobRequest: component(sdkV1SubmitJobRequest, "input"),
      SubmitJobResponse: component(sdkV1SubmitJobResponse),
      SubscribeJobRequest: component(sdkV1SubscribeJobRequest, "input"),
      SubscribeJobResponse: component(sdkV1SubscribeJobResponse),
      TemporaryAssetUpload: component(sdkV1TemporaryAssetUpload),
      TerminalJobStatus: component(sdkV1TerminalJobStatus),
      ValidationIssue: component(sdkV1ValidationIssue)
    },
    $id: "https://nodetool.ai/schemas/sdk/v1/lifecycle.schema.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    description:
      "Draft public NodeTool SDK v1 capabilities, preflight, jobs, events, results, and asset-reference components.",
    title: "NodeTool SDK v1 lifecycle profiles"
  });

  const openApi = serialize({
    components: {
      securitySchemes: {
        bearerAuth: {
          bearerFormat: "JWT",
          description:
            "Required for remote multi-user discovery when NODETOOL_REQUIRE_SDK_AUTH_V1=1. Trusted local connections may omit it.",
          scheme: "bearer",
          type: "http"
        }
      }
    },
    info: {
      description:
        "Draft HTTP contract for the feature-flagged NodeTool SDK v1 discovery profile.",
      title: "NodeTool SDK discovery API",
      version: PROTOCOL_VERSION
    },
    openapi: "3.1.0",
    paths: {
      "/api/sdk/v1/capabilities": {
        get: {
          operationId: "getCapabilities",
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: lifecycleSchemaReference("Capabilities")
                }
              },
              description: "Server capabilities and advertised limits"
            },
            ...errorResponses([["503", "Capabilities are unavailable"]])
          },
          summary: "Get public SDK capabilities"
        }
      },
      "/api/sdk/v1/models": {
        get: {
          operationId: "listModels",
          parameters: [
            "compatibility",
            "availability",
            "provider",
            "scope",
            "cursor",
            "limit"
          ].map((name) => ({
            in: "query",
            name,
            required: false,
            schema: {
              $ref: `./${SCHEMA_FILE}#/$defs/ModelCatalogQuery/properties/${name}`
            }
          })),
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: schemaReference("ModelCatalog")
                }
              },
              description: "A bounded page of models visible to this SDK principal"
            },
            ...errorResponses([
              ["400", "Invalid catalog query"],
              ["501", "Requested execution scope is not available"],
              ["503", "Model catalog is unavailable"]
            ])
          },
          summary: "List execution-compatible models"
        }
      },
      "/api/sdk/v1/assets/temporary": {
        post: {
          operationId: "uploadTemporaryAsset",
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  additionalProperties: false,
                  properties: {
                    file: {
                      contentMediaType: "application/octet-stream",
                      format: "binary",
                      type: "string"
                    }
                  },
                  required: ["file"],
                  type: "object"
                }
              }
            },
            required: true
          },
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: lifecycleSchemaReference("TemporaryAssetUpload")
                }
              },
              description:
                "Temporary storage URI without persistent asset metadata"
            },
            ...errorResponses([
              ["400", "Invalid multipart upload"],
              ["413", "Upload exceeds the configured limit"],
              ["503", "SDK lifecycle is unavailable"]
            ])
          },
          summary: "Upload one transient workflow input without asset autosave"
        }
      },
      "/api/sdk/v1/jobs": {
        post: {
          operationId: "submitJob",
          requestBody: {
            content: {
              "application/json": {
                schema: lifecycleSchemaReference("SubmitJobRequest")
              }
            },
            required: true
          },
          responses: {
            "202": {
              content: {
                "application/json": {
                  schema: lifecycleSchemaReference("SubmitJobResponse")
                }
              },
              description: "Persisted job acknowledgement"
            },
            ...errorResponses([
              ["400", "Invalid submission"],
              ["409", "Idempotency or workflow revision conflict"],
              ["422", "Preflight failed"],
              ["429", "Admission or rate limit exceeded"],
              ["503", "Execution is unavailable"]
            ])
          },
          summary: "Submit one idempotent workflow job",
          "x-nodetool-implementation": "planned"
        }
      },
      "/api/sdk/v1/jobs/{job_id}": {
        get: {
          operationId: "getJobSnapshot",
          parameters: [
            {
              in: "path",
              name: "job_id",
              required: true,
              schema: { minLength: 1, type: "string" }
            }
          ],
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: lifecycleSchemaReference("JobSnapshot")
                }
              },
              description: "Authoritative job snapshot"
            },
            ...errorResponses([
              ["404", "Job not found, inaccessible, or expired"]
            ])
          },
          summary: "Get an authoritative job snapshot",
          "x-nodetool-implementation": "planned"
        }
      },
      "/api/sdk/v1/jobs/{job_id}/cancel": {
        post: {
          operationId: "cancelJob",
          parameters: [
            {
              in: "path",
              name: "job_id",
              required: true,
              schema: { minLength: 1, type: "string" }
            }
          ],
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: lifecycleSchemaReference("CancelJobResponse")
                }
              },
              description:
                "Cancellation acknowledgement or existing terminal state"
            },
            ...errorResponses([
              ["404", "Job not found, inaccessible, or expired"]
            ])
          },
          summary: "Request idempotent job cancellation",
          "x-nodetool-implementation": "planned"
        }
      },
      "/api/sdk/v1/node-types": {
        get: {
          operationId: "getNodeTypeInventory",
          parameters: [
            {
              in: "query",
              name: "cursor",
              required: false,
              schema: schemaReference(
                "NodeTypeInventoryInput/properties/cursor"
              )
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: schemaReference("NodeTypeInventoryInput/properties/limit")
            }
          ],
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: schemaReference("NodeTypeInventoryOutput")
                }
              },
              description: "Bounded hybrid node-type inventory"
            },
            ...errorResponses([
              ["400", "Invalid cursor or limit"],
              ["503", "SDK discovery is disabled"]
            ])
          },
          summary: "List node types used by the loaded registry"
        }
      },
      "/api/sdk/v1/workflow-interfaces": {
        post: {
          operationId: "getWorkflowInterfaces",
          requestBody: {
            content: {
              "application/json": {
                schema: schemaReference("WorkflowInterfacesInput")
              }
            },
            required: true
          },
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: schemaReference("WorkflowInterfacesOutput")
                }
              },
              description: "Ordered accessible interfaces and isolated errors"
            },
            ...errorResponses([
              ["400", "Invalid request"],
              ["503", "SDK discovery is disabled"]
            ])
          },
          summary: "Get up to 100 workflow interfaces"
        }
      },
      "/api/sdk/v1/preflight": {
        post: {
          operationId: "preflightWorkflow",
          requestBody: {
            content: {
              "application/json": {
                schema: lifecycleSchemaReference("PreflightRequest")
              }
            },
            required: true
          },
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: lifecycleSchemaReference("PreflightSummary")
                }
              },
              description: "Side-effect-free workflow preflight"
            },
            ...errorResponses([
              ["400", "Invalid preflight request"],
              ["404", "Workflow not found or inaccessible"],
              ["503", "Requested preflight level is unavailable"]
            ])
          },
          summary: "Preflight a workflow without starting paid work"
        }
      },
      "/api/sdk/v1/workflows": {
        get: {
          operationId: "listWorkflowSummaries",
          parameters: [
            {
              in: "query",
              name: "limit",
              required: false,
              schema: schemaReference("WorkflowSummariesInput/properties/limit")
            },
            {
              in: "query",
              name: "cursor",
              required: false,
              schema: schemaReference(
                "WorkflowSummariesInput/properties/cursor"
              )
            }
          ],
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: schemaReference("WorkflowSummariesOutput")
                }
              },
              description: "Compact workflow summaries"
            },
            ...errorResponses([
              ["400", "Invalid cursor or limit"],
              ["503", "SDK discovery is disabled"]
            ])
          },
          summary: "List compact workflow summaries"
        }
      },
      "/api/workflows/{id}/interface": {
        get: {
          operationId: "getWorkflowInterface",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { minLength: 1, type: "string" }
            },
            {
              in: "query",
              name: "version",
              required: true,
              schema: { const: 1, type: "integer" }
            }
          ],
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: schemaReference("WorkflowInterface")
                }
              },
              description: "Graph-derived workflow interface"
            },
            ...errorResponses([
              ["400", "Unsupported interface version"],
              ["404", "Workflow not found or not accessible"],
              ["422", "Workflow graph is invalid"],
              ["503", "SDK discovery is disabled"]
            ])
          },
          summary: "Get one graph-derived workflow interface"
        }
      }
    },
    security: [{ bearerAuth: [] }, {}],
    servers: [
      {
        description: "Local NodeTool server",
        url: "http://127.0.0.1:7777"
      }
    ],
    "x-nodetool-kill-switch": "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1",
    "x-nodetool-status": "draft"
  });

  const asyncApi = serialize({
    asyncapi: "3.0.0",
    channels: {
      sdkRpc: {
        address: "/ws",
        messages: {
          sdkRpcRequest: {
            contentType: "application/msgpack",
            description:
              "A correlated read-only SDK command. request_id must be non-empty.",
            name: "SdkRpcRequest",
            payload: schemaReference("RpcRequest")
          },
          sdkRpcResponse: {
            contentType: "application/msgpack",
            description:
              "Exactly one result or error response correlated by request_id.",
            name: "SdkRpcResponse",
            payload: schemaReference("RpcResponse")
          },
          lifecycleRpcRequest: {
            contentType: "application/msgpack",
            description:
              "Capabilities and preflight are implemented behind the lifecycle feature flag; later job lifecycle commands remain planned.",
            name: "LifecycleRpcRequest",
            payload: lifecycleSchemaReference("LifecycleRpcRequest"),
            "x-nodetool-implementation": "partial"
          },
          lifecycleRpcResponse: {
            contentType: "application/msgpack",
            description:
              "A correlated lifecycle response. Capabilities and preflight are implemented; later job lifecycle responses remain planned.",
            name: "LifecycleRpcResponse",
            payload: lifecycleSchemaReference("LifecycleRpcResponse"),
            "x-nodetool-implementation": "partial"
          },
          jobEvent: {
            contentType: "application/msgpack",
            description:
              "A planned ordered per-job event emitted after subscription.",
            name: "JobEvent",
            payload: lifecycleSchemaReference("JobEvent"),
            "x-nodetool-implementation": "planned"
          }
        }
      }
    },
    info: {
      description:
        "Draft MessagePack WebSocket contract for NodeTool SDK v1 discovery. JSON text remains diagnostic compatibility behavior.",
      title: "NodeTool SDK discovery WebSocket API",
      version: PROTOCOL_VERSION
    },
    operations: {
      receiveJobEvent: {
        action: "receive",
        channel: { $ref: "#/channels/sdkRpc" },
        messages: [{ $ref: "#/channels/sdkRpc/messages/jobEvent" }],
        "x-nodetool-implementation": "planned"
      },
      receiveLifecycleRpcResponse: {
        action: "receive",
        channel: { $ref: "#/channels/sdkRpc" },
        messages: [{ $ref: "#/channels/sdkRpc/messages/lifecycleRpcResponse" }],
        "x-nodetool-implementation": "partial"
      },
      receiveSdkRpcResponse: {
        action: "receive",
        channel: { $ref: "#/channels/sdkRpc" },
        messages: [{ $ref: "#/channels/sdkRpc/messages/sdkRpcResponse" }]
      },
      sendSdkRpcRequest: {
        action: "send",
        channel: { $ref: "#/channels/sdkRpc" },
        messages: [{ $ref: "#/channels/sdkRpc/messages/sdkRpcRequest" }]
      },
      sendLifecycleRpcRequest: {
        action: "send",
        channel: { $ref: "#/channels/sdkRpc" },
        messages: [{ $ref: "#/channels/sdkRpc/messages/lifecycleRpcRequest" }],
        "x-nodetool-implementation": "partial"
      }
    },
    servers: {
      local: {
        description:
          "Local trusted connections may omit credentials; remote deployments authenticate the WebSocket upgrade.",
        host: "127.0.0.1:7777",
        pathname: "/ws",
        protocol: "ws"
      }
    },
    "x-nodetool-default-encoding": "messagepack",
    "x-nodetool-status": "draft"
  });

  const contractArtifacts = {
    [ASYNCAPI_FILE]: {
      content: asyncApi,
      mediaType: "application/vnd.aai.asyncapi+json;version=3.0",
      profile: "discovery"
    },
    [OPENAPI_FILE]: {
      content: openApi,
      mediaType: "application/vnd.oai.openapi+json;version=3.1",
      profile: "discovery"
    },
    [LIFECYCLE_SCHEMA_FILE]: {
      content: lifecycleSchema,
      mediaType: "application/schema+json",
      profile: "lifecycle-draft"
    },
    [SCHEMA_FILE]: {
      content: schema,
      mediaType: "application/schema+json",
      profile: "discovery"
    }
  };
  const manifest = serialize({
    artifacts: Object.entries(contractArtifacts).map(([path, artifact]) => ({
      media_type: artifact.mediaType,
      path,
      profile: artifact.profile,
      sha256: createHash("sha256").update(artifact.content).digest("hex")
    })),
    default_websocket_encoding: "messagepack",
    generated_from: "@nodetool-ai/protocol",
    manifest_version: 1,
    optional_profiles: ["assets", "jobs", "agent", "offline-bundles"],
    protocol_version: PROTOCOL_VERSION,
    public_profiles: ["discovery", "model_catalog"],
    status: "draft"
  });

  return {
    [MANIFEST_FILE]: manifest,
    ...Object.fromEntries(
      Object.entries(contractArtifacts).map(([path, artifact]) => [
        path,
        artifact.content
      ])
    )
  };
}

function run(): void {
  const check = process.argv.includes("--check");
  const outputDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../schema"
  );
  const artifacts = generateSdkProtocolArtifacts();
  const stale: string[] = [];

  if (!check) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  for (const [name, content] of Object.entries(artifacts)) {
    const path = resolve(outputDirectory, name);
    if (check) {
      let current = "";
      try {
        current = readFileSync(path, "utf8");
      } catch {
        // A missing generated file is reported as stale below.
      }
      if (current !== content) {
        stale.push(name);
      }
    } else {
      writeFileSync(path, content, "utf8");
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `Generated SDK protocol artifacts are stale: ${stale.join(", ")}`
    );
  }
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  run();
}
