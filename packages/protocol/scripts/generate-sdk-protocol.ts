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
  sdkV1ModelCatalogQuery,
  sdkV1ModelDownloadCancelRequest,
  sdkV1ModelDownloadQuery,
  sdkV1ModelDownloadSnapshot,
  sdkV1ModelDownloadStartRequest,
  sdkV1ModelDownloadState
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
import {
  sdkV1CancelJobCommand,
  sdkV1Chunk,
  sdkV1EndInputStreamCommand,
  sdkV1ExecutionCommand,
  sdkV1ExecutionEvent,
  sdkV1ExecutionTarget,
  sdkV1JobResumed,
  sdkV1JobUpdate,
  sdkV1NodeProgress,
  sdkV1NodeUpdate,
  sdkV1OutputUpdate,
  sdkV1ProtocolRejection,
  sdkV1ReconnectJobCommand,
  sdkV1RunJobCommand,
  sdkV1StreamInputCommand,
  sdkV1UpdateNodePropertiesCommand
} from "../src/api-schemas/sdk-execution-v1.js";
import type {
  SdkV1HttpErrorDeclaration,
  SdkV1HttpOperationDeclaration,
  SdkV1HttpRequestBodyDeclaration,
  SdkV1SchemaRef,
  SdkV1WebSocketMessageEnvelope,
  SdkV1WebSocketMessageKey,
  SdkV1WebSocketOperationDeclaration
} from "../src/api-schemas/sdk-v1-operations.js";
import {
  implementedSdkV1HttpOperations,
  sdkV1HttpOperations,
  sdkV1WebSocketChannel,
  sdkV1WebSocketMessages,
  sdkV1WebSocketOperations,
  validateSdkV1OperationRegistry
} from "../src/api-schemas/sdk-v1-operations.js";

const PROTOCOL_VERSION = "1";
const SCHEMA_FILE = "sdk-v1.discovery.schema.json";
const LIFECYCLE_SCHEMA_FILE = "sdk-v1.lifecycle.schema.json";
const EXECUTION_SCHEMA_FILE = "sdk-v1.execution.schema.json";
const OPENAPI_FILE = "sdk-v1.openapi.json";
const OPENAPI_IMPLEMENTED_FILE = "sdk-v1.openapi.implemented.json";
const ASYNCAPI_FILE = "sdk-v1.asyncapi.json";
const ASYNCAPI_IMPLEMENTED_FILE = "sdk-v1.asyncapi.implemented.json";
const OPERATIONS_FILE = "sdk-v1.operations.json";
const MANIFEST_FILE = "sdk-v1.manifest.json";

const OPENAPI_MEDIA_TYPE = "application/vnd.oai.openapi+json;version=3.1";
const ASYNCAPI_MEDIA_TYPE = "application/vnd.aai.asyncapi+json;version=3.0";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

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

  const result: { [key: string]: JsonValue } = Object.fromEntries(
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

  const result: { [key: string]: JsonValue } = Object.fromEntries(
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

type ComponentEntry = {
  readonly schema: z.ZodType;
  readonly io: "input" | "output";
};

function inputComponent(schema: z.ZodType): ComponentEntry {
  return { schema, io: "input" };
}

function outputComponent(schema: z.ZodType): ComponentEntry {
  return { schema, io: "output" };
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function scopeComponentReferences(
  value: JsonValue,
  componentName: string
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => scopeComponentReferences(item, componentName));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (
        key === "$ref" &&
        typeof item === "string" &&
        item.startsWith("#/$defs/")
      ) {
        return [
          key,
          `#/$defs/${escapeJsonPointerSegment(componentName)}/$defs/` +
            item.slice("#/$defs/".length)
        ];
      }
      return [key, scopeComponentReferences(item, componentName)];
    })
  );
}

