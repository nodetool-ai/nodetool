import { describe, expect, it } from "vitest";
import {
  diffImplementedOpenApiPaths,
  diffOperationManifests,
  diffSchemaDefs,
  exitCodeFor,
  operationsManifestSchema,
  type SdkContractChange,
  type SdkContractOperationsManifest
} from "../scripts/diff-sdk-contract.js";

function manifest(operations: unknown[]): SdkContractOperationsManifest {
  return operationsManifestSchema.parse({
    operations,
    protocol_version: "1"
  });
}

function httpOperation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    auth: "discovery",
    errors: [{ description: "SDK discovery is disabled", status: "503" }],
    feature: "workflow-interface",
    id: "listThings",
    method: "GET",
    path: "/api/sdk/v1/things",
    request: { query: "sdk-v1.discovery.schema.json#/$defs/ThingsQuery" },
    response: {
      content_type: "application/json",
      schema: "sdk-v1.discovery.schema.json#/$defs/ThingsOutput",
      status: "200"
    },
    status: "implemented",
    transport: "http",
    ...overrides
  };
}

function webSocketOperation(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    auth: "discovery",
    channel: "sdkRpc",
    command: "get_things",
    direction: "request-response",
    errors: [
      { code: "SERVICE_UNAVAILABLE", description: "SDK discovery is disabled" }
    ],
    feature: "workflow-interface",
    id: "sdkRpc.get_things",
    message: {
      request: {
        envelope: "sdkRpcRequest",
        payload: "sdk-v1.discovery.schema.json#/$defs/ThingsQuery"
      },
      response: {
        envelope: "sdkRpcResponse",
        payload: "sdk-v1.discovery.schema.json#/$defs/ThingsOutput"
      }
    },
    status: "implemented",
    transport: "websocket",
    ...overrides
  };
}

function only(changes: SdkContractChange[]): SdkContractChange {
  expect(changes).toHaveLength(1);
  const change = changes[0];
  if (change === undefined) {
    throw new Error("expected one change");
  }
  return change;
}

