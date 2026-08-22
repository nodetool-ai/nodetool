import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSdkProtocolArtifacts } from "../scripts/generate-sdk-protocol.js";
import {
  getSdkV1Operation,
  implementedSdkV1HttpOperations,
  implementedSdkV1WebSocketOperations,
  matchSdkV1HttpOperation,
  sdkV1HttpOperations,
  sdkV1WebSocketOperations,
  validateSdkV1OperationRegistry
} from "../src/api-schemas/sdk-v1-operations.js";
import type {
  SdkV1HttpOperationDeclaration,
  SdkV1HttpOperationId,
  SdkV1WebSocketOperationDeclaration,
  SdkV1WebSocketOperationId
} from "../src/api-schemas/sdk-v1-operations.js";

const registry = {
  http: sdkV1HttpOperations,
  websocket: sdkV1WebSocketOperations
};

function firstHttp(): SdkV1HttpOperationDeclaration {
  return sdkV1HttpOperations[0];
}

function implementedWs(): SdkV1WebSocketOperationDeclaration {
  return implementedSdkV1WebSocketOperations[0];
}

describe("SDK v1 operation registry", () => {
  it("declares the expected operation inventory", () => {
    expect(sdkV1HttpOperations).toHaveLength(14);
    expect(implementedSdkV1HttpOperations).toHaveLength(11);
    expect(sdkV1WebSocketOperations).toHaveLength(11);
    expect(implementedSdkV1WebSocketOperations).toHaveLength(6);
  });

  it("accepts the shipped declarations", () => {
    expect(() => validateSdkV1OperationRegistry()).not.toThrow();
    expect(() => validateSdkV1OperationRegistry(registry)).not.toThrow();
  });

  it("rejects a duplicate operation id", () => {
    const doctored = {
      ...registry,
      http: [
        ...sdkV1HttpOperations,
        { ...firstHttp(), path: "/api/sdk/v1/doctored" }
      ]
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      `duplicate operation id ${firstHttp().id}`
    );
  });

  it("rejects a duplicate HTTP method and path pair", () => {
    // SAFETY (anti-slop/require-safety-comment-for-type-assertion): the novel
    // id keeps this doctored entry out of the duplicate-id check so only the
    // duplicate-route check can fire.
    const doctoredId = "doctoredDuplicateRoute" as SdkV1HttpOperationId;
    const doctored = {
      ...registry,
      http: [...sdkV1HttpOperations, { ...firstHttp(), id: doctoredId }]
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      `duplicate HTTP route ${firstHttp().method} ${firstHttp().path}`
    );
  });

  it("rejects a duplicate WebSocket channel and command pair", () => {
    const original = implementedWs();
    // SAFETY (anti-slop/require-safety-comment-for-type-assertion): the novel
    // id isolates the channel-identity check from the duplicate-id check.
    const doctoredId = "doctoredDuplicateCommand" as SdkV1WebSocketOperationId;
    const doctored = {
      ...registry,
      websocket: [...sdkV1WebSocketOperations, { ...original, id: doctoredId }]
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      /duplicate WebSocket channel identity sdkRpc:/
    );
  });

  it("rejects an implemented operation without declared errors", () => {
    const doctored = {
      ...registry,
      http: sdkV1HttpOperations.map((operation) =>
        operation.id === "preflightWorkflow"
          ? { ...operation, errors: [] }
          : operation
      )
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      "implemented operation preflightWorkflow declares no errors"
    );
  });

  it("rejects an implemented operation without a response schema", () => {
    const doctored = {
      ...registry,
      http: sdkV1HttpOperations.map((operation) =>
        operation.id === "listModels"
          ? {
              ...operation,
              response: {
                ...operation.response,
                schema: { ...operation.response.schema, name: "" }
              }
            }
          : operation
      )
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      "implemented operation listModels has no response schema"
    );
  });

  it("rejects an implemented WebSocket operation without message schemas", () => {
    const doctored = {
      ...registry,
      websocket: sdkV1WebSocketOperations.map((operation) =>
        operation.id === "sdkRpc.list_workflow_summaries" &&
        operation.direction === "request-response"
          ? {
              ...operation,
              message: {
                ...operation.message,
                request: {
                  ...operation.message.request,
                  payload: { ...operation.message.request.payload, name: "" }
                }
              }
            }
          : operation
      )
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      "implemented operation sdkRpc.list_workflow_summaries has no request/response schemas"
    );
  });

  it("rejects an implemented operation without a feature policy", () => {
    const { feature: _feature, ...withoutFeature } = firstHttp();
    // SAFETY (anti-slop/require-safety-comment-for-type-assertion): removing
    // the feature key exercises the runtime policy-presence check the type
    // system would otherwise forbid constructing.
    const doctoredOperation = withoutFeature as SdkV1HttpOperationDeclaration;
    const doctored = {
      ...registry,
      http: [doctoredOperation, ...sdkV1HttpOperations.slice(1)]
    };
    expect(() => validateSdkV1OperationRegistry(doctored)).toThrow(
      `operation ${firstHttp().id} has no feature policy`
    );
  });

  it("looks up operations by id across both transports", () => {
    expect(getSdkV1Operation("preflightWorkflow")?.transport).toBe("http");
    expect(getSdkV1Operation("lifecycleRpc.preflight_workflow")?.transport).toBe(
      "websocket"
    );
    expect(getSdkV1Operation("nonexistentOperation")).toBeUndefined();
  });
});