const discoveryComponents: Record<string, ComponentEntry> = {
  Error: outputComponent(sdkV1Error),
  HttpError: outputComponent(sdkV1HttpError),
  ModelCatalog: outputComponent(sdkV1ModelCatalog),
  ModelCatalogEntry: outputComponent(sdkV1ModelCatalogEntry),
  ModelCatalogQuery: inputComponent(sdkV1ModelCatalogQuery),
  NodeTypeInventoryInput: inputComponent(sdkNodeTypeInventoryInput),
  NodeTypeInventoryOutput: outputComponent(sdkNodeTypeInventoryOutput),
  RpcError: outputComponent(sdkV1RpcError),
  RpcRequest: inputComponent(sdkV1RpcRequest),
  RpcResponse: outputComponent(sdkV1RpcResponse),
  WorkflowInterface: outputComponent(workflowInterfaceV1),
  WorkflowInterfaceInput: inputComponent(workflowInterfaceInput),
  WorkflowInterfacesInput: inputComponent(workflowInterfacesInput),
  WorkflowInterfacesOutput: outputComponent(workflowInterfacesOutput),
  WorkflowSummariesInput: inputComponent(sdkWorkflowSummariesInput),
  WorkflowSummariesOutput: outputComponent(sdkWorkflowSummariesOutput)
};

const lifecycleComponents: Record<string, ComponentEntry> = {
  AssetReference: outputComponent(sdkV1AssetReference),
  CancelJobResponse: outputComponent(sdkV1CancelJobResponse),
  Capabilities: outputComponent(sdkV1Capabilities),
  CapabilitiesRequest: inputComponent(sdkV1CapabilitiesRequest),
  CostActual: outputComponent(sdkV1CostActual),
  CostSummary: outputComponent(sdkV1CostSummary),
  JobEvent: outputComponent(sdkV1JobEvent),
  JobRequest: inputComponent(sdkV1JobRequest),
  JobSnapshot: outputComponent(sdkV1JobSnapshot),
  JobStatus: outputComponent(sdkV1JobStatus),
  LifecycleRpcRequest: inputComponent(sdkV1LifecycleRpcRequest),
  LifecycleRpcResponse: outputComponent(sdkV1LifecycleRpcResponse),
  ModelDownloadCancelRequest: inputComponent(sdkV1ModelDownloadCancelRequest),
  ModelDownloadQuery: inputComponent(sdkV1ModelDownloadQuery),
  ModelDownloadSnapshot: outputComponent(sdkV1ModelDownloadSnapshot),
  ModelDownloadStartRequest: inputComponent(sdkV1ModelDownloadStartRequest),
  ModelDownloadState: outputComponent(sdkV1ModelDownloadState),
  PreflightRequest: inputComponent(sdkV1PreflightRequest),
  PreflightSummary: outputComponent(sdkV1PreflightSummary),
  Requirement: outputComponent(sdkV1Requirement),
  ResultManifest: outputComponent(sdkV1ResultManifest),
  SubmitJobRequest: inputComponent(sdkV1SubmitJobRequest),
  SubmitJobResponse: outputComponent(sdkV1SubmitJobResponse),
  SubscribeJobRequest: inputComponent(sdkV1SubscribeJobRequest),
  SubscribeJobResponse: outputComponent(sdkV1SubscribeJobResponse),
  TemporaryAssetUpload: outputComponent(sdkV1TemporaryAssetUpload),
  TerminalJobStatus: outputComponent(sdkV1TerminalJobStatus),
  ValidationIssue: outputComponent(sdkV1ValidationIssue)
};

const executionComponents: Record<string, ComponentEntry> = {
  CancelJobCommand: inputComponent(sdkV1CancelJobCommand),
  Chunk: outputComponent(sdkV1Chunk),
  EndInputStreamCommand: inputComponent(sdkV1EndInputStreamCommand),
  ExecutionCommand: inputComponent(sdkV1ExecutionCommand),
  ExecutionEvent: outputComponent(sdkV1ExecutionEvent),
  ExecutionTarget: outputComponent(sdkV1ExecutionTarget),
  JobResumed: outputComponent(sdkV1JobResumed),
  JobUpdate: outputComponent(sdkV1JobUpdate),
  NodeProgress: outputComponent(sdkV1NodeProgress),
  NodeUpdate: outputComponent(sdkV1NodeUpdate),
  OutputUpdate: outputComponent(sdkV1OutputUpdate),
  ProtocolRejection: outputComponent(sdkV1ProtocolRejection),
  ReconnectJobCommand: inputComponent(sdkV1ReconnectJobCommand),
  RunJobCommand: inputComponent(sdkV1RunJobCommand),
  StreamInputCommand: inputComponent(sdkV1StreamInputCommand),
  UpdateNodePropertiesCommand: inputComponent(sdkV1UpdateNodePropertiesCommand)
};

