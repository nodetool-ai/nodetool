import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { generateSdkProtocolArtifacts } from "../scripts/generate-sdk-protocol.js";

type JsonSchema = Record<string, unknown>;

interface ProtocolManifest {
  artifacts: Array<{
    path: string;
    sha256: string;
  }>;
  protocol_version: string;
  public_profiles: string[];
}

interface HttpFixture {
  captures: {
    success: { response: { body: unknown } };
  };
}

function readHttpSuccessFixture(name: string): unknown {
  const fixture = JSON.parse(
    readFileSync(
      new URL(`../fixtures/sdk-v1/${name}`, import.meta.url),
      "utf8"
    )
  ) as HttpFixture;
  return fixture.captures.success.response.body;
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function schemaDefinition(bundle: JsonSchema, name: string): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile({
    ...bundle,
    $ref: `#/$defs/${name}`
  });
}

function expectAllDefinitionsToCompile(bundle: JsonSchema): void {
  const schemaId = bundle.$id;
  const definitions = bundle.$defs;
  if (
    typeof schemaId !== "string" ||
    definitions === null ||
    typeof definitions !== "object" ||
    Array.isArray(definitions)
  ) {
    throw new Error("SDK schema bundle must declare an $id and object $defs");
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(bundle);
  for (const name of Object.keys(definitions)) {
    expect(() =>
      ajv.compile({
        $ref: `${schemaId}#/$defs/${name}`
      })
    ).not.toThrow();
  }
}

describe("generated public SDK protocol artifacts", () => {
  const artifacts = generateSdkProtocolArtifacts();

  it("matches the committed artifacts", () => {
    for (const [name, generated] of Object.entries(artifacts)) {
      const path = new URL(`../schema/${name}`, import.meta.url);
      expect(normalizeLineEndings(readFileSync(path, "utf8")), name).toBe(
        normalizeLineEndings(generated)
      );
    }
  });

  it("publishes valid artifact hashes in the manifest", () => {
    const manifest = JSON.parse(
      artifacts["sdk-v1.manifest.json"]
    ) as ProtocolManifest;

    expect(manifest.protocol_version).toBe("1");
    expect(manifest.public_profiles).toContain("discovery");
    expect(manifest.public_profiles).toContain("execution");
    for (const artifact of manifest.artifacts) {
      const content = artifacts[artifact.path];
      expect(content, artifact.path).toBeDefined();
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        artifact.sha256
      );
    }
  });

  it("publishes the current HTTP discovery operations", () => {
    const openApi = JSON.parse(artifacts["sdk-v1.openapi.json"]) as {
      openapi: string;
      paths: Record<string, unknown>;
    };

    expect(openApi.openapi).toBe("3.1.0");
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/sdk/v1/assets/temporary",
      "/api/sdk/v1/capabilities",
      "/api/sdk/v1/model-downloads",
      "/api/sdk/v1/model-downloads/cancel",
      "/api/sdk/v1/models",
      "/api/sdk/v1/node-types",
      "/api/sdk/v1/preflight",
      "/api/sdk/v1/workflow-interfaces",
      "/api/sdk/v1/workflows",
      "/api/sdk/v1/workflows/{id}/interface"
    ]);
  });

  it("publishes MessagePack execution commands and events", () => {
    const asyncApi = JSON.parse(artifacts["sdk-v1.asyncapi.json"]) as {
      asyncapi: string;
      operations: Record<string, { action: string }>;
    };

    expect(asyncApi.asyncapi).toBe("3.0.0");
    expect(asyncApi.operations.sendExecutionCommand?.action).toBe("send");
    expect(asyncApi.operations.receiveExecutionEvent?.action).toBe("receive");
  });

  it("validates HTTP golden payloads from the committed JSON Schema", () => {
    const bundle = JSON.parse(
      artifacts["sdk-v1.discovery.schema.json"]
    ) as JsonSchema;
    const summaries = readHttpSuccessFixture("http-get-workflows.json");
    const workflowInterface = readHttpSuccessFixture(
      "http-get-workflow-interface.json"
    );

    expect(
      schemaDefinition(bundle, "WorkflowSummariesOutput")(summaries)
    ).toBe(true);
    expect(
      schemaDefinition(bundle, "WorkflowInterface")(workflowInterface)
    ).toBe(true);
  });

  it("publishes schema bundles with resolvable component references", () => {
    expectAllDefinitionsToCompile(
      JSON.parse(artifacts["sdk-v1.discovery.schema.json"]) as JsonSchema
    );
    expectAllDefinitionsToCompile(
      JSON.parse(artifacts["sdk-v1.lifecycle.schema.json"]) as JsonSchema
    );
    expectAllDefinitionsToCompile(
      JSON.parse(artifacts["sdk-v1.execution.schema.json"]) as JsonSchema
    );
  }, 20_000);

  it("allows additive response fields but keeps requests strict", () => {
    const bundle = JSON.parse(
      artifacts["sdk-v1.discovery.schema.json"]
    ) as JsonSchema;
    const futureResponse = structuredClone(
      readHttpSuccessFixture("http-get-workflows.json")
    ) as Record<string, unknown>;
    futureResponse.future_response_field = "ignored by older clients";
    const futureRequest = {
      limit: 50,
      future_request_field: "not in protocol v1"
    };

    expect(schemaDefinition(bundle, "WorkflowSummariesOutput")(futureResponse)).toBe(
      true
    );
    expect(schemaDefinition(bundle, "WorkflowSummariesInput")(futureRequest)).toBe(
      false
    );
  });
});