describe("matchSdkV1HttpOperation", () => {
  it("resolves every declared concrete path", () => {
    for (const operation of sdkV1HttpOperations) {
      if (operation.path.includes("{")) {
        continue;
      }
      const match = matchSdkV1HttpOperation(operation.method, operation.path);
      expect(match?.operation.id, operation.path).toBe(operation.id);
      expect(match?.params).toEqual({});
    }
  });

  it("binds path parameters on parameterized routes", () => {
    const interfaceMatch = matchSdkV1HttpOperation(
      "GET",
      "/api/workflows/wf-123/interface"
    );
    expect(interfaceMatch?.operation.id).toBe("getWorkflowInterface");
    expect(interfaceMatch?.params).toEqual({ id: "wf-123" });

    const snapshotMatch = matchSdkV1HttpOperation("GET", "/api/sdk/v1/jobs/job-9");
    expect(snapshotMatch?.operation.id).toBe("getJobSnapshot");
    expect(snapshotMatch?.params).toEqual({ job_id: "job-9" });

    const cancelMatch = matchSdkV1HttpOperation(
      "POST",
      "/api/sdk/v1/jobs/job-9/cancel"
    );
    expect(cancelMatch?.operation.id).toBe("cancelJob");
    expect(cancelMatch?.params).toEqual({ job_id: "job-9" });
  });

  it("normalizes the method casing", () => {
    expect(
      matchSdkV1HttpOperation("get", "/api/sdk/v1/models")?.operation.id
    ).toBe("listModels");
  });

  it("returns undefined for unknown paths and mismatched methods", () => {
    expect(matchSdkV1HttpOperation("GET", "/api/sdk/v1/unknown")).toBeUndefined();
    expect(matchSdkV1HttpOperation("POST", "/api/sdk/v1/models")).toBeUndefined();
    expect(
      matchSdkV1HttpOperation("GET", "/api/workflows//interface")
    ).toBeUndefined();
  });
});

interface OpenApiDocument {
  paths: Record<string, Record<string, { operationId: string }>>;
}

interface AsyncApiDocument {
  channels: Record<string, { messages: Record<string, unknown> }>;
  operations: Record<string, unknown>;
}

interface OperationsManifest {
  operations: Array<{
    id: string;
    status: string;
    transport: string;
    auth: string;
    feature: string | null;
    method?: string;
    path?: string;
    channel?: string;
    command?: string;
    direction?: string;
    errors: Array<Record<string, string>>;
  }>;
  protocol_version: string;
}

interface ProtocolManifest {
  artifacts: Array<{
    path: string;
    sha256: string;
    variant?: string;
  }>;
}