function buildDefs(
  components: Record<string, ComponentEntry>
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(components).map(([name, entry]) => [
      name,
      scopeComponentReferences(component(entry.schema, entry.io), name)
    ])
  );
}

const discoveryDefs = buildDefs(discoveryComponents);
const lifecycleDefs = buildDefs(lifecycleComponents);
const executionDefs = buildDefs(executionComponents);

function schemaFileFor(profile: SdkV1SchemaRef["profile"]): string {
  if (profile === "discovery") return SCHEMA_FILE;
  if (profile === "lifecycle") return LIFECYCLE_SCHEMA_FILE;
  return EXECUTION_SCHEMA_FILE;
}

function componentEntryFor(ref: SdkV1SchemaRef): ComponentEntry {
  const table =
    ref.profile === "discovery"
      ? discoveryComponents
      : ref.profile === "lifecycle"
        ? lifecycleComponents
        : executionComponents;
  const entry = table[ref.name];
  if (!entry) {
    throw new Error(
      `Operation registry references unknown ${ref.profile} component ${ref.name}`
    );
  }
  if (entry.schema !== ref.schema) {
    throw new Error(
      `Operation registry reference ${ref.profile}.${ref.name} does not use the generated component's Zod schema`
    );
  }
  return entry;
}

function refJson(ref: SdkV1SchemaRef): JsonValue {
  componentEntryFor(ref);
  return { $ref: `./${schemaFileFor(ref.profile)}#/$defs/${ref.name}` };
}

function refPointer(ref: SdkV1SchemaRef): string {
  componentEntryFor(ref);
  return `${schemaFileFor(ref.profile)}#/$defs/${ref.name}`;
}

function queryPropertyRef(query: SdkV1SchemaRef, property: string): JsonValue {
  componentEntryFor(query);
  const defs =
    query.profile === "discovery"
      ? discoveryDefs
      : query.profile === "lifecycle"
        ? lifecycleDefs
        : executionDefs;
  const definition = defs[query.name];
  const properties =
    definition !== null &&
    typeof definition === "object" &&
    !Array.isArray(definition)
      ? definition.properties
      : undefined;
  const hasProperty =
    properties !== undefined &&
    properties !== null &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.hasOwn(properties, property);
  if (!hasProperty) {
    throw new Error(
      `Component ${query.profile}.${query.name} declares no property ${property} for a query parameter`
    );
  }
  return {
    $ref: `./${schemaFileFor(query.profile)}#/$defs/${query.name}/properties/${property}`
  };
}

function errorResponses(
  errors: readonly SdkV1HttpErrorDeclaration[]
): JsonValue {
  return Object.fromEntries(
    errors.map((error) => [
      error.status,
      {
        content: {
          "application/json": {
            schema: refJson({
              profile: "discovery",
              name: "HttpError",
              schema: sdkV1HttpError
            })
          }
        },
        description: error.description
      }
    ])
  );
}

function requestBodyJson(body: SdkV1HttpRequestBodyDeclaration): JsonValue {
  const description =
    body.description === undefined ? {} : { description: body.description };
  if (body.kind === "json") {
    return {
      content: { "application/json": { schema: refJson(body.schema) } },
      required: body.required,
      ...description
    };
  }
  return {
    content: {
      "multipart/form-data": {
        schema: {
          additionalProperties: false,
          properties: {
            [body.field]: {
              contentMediaType: "application/octet-stream",
              format: "binary",
              type: "string"
            }
          },
          required: [body.field],
          type: "object"
        }
      }
    },
    required: body.required,
    ...description
  };
}