describe("diffOperationManifests", () => {
  it("reports no changes and exit 0 for identical manifests", () => {
    const left = manifest([httpOperation(), webSocketOperation()]);
    const right = manifest([httpOperation(), webSocketOperation()]);
    const changes = diffOperationManifests(left, right);
    expect(changes).toEqual([]);
    expect(exitCodeFor(changes)).toBe(0);
  });

  it("classifies a new implemented operation as additive", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation(), webSocketOperation()])
    );
    const change = only(changes);
    expect(change.kind).toBe("operation-added");
    expect(change.category).toBe("additive");
    expect(exitCodeFor(changes)).toBe(0);
  });

  it("classifies a new planned operation as additive", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation(),
        webSocketOperation({ id: "sdkRpc.plan", status: "planned" })
      ])
    );
    expect(only(changes).kind).toBe("planned-operation-added");
    expect(exitCodeFor(changes)).toBe(0);
  });

  it("classifies an added error declaration as additive", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation({
          errors: [
            { description: "SDK discovery is disabled", status: "503" },
            { description: "Rate limited", status: "429" }
          ]
        })
      ])
    );
    expect(only(changes).kind).toBe("error-added");
    expect(exitCodeFor(changes)).toBe(0);
  });

  it("classifies planned -> implemented as additive", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation({ status: "planned" })]),
      manifest([httpOperation()])
    );
    const change = only(changes);
    expect(change.kind).toBe("operation-implemented");
    expect(change.category).toBe("additive");
  });

  it("classifies implemented -> planned as risky", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ status: "planned" })])
    );
    const change = only(changes);
    expect(change.kind).toBe("operation-unimplemented");
    expect(change.category).toBe("risky");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a changed auth policy as risky", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ auth: "authenticated" })])
    );
    const change = only(changes);
    expect(change.kind).toBe("auth-changed");
    expect(change.category).toBe("risky");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a changed feature policy as risky", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ feature: "lifecycle" })])
    );
    expect(only(changes).kind).toBe("feature-changed");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a reworded error declaration as risky", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation({
          errors: [{ description: "Discovery is switched off", status: "503" }]
        })
      ])
    );
    expect(only(changes).kind).toBe("error-changed");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a changed request content type as risky", () => {
    const changes = diffOperationManifests(
      manifest([
        httpOperation({
          request: {
            body: {
              content_type: "application/json",
              schema: "sdk-v1.discovery.schema.json#/$defs/ThingsQuery"
            }
          }
        })
      ]),
      manifest([
        httpOperation({
          request: {
            body: {
              content_type: "application/x-ndjson",
              schema: "sdk-v1.discovery.schema.json#/$defs/ThingsQuery"
            }
          }
        })
      ])
    );
    expect(only(changes).kind).toBe("request-content-type-changed");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a changed response content type as risky", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation({
          response: {
            content_type: "application/x-ndjson",
            schema: "sdk-v1.discovery.schema.json#/$defs/ThingsOutput",
            status: "200"
          }
        })
      ])
    );
    expect(only(changes).kind).toBe("response-content-type-changed");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a changed success status as risky", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation({
          response: {
            content_type: "application/json",
            schema: "sdk-v1.discovery.schema.json#/$defs/ThingsOutput",
            status: "202"
          }
        })
      ])
    );
    expect(only(changes).kind).toBe("response-status-changed");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a changed response schema reference as risky", () => {
    const changes = diffOperationManifests(
      manifest([webSocketOperation()]),
      manifest([
        webSocketOperation({
          message: {
            request: {
              envelope: "sdkRpcRequest",
              payload: "sdk-v1.discovery.schema.json#/$defs/ThingsQuery"
            },
            response: {
              envelope: "sdkRpcResponse",
              payload: "sdk-v1.discovery.schema.json#/$defs/ThingsOutputV2"
            }
          }
        })
      ])
    );
    expect(only(changes).kind).toBe("response-schema-changed");
    expect(exitCodeFor(changes)).toBe(2);
  });

  it("classifies a removed operation as breaking", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation(), webSocketOperation()]),
      manifest([httpOperation()])
    );
    const change = only(changes);
    expect(change.kind).toBe("operation-removed");
    expect(change.category).toBe("breaking");
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a changed method or path as breaking", () => {
    const methodChanges = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ method: "POST" })])
    );
    expect(only(methodChanges).kind).toBe("http-identity-changed");
    expect(exitCodeFor(methodChanges)).toBe(3);

    const pathChanges = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ path: "/api/sdk/v2/things" })])
    );
    expect(only(pathChanges).kind).toBe("http-identity-changed");
    expect(exitCodeFor(pathChanges)).toBe(3);
  });

  it("classifies a changed channel or command as breaking", () => {
    const changes = diffOperationManifests(
      manifest([webSocketOperation()]),
      manifest([webSocketOperation({ command: "fetch_things" })])
    );
    expect(only(changes).kind).toBe("websocket-identity-changed");
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a changed transport as breaking", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation({ id: "shared" })]),
      manifest([webSocketOperation({ id: "shared" })])
    );
    expect(
      changes.some((change) => change.kind === "transport-changed")
    ).toBe(true);
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a removed declared error as breaking", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ errors: [] })])
    );
    const change = only(changes);
    expect(change.kind).toBe("error-removed");
    expect(change.category).toBe("breaking");
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a changed request schema reference as breaking", () => {
    const queryChanges = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation({
          request: { query: "sdk-v1.discovery.schema.json#/$defs/ThingsQueryV2" }
        })
      ])
    );
    expect(only(queryChanges).kind).toBe("request-schema-changed");
    expect(exitCodeFor(queryChanges)).toBe(3);

    const messageChanges = diffOperationManifests(
      manifest([webSocketOperation()]),
      manifest([
        webSocketOperation({
          message: {
            request: {
              envelope: "sdkRpcRequest",
              payload: "sdk-v1.discovery.schema.json#/$defs/ThingsQueryV2"
            },
            response: {
              envelope: "sdkRpcResponse",
              payload: "sdk-v1.discovery.schema.json#/$defs/ThingsOutput"
            }
          }
        })
      ])
    );
    expect(only(messageChanges).kind).toBe("request-schema-changed");
  });

  it("classifies a removed request schema as breaking", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([httpOperation({ request: {} })])
    );
    expect(only(changes).kind).toBe("request-schema-removed");
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a request schema added to an existing operation as breaking", () => {
    const changes = diffOperationManifests(
      manifest([httpOperation({ request: {} })]),
      manifest([httpOperation()])
    );
    expect(only(changes).kind).toBe("request-schema-added");
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("maps mixed severities to the strongest exit code", () => {
    const additiveAndRisky = diffOperationManifests(
      manifest([httpOperation()]),
      manifest([
        httpOperation({ auth: "authenticated" }),
        webSocketOperation()
      ])
    );
    expect(exitCodeFor(additiveAndRisky)).toBe(2);

    const withBreaking = diffOperationManifests(
      manifest([httpOperation(), webSocketOperation()]),
      manifest([httpOperation({ auth: "authenticated" })])
    );
    expect(exitCodeFor(withBreaking)).toBe(3);
  });
});

