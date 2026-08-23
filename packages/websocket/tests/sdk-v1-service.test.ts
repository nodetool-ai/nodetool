import { describe, expect, it, vi } from "vitest";
import {
  implementedSdkV1HttpOperations,
  implementedSdkV1WebSocketOperations
} from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import type { SdkV1Capabilities } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { SdkV1PreflightServiceError } from "../src/sdk/sdk-preflight-orchestrator.js";
import {
  assertSdkV1ImplementationCoverage,
  createSdkV1ImplementationBoundary
} from "../src/sdk/sdk-v1-handler-map.js";
import {
  SdkV1ServiceError,
  sdkV1HttpError,
  sdkV1RpcError
} from "../src/sdk/sdk-v1-service-error.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";

const capabilities: SdkV1Capabilities = {
  protocol_version: "1",
  nodetool_version: "test",
  server_time: "2026-08-22T00:00:00.000Z",
  supported_encodings: ["messagepack"],
  default_encoding: "messagepack",
  profiles: {},
  registry_revision: 0,
  python_bridge: "disabled",
  auth_modes: ["trusted_local"],
  asset_uri_schemes: ["asset"],
  limits: {
    max_rpc_batch: 1,
    max_inline_bytes: 0,
    max_upload_bytes: 1024,
    max_queued_jobs: 0,
    max_job_event_replay: 0,
    request_timeout_seconds: 30
  }
};

describe("SDK v1 implementation boundary", () => {
  it("covers every implemented request/response declaration exactly", () => {
    const boundary = createSdkV1ImplementationBoundary(createSdkV1Service());
    const expected = [
      ...implementedSdkV1HttpOperations.map((operation) => operation.id),
      ...implementedSdkV1WebSocketOperations
        .filter((operation) => operation.direction === "request-response")
        .map((operation) => operation.id)
    ].sort();

    expect(Object.keys(boundary.handlers).sort()).toEqual(expected);
    expect(Object.keys(boundary.eventPublishers)).toEqual([]);
  });

  it("fails for missing handlers and undeclared event publishers", () => {
    const boundary = createSdkV1ImplementationBoundary(createSdkV1Service());
    const { getCapabilities: _missing, ...missingHandler } = boundary.handlers;

    expect(() =>
      assertSdkV1ImplementationCoverage({
        handlers: missingHandler,
        eventPublishers: boundary.eventPublishers
      })
    ).toThrow(/getCapabilities/);
    expect(() =>
      assertSdkV1ImplementationCoverage({
        handlers: boundary.handlers,
        eventPublishers: { receiveJobEvent: vi.fn() }
      })
    ).toThrow(/server-event publisher coverage/);
  });

  it("uses the same service method for HTTP and lifecycle capability IDs", async () => {
    const getCapabilities = vi.fn(() => capabilities);
    const boundary = createSdkV1ImplementationBoundary(
      createSdkV1Service({
        getCapabilities,
        getEnvironment: () => ({
          NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0"
        })
      })
    );

    await expect(boundary.handlers.getCapabilities(undefined)).resolves.toEqual(
      capabilities
    );
    await expect(
      boundary.handlers["lifecycleRpc.get_capabilities"](undefined)
    ).resolves.toEqual(capabilities);
    expect(getCapabilities).toHaveBeenCalledTimes(2);
  });
});

describe("SDK v1 service errors", () => {
  it.each([
    ["authentication-required", 401],
    ["not-found", 404],
    ["payload-too-large", 413],
    ["invalid-resource", 422],
    ["not-implemented", 501],
    ["unavailable", 503],
    ["internal", 500]
  ] as const)(
    "maps %s without exposing its internal cause",
    (category, status) => {
      const error = new SdkV1ServiceError(
        category,
        "PUBLIC_CODE",
        "Safe message",
        category === "internal",
        new Error("secret detail")
      );

      expect(sdkV1HttpError(error)).toEqual({
        status,
        body: {
          code: "PUBLIC_CODE",
          message: "Safe message",
          retryable: category === "internal",
          detail: "Safe message"
        }
      });
      expect(sdkV1RpcError(error)).toEqual({
        code: "PUBLIC_CODE",
        message: "Safe message",
        retryable: category === "internal"
      });
    }
  );

  it("centralizes lifecycle policy, authentication, and safe preflight errors", async () => {
    const environment: NodeJS.ProcessEnv = {
      NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1"
    };
    const preflight = vi.fn(async () => {
      throw new SdkV1PreflightServiceError(
        "WORKFLOW_NOT_FOUND",
        "secret workflow detail",
        false
      );
    });
    const service = createSdkV1Service({
      getCapabilities: () => capabilities,
      preflightService: { preflight },
      getEnvironment: () => environment
    });

    await expect(service.getCapabilities()).rejects.toMatchObject({
      code: "SDK_LIFECYCLE_DISABLED",
      category: "unavailable"
    });

    environment.NODETOOL_DISABLE_SDK_LIFECYCLE_V1 = "0";
    await expect(
      service.preflightWorkflow({ request: {} as never, principal: null })
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      category: "authentication-required"
    });
    await expect(
      service.preflightWorkflow({
        request: {} as never,
        principal: { userId: "alice" }
      })
    ).rejects.toMatchObject({
      code: "WORKFLOW_NOT_FOUND",
      publicMessage: "Workflow not found."
    });

    environment.NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1 = "1";
    await expect(
      service.listWorkflowSummaries({
        userId: "alice",
        request: { limit: 25 },
        registryRevision: null
      })
    ).rejects.toMatchObject({
      code: "SDK_WORKFLOW_INTERFACE_DISABLED",
      category: "unavailable"
    });
  });
});