function httpOperationJson(
  operation: SdkV1HttpOperationDeclaration
): JsonValue {
  const parameters = operation.request.parameters?.map((parameter) => {
    let schema: JsonValue;
    if (parameter.schema.kind === "inline") {
      schema = parameter.schema.jsonSchema;
    } else {
      const query = operation.request.query;
      if (!query) {
        throw new Error(
          `Operation ${operation.id} declares query-property parameter ${parameter.name} without a query schema`
        );
      }
      schema = queryPropertyRef(query, parameter.name);
    }
    return {
      in: parameter.in,
      name: parameter.name,
      required: parameter.required,
      schema,
      ...(parameter.description === undefined
        ? {}
        : { description: parameter.description })
    };
  });

  return {
    operationId: operation.id,
    security:
      operation.auth === "authenticated"
        ? [{ bearerAuth: [] }]
        : [{ bearerAuth: [] }, {}],
    ...(parameters && parameters.length > 0 ? { parameters } : {}),
    ...(operation.request.body
      ? { requestBody: requestBodyJson(operation.request.body) }
      : {}),
    responses: {
      [operation.response.status]: {
        content: {
          [operation.response.contentType]: {
            schema: refJson(operation.response.schema)
          }
        },
        description: operation.response.description
      },
      ...errorResponses(operation.errors)
    },
    summary: operation.summary,
    ...(operation.status === "planned"
      ? { "x-nodetool-implementation": "planned" }
      : {})
  };
}

function buildOpenApiPaths(
  operations: readonly SdkV1HttpOperationDeclaration[]
): JsonValue {
  const paths: Record<string, Record<string, JsonValue>> = {};
  for (const operation of operations) {
    const pathItem = (paths[operation.path] ??= {});
    pathItem[operation.method.toLowerCase()] = httpOperationJson(operation);
  }
  return paths;
}

function openApiDocument(
  operations: readonly SdkV1HttpOperationDeclaration[]
): JsonValue {
  return {
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
        "HTTP contract for NodeTool SDK v1 discovery and lifecycle operations.",
      title: "NodeTool SDK HTTP API",
      version: PROTOCOL_VERSION
    },
    openapi: "3.1.0",
    paths: buildOpenApiPaths(operations),
    servers: [
      {
        description: "Local NodeTool server",
        url: "http://127.0.0.1:7777"
      }
    ],
    "x-nodetool-kill-switch": "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1",
    "x-nodetool-status": "draft"
  };
}

function operationEnvelopes(
  operation: SdkV1WebSocketOperationDeclaration
): readonly SdkV1WebSocketMessageKey[] {
  if (operation.direction === "request-response") {
    return [
      operation.message.request.envelope,
      operation.message.response.envelope
    ];
  }
  if (operation.direction === "client-command") {
    return [operation.message.request.envelope];
  }
  return [operation.message.event.envelope];
}

/** Marks generated envelopes whose declared operations are not all implemented. */
function envelopeMarker(
  key: SdkV1WebSocketMessageKey
): "planned" | "partial" | undefined {
  const statuses = sdkV1WebSocketOperations
    .filter((operation) => operationEnvelopes(operation).includes(key))
    .map((operation) => operation.status);
  if (statuses.length === 0) {
    throw new Error(
      `WebSocket envelope ${key} is not referenced by any declared operation`
    );
  }
  if (statuses.every((status) => status === "implemented")) {
    return undefined;
  }
  if (statuses.every((status) => status === "planned")) {
    return "planned";
  }
  return "partial";
}

function markerProps(marker: "planned" | "partial" | undefined): JsonValue {
  return marker === undefined ? {} : { "x-nodetool-implementation": marker };
}

function assertEnvelopeCoverage(): void {
  const envelopeKeys = new Set(
    sdkV1WebSocketMessages.map((message) => message.key)
  );
  for (const operation of sdkV1WebSocketOperations) {
    for (const key of operationEnvelopes(operation)) {
      if (!envelopeKeys.has(key)) {
        throw new Error(
          `Operation ${operation.id} references undeclared WebSocket envelope ${key}`
        );
      }
    }
  }
}

