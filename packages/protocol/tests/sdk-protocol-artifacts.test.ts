import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateSdkProtocolArtifacts } from "../scripts/generate-sdk-protocol.js";

interface ProtocolManifest {
  artifacts: Array<{
    path: string;
    sha256: string;
  }>;
  protocol_version: string;
  public_profiles: string[];
}

interface BaselineFixture {
  rest: {
    summaries: { response: unknown };
    interface: { response: unknown };
  };
  websocket: {
    request: unknown;
    response: unknown;
  };
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n");
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
      "/api/sdk/v1/jobs",
      "/api/sdk/v1/jobs/{job_id}",
      "/api/sdk/v1/jobs/{job_id}/cancel",
      "/api/sdk/v1/model-downloads",
      "/api/sdk/v1/model-downloads/cancel",
      "/api/sdk/v1/models",
      "/api/sdk/v1/node-types",
      "/api/sdk/v1/preflight",
      "/api/sdk/v1/workflow-interfaces",
      "/api/sdk/v1/workflows",
      "/api/workflows/{id}/interface"
    ]);
  });

  it("publishes correlated MessagePack request and response operations", () => {
    const asyncApi = JSON.parse(artifacts["sdk-v1.asyncapi.json"]) as {
      asyncapi: string;
      operations: Record<string, { action: string }>;
    };

    expect(asyncApi.asyncapi).toBe("3.0.0");
    expect(asyncApi.operations.sendSdkRpcRequest?.action).toBe("send");
    expect(asyncApi.operations.receiveSdkRpcResponse?.action).toBe("receive");
    expect(asyncApi.operations.sendLifecycleRpcRequest?.action).toBe("send");
    expect(asyncApi.operations.receiveJobEvent?.action).toBe("receive");
  });

  it("validates baseline payloads from the committed JSON Schema", () => {
    const bundle = JSON.parse(artifacts["sdk-v1.discovery.schema.json"]) as {
      $defs: Record<string, Parameters<typeof z.fromJSONSchema>[0]>;
    };
    const fixturePath = new URL(
      "../fixtures/sdk-v1-baseline.json",
      import.meta.url
    );
    const fixture = JSON.parse(
      readFileSync(fixturePath, "utf8")
    ) as BaselineFixture;

    expect(() =>
      z
        .fromJSONSchema(bundle.$defs.WorkflowSummariesOutput!)
        .parse(fixture.rest.summaries.response)
    ).not.toThrow();
    expect(() =>
      z
        .fromJSONSchema(bundle.$defs.WorkflowInterface!)
        .parse(fixture.rest.interface.response)
    ).not.toThrow();
    expect(() =>
      z
        .fromJSONSchema(bundle.$defs.RpcRequest!)
        .parse(fixture.websocket.request)
    ).not.toThrow();
    expect(() =>
      z
        .fromJSONSchema(bundle.$defs.RpcResponse!)
        .parse(fixture.websocket.response)
    ).not.toThrow();
  });

  it("allows additive response fields but keeps requests strict", () => {
    const bundle = JSON.parse(artifacts["sdk-v1.discovery.schema.json"]) as {
      $defs: Record<string, Parameters<typeof z.fromJSONSchema>[0]>;
    };
    const fixturePath = new URL(
      "../fixtures/sdk-v1-baseline.json",
      import.meta.url
    );
    const fixture = JSON.parse(
      readFileSync(fixturePath, "utf8")
    ) as BaselineFixture;
    const futureResponse = structuredClone(fixture.websocket.response) as {
      result: { future_result_field?: string };
      future_envelope_field?: string;
    };
    futureResponse.future_envelope_field = "ignored by older clients";
    futureResponse.result.future_result_field = "also additive";
    const futureRequest = {
      ...(fixture.websocket.request as Record<string, unknown>),
      future_request_field: "not in protocol v1"
    };

    expect(() =>
      z.fromJSONSchema(bundle.$defs.RpcResponse!).parse(futureResponse)
    ).not.toThrow();
    expect(() =>
      z.fromJSONSchema(bundle.$defs.RpcRequest!).parse(futureRequest)
    ).toThrow();
  });
});