function openApiOperationIds(document: OpenApiDocument): string[] {
  return Object.values(document.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .map((operation) => operation.operationId)
    .sort();
}

describe("generated operation profiles", () => {
  const artifacts = generateSdkProtocolArtifacts();

  it("keeps every declared operation in the full OpenAPI profile", () => {
    const document = JSON.parse(
      artifacts["sdk-v1.openapi.json"]
    ) as OpenApiDocument;
    expect(Object.keys(document.paths)).toHaveLength(13);
    expect(openApiOperationIds(document)).toEqual(
      sdkV1HttpOperations.map((operation) => operation.id).sort()
    );
  });

  it("limits the implemented OpenAPI profile to implemented operations", () => {
    const raw = artifacts["sdk-v1.openapi.implemented.json"];
    const document = JSON.parse(raw) as OpenApiDocument;
    expect(openApiOperationIds(document)).toEqual(
      implementedSdkV1HttpOperations.map((operation) => operation.id).sort()
    );
    expect(raw).not.toContain("x-nodetool-implementation");
    expect(Object.keys(document.paths)).not.toContain("/api/sdk/v1/jobs");
  });

  it("limits the implemented AsyncAPI profile to implemented envelopes", () => {
    const raw = artifacts["sdk-v1.asyncapi.implemented.json"];
    const document = JSON.parse(raw) as AsyncApiDocument;
    expect(Object.keys(document.channels.sdkRpc.messages).sort()).toEqual([
      "lifecycleRpcRequest",
      "lifecycleRpcResponse",
      "sdkRpcRequest",
      "sdkRpcResponse"
    ]);
    expect(Object.keys(document.operations).sort()).toEqual([
      "receiveLifecycleRpcResponse",
      "receiveSdkRpcResponse",
      "sendLifecycleRpcRequest",
      "sendSdkRpcRequest"
    ]);
    expect(raw).not.toContain('"x-nodetool-implementation": "planned"');
    // Lifecycle envelopes still mix implemented and planned commands.
    expect(raw).toContain('"x-nodetool-implementation": "partial"');

    const full = JSON.parse(artifacts["sdk-v1.asyncapi.json"]) as AsyncApiDocument;
    expect(Object.keys(full.channels.sdkRpc.messages)).toContain("jobEvent");
    expect(Object.keys(full.operations)).toContain("receiveJobEvent");
  });

  it("emits an operations manifest matching the declarations 1:1", () => {
    const manifest = JSON.parse(
      artifacts["sdk-v1.operations.json"]
    ) as OperationsManifest;
    expect(manifest.protocol_version).toBe("1");
    expect(manifest.operations).toHaveLength(
      sdkV1HttpOperations.length + sdkV1WebSocketOperations.length
    );
    expect(manifest.operations.map((operation) => operation.id)).toEqual(
      [...sdkV1HttpOperations, ...sdkV1WebSocketOperations]
        .map((operation) => operation.id)
        .sort()
    );

    for (const declaration of sdkV1HttpOperations) {
      const entry = manifest.operations.find(
        (operation) => operation.id === declaration.id
      );
      expect(entry, declaration.id).toBeDefined();
      expect(entry).toMatchObject({
        auth: declaration.auth,
        feature: declaration.feature,
        method: declaration.method,
        path: declaration.path,
        status: declaration.status,
        transport: "http"
      });
      expect(entry?.errors).toEqual(
        declaration.errors.map((error) => ({
          description: error.description,
          status: error.status
        }))
      );
    }

    for (const declaration of sdkV1WebSocketOperations) {
      const entry = manifest.operations.find(
        (operation) => operation.id === declaration.id
      );
      expect(entry, declaration.id).toBeDefined();
      expect(entry).toMatchObject({
        auth: declaration.auth,
        channel: declaration.channel,
        direction: declaration.direction,
        feature: declaration.feature,
        status: declaration.status,
        transport: "websocket"
      });
      if (declaration.direction === "request-response") {
        expect(entry?.command).toBe(declaration.command);
      } else {
        expect(entry?.command).toBeUndefined();
      }
      expect(entry?.errors).toEqual(
        declaration.errors.map((error) => ({
          code: error.code,
          description: error.description
        }))
      );
    }
  });

  it("registers the new artifacts in the manifest with valid hashes", () => {
    const manifest = JSON.parse(
      artifacts["sdk-v1.manifest.json"]
    ) as ProtocolManifest;
    for (const path of [
      "sdk-v1.openapi.implemented.json",
      "sdk-v1.asyncapi.implemented.json",
      "sdk-v1.operations.json"
    ]) {
      const entry = manifest.artifacts.find(
        (artifact) => artifact.path === path
      );
      expect(entry, path).toBeDefined();
      expect(entry?.sha256).toBe(
        createHash("sha256").update(artifacts[path]).digest("hex")
      );
    }
    expect(
      manifest.artifacts.find(
        (artifact) => artifact.path === "sdk-v1.openapi.implemented.json"
      )?.variant
    ).toBe("implemented");
    expect(
      manifest.artifacts.find(
        (artifact) => artifact.path === "sdk-v1.asyncapi.implemented.json"
      )?.variant
    ).toBe("implemented");
    expect(
      manifest.artifacts.find(
        (artifact) => artifact.path === "sdk-v1.openapi.json"
      )?.variant
    ).toBeUndefined();
  });

  it("generates byte-identical artifacts across runs", () => {
    const second = generateSdkProtocolArtifacts();
    expect(Object.keys(second).sort()).toEqual(Object.keys(artifacts).sort());
    for (const [name, content] of Object.entries(artifacts)) {
      expect(second[name], name).toBe(content);
    }
  });
});