function asyncApiDocument(
  envelopes: readonly SdkV1WebSocketMessageEnvelope[]
): JsonValue {
  const channelRef = `#/channels/${sdkV1WebSocketChannel.key}`;
  const messages = Object.fromEntries(
    envelopes.map((envelope) => [
      envelope.key,
      {
        contentType: envelope.contentType,
        description: envelope.description,
        name: envelope.name,
        payload: refJson(envelope.payload),
        ...markerProps(envelopeMarker(envelope.key))
      }
    ])
  );
  const operations = Object.fromEntries(
    envelopes.map((envelope) => [
      envelope.operationKey,
      {
        action: envelope.action,
        channel: { $ref: channelRef },
        messages: [{ $ref: `${channelRef}/messages/${envelope.key}` }],
        ...markerProps(envelopeMarker(envelope.key))
      }
    ])
  );
  return {
    asyncapi: "3.0.0",
    channels: {
      [sdkV1WebSocketChannel.key]: {
        address: sdkV1WebSocketChannel.address,
        messages
      }
    },
    info: {
      description:
        "MessagePack WebSocket contract for NodeTool SDK v1 RPC and workflow execution. JSON text remains diagnostic compatibility behavior.",
      title: "NodeTool SDK WebSocket API",
      version: PROTOCOL_VERSION
    },
    operations,
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
  };
}

function httpOperationManifest(
  operation: SdkV1HttpOperationDeclaration
): JsonValue {
  const body = operation.request.body;
  return {
    auth: operation.auth,
    errors: operation.errors.map((error) => ({
      description: error.description,
      status: error.status
    })),
    feature: operation.feature,
    id: operation.id,
    method: operation.method,
    path: operation.path,
    request: {
      ...(operation.request.query
        ? { query: refPointer(operation.request.query) }
        : {}),
      ...(body
        ? {
            body:
              body.kind === "json"
                ? {
                    content_type: "application/json",
                    ...(body.description === undefined
                      ? {}
                      : { description: body.description }),
                    kind: body.kind,
                    required: body.required,
                    schema: refPointer(body.schema)
                  }
                : {
                    binary: true,
                    content_type: "multipart/form-data",
                    ...(body.description === undefined
                      ? {}
                      : { description: body.description }),
                    field: body.field,
                    kind: body.kind,
                    required: body.required
                  }
          }
        : {}),
      ...(operation.request.parameters
        ? {
            parameters: operation.request.parameters.map((parameter) => ({
              ...(parameter.description === undefined
                ? {}
                : { description: parameter.description }),
              in: parameter.in,
              name: parameter.name,
              required: parameter.required,
              schema:
                parameter.schema.kind === "query-property"
                  ? { kind: parameter.schema.kind }
                  : {
                      json_schema: parameter.schema.jsonSchema,
                      kind: parameter.schema.kind
                    }
            }))
          }
        : {})
    },
    response: {
      content_type: operation.response.contentType,
      schema: refPointer(operation.response.schema),
      status: operation.response.status
    },
    status: operation.status,
    transport: "http"
  };
}

function webSocketOperationManifest(
  operation: SdkV1WebSocketOperationDeclaration
): JsonValue {
  return {
    auth: operation.auth,
    channel: operation.channel,
    ...(operation.direction !== "server-event"
      ? { command: operation.command }
      : {}),
    direction: operation.direction,
    errors: operation.errors.map((error) => ({
      code: error.code,
      description: error.description
    })),
    feature: operation.feature,
    id: operation.id,
    message:
      operation.direction === "request-response"
        ? {
            request: {
              envelope: operation.message.request.envelope,
              payload: refPointer(operation.message.request.payload)
            },
            response: {
              envelope: operation.message.response.envelope,
              payload: refPointer(operation.message.response.payload)
            }
          }
        : operation.direction === "client-command"
          ? {
              request: {
                envelope: operation.message.request.envelope,
                payload: refPointer(operation.message.request.payload)
              }
            }
          : {
            event: {
              envelope: operation.message.event.envelope,
              payload: refPointer(operation.message.event.payload)
            }
          },
    status: operation.status,
    transport: "websocket"
  };
}