describe("diffSchemaDefs", () => {
  const responseNames = new Set(["ThingsOutput"]);
  const objectDef = {
    properties: { id: { type: "string" }, name: { type: "string" } },
    required: ["id", "name"],
    type: "object"
  };

  it("reports nothing for identical defs", () => {
    const changes = diffSchemaDefs(
      "sdk-v1.discovery.schema.json",
      { ThingsOutput: objectDef },
      { ThingsOutput: structuredClone(objectDef) },
      responseNames
    );
    expect(changes).toEqual([]);
  });

  it("classifies a removed definition as risky", () => {
    const changes = diffSchemaDefs(
      "sdk-v1.discovery.schema.json",
      { ThingsOutput: objectDef },
      {},
      responseNames
    );
    const change = only(changes);
    expect(change.kind).toBe("schema-def-removed");
    expect(change.category).toBe("risky");
  });

  it("classifies a changed non-response definition as risky", () => {
    const changes = diffSchemaDefs(
      "sdk-v1.discovery.schema.json",
      { ThingsQuery: objectDef },
      { ThingsQuery: { ...objectDef, required: ["id"] } },
      responseNames
    );
    expect(only(changes).kind).toBe("schema-def-changed");
  });

  it("classifies a removed required response property as breaking", () => {
    const changes = diffSchemaDefs(
      "sdk-v1.discovery.schema.json",
      { ThingsOutput: objectDef },
      {
        ThingsOutput: {
          properties: { id: { type: "string" } },
          required: ["id"],
          type: "object"
        }
      },
      responseNames
    );
    const change = only(changes);
    expect(change.kind).toBe("required-response-property-removed");
    expect(change.category).toBe("breaking");
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a new response property as additive", () => {
    const changes = diffSchemaDefs(
      "sdk-v1.discovery.schema.json",
      { ThingsOutput: objectDef },
      {
        ThingsOutput: {
          ...objectDef,
          properties: { ...objectDef.properties, extra: { type: "string" } }
        }
      },
      responseNames
    );
    const change = only(changes);
    expect(change.kind).toBe("response-property-added");
    expect(change.category).toBe("additive");
    expect(exitCodeFor(changes)).toBe(0);
  });

  it("classifies a new definition as additive", () => {
    const changes = diffSchemaDefs(
      "sdk-v1.discovery.schema.json",
      {},
      { ThingsOutput: objectDef },
      responseNames
    );
    expect(only(changes).kind).toBe("schema-def-added");
  });
});

describe("diffImplementedOpenApiPaths", () => {
  const document = {
    paths: {
      "/api/sdk/v1/things": { get: {} },
      "/api/sdk/v1/widgets": { get: {}, post: {} }
    }
  };

  it("classifies a route leaving the implemented profile as breaking", () => {
    const changes = diffImplementedOpenApiPaths(document, {
      paths: { "/api/sdk/v1/things": { get: {} } }
    });
    expect(changes.map((change) => change.kind)).toEqual([
      "implemented-route-removed",
      "implemented-route-removed"
    ]);
    expect(exitCodeFor(changes)).toBe(3);
  });

  it("classifies a route joining the implemented profile as additive", () => {
    const changes = diffImplementedOpenApiPaths(document, {
      paths: { ...document.paths, "/api/sdk/v1/gadgets": { get: {} } }
    });
    const change = only(changes);
    expect(change.kind).toBe("implemented-route-added");
    expect(change.category).toBe("additive");
    expect(exitCodeFor(changes)).toBe(0);
  });
});