export function generateSdkProtocolArtifacts(): Record<string, string> {
  validateSdkV1OperationRegistry();
  assertEnvelopeCoverage();

  const schema = serialize({
    $defs: discoveryDefs,
    $id: "https://nodetool.ai/schemas/sdk/v1/discovery.schema.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    description:
      "Public NodeTool SDK v1 discovery and correlated read-only RPC components.",
    title: "NodeTool SDK v1 discovery profile"
  });

  const lifecycleSchema = serialize({
    $defs: lifecycleDefs,
    $id: "https://nodetool.ai/schemas/sdk/v1/lifecycle.schema.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    description:
      "Draft public NodeTool SDK v1 capabilities, preflight, jobs, events, results, and asset-reference components.",
    title: "NodeTool SDK v1 lifecycle profiles"
  });

  const executionSchema = serialize({
    $defs: executionDefs,
    $id: "https://nodetool.ai/schemas/sdk/v1/execution.schema.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    description:
      "Public NodeTool SDK v1 MessagePack workflow-execution components.",
    title: "NodeTool SDK v1 execution profile"
  });

  const openApi = serialize(openApiDocument(sdkV1HttpOperations));
  const openApiImplemented = serialize(
    openApiDocument(implementedSdkV1HttpOperations)
  );

  const asyncApi = serialize(asyncApiDocument(sdkV1WebSocketMessages));
  const asyncApiImplemented = serialize(
    asyncApiDocument(
      sdkV1WebSocketMessages.filter(
        (envelope) => envelopeMarker(envelope.key) !== "planned"
      )
    )
  );

  const operationsManifest = serialize({
    generated_from: "@nodetool-ai/protocol",
    operations: [
      ...sdkV1HttpOperations.map((operation) => ({
        id: operation.id,
        entry: httpOperationManifest(operation)
      })),
      ...sdkV1WebSocketOperations.map((operation) => ({
        id: operation.id,
        entry: webSocketOperationManifest(operation)
      }))
    ]
      .sort(({ id: left }, { id: right }) =>
        left < right ? -1 : left > right ? 1 : 0
      )
      .map(({ entry }) => entry),
    protocol_version: PROTOCOL_VERSION
  });

  const contractArtifacts: Record<
    string,
    {
      content: string;
      mediaType: string;
      profile: string;
      variant?: "implemented";
    }
  > = {
    [ASYNCAPI_FILE]: {
      content: asyncApi,
      mediaType: ASYNCAPI_MEDIA_TYPE,
      profile: "discovery"
    },
    [OPENAPI_FILE]: {
      content: openApi,
      mediaType: OPENAPI_MEDIA_TYPE,
      profile: "discovery"
    },
    [LIFECYCLE_SCHEMA_FILE]: {
      content: lifecycleSchema,
      mediaType: "application/schema+json",
      profile: "lifecycle-draft"
    },
    [EXECUTION_SCHEMA_FILE]: {
      content: executionSchema,
      mediaType: "application/schema+json",
      profile: "execution"
    },
    [SCHEMA_FILE]: {
      content: schema,
      mediaType: "application/schema+json",
      profile: "discovery"
    },
    [ASYNCAPI_IMPLEMENTED_FILE]: {
      content: asyncApiImplemented,
      mediaType: ASYNCAPI_MEDIA_TYPE,
      profile: "discovery",
      variant: "implemented"
    },
    [OPENAPI_IMPLEMENTED_FILE]: {
      content: openApiImplemented,
      mediaType: OPENAPI_MEDIA_TYPE,
      profile: "discovery",
      variant: "implemented"
    },
    [OPERATIONS_FILE]: {
      content: operationsManifest,
      mediaType: "application/json",
      profile: "operations"
    }
  };
  const manifest = serialize({
    artifacts: Object.entries(contractArtifacts).map(([path, artifact]) => ({
      media_type: artifact.mediaType,
      path,
      profile: artifact.profile,
      sha256: createHash("sha256").update(artifact.content).digest("hex"),
      ...(artifact.variant === undefined ? {} : { variant: artifact.variant })
    })),
    default_websocket_encoding: "messagepack",
    generated_from: "@nodetool-ai/protocol",
    manifest_version: 1,
    optional_profiles: ["assets", "jobs", "agent", "offline-bundles"],
    protocol_version: PROTOCOL_VERSION,
    public_profiles: [
      "discovery",
      "execution",
      "model_catalog",
      "model_download"
    ],
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
