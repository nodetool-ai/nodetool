import { describe, expect, it, vi } from "vitest";
import type {
  SdkV1Capabilities,
  SdkV1PreflightRequest,
  SdkV1PreflightSummary
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { handleSdkV1LifecycleRpc } from "../src/sdk/sdk-lifecycle-rpc-handler.js";
import { handleSdkV1Capabilities } from "../src/sdk/sdk-capabilities-http-handler.js";
import { handleSdkV1Preflight } from "../src/sdk/sdk-preflight-http-handler.js";
import { SdkV1PreflightServiceError } from "../src/sdk/sdk-preflight-orchestrator.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";

const enabled = { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0" };

const capabilities: SdkV1Capabilities = {
  protocol_version: "1",
  nodetool_version: "test",
  server_time: "2026-07-25T10:00:00.000Z",
  supported_encodings: ["messagepack", "json-text"],
  default_encoding: "messagepack",
  profiles: { preflight: "available" },
  registry_revision: 12,
  python_bridge: "ready",
  auth_modes: ["trusted_local"],
  asset_uri_schemes: ["asset", "http", "https"],
  limits: {
    max_rpc_batch: 100,
    max_inline_bytes: 16384,
    max_upload_bytes: 1024,
    max_queued_jobs: 10,
    max_job_event_replay: 0,
    request_timeout_seconds: 30
  }
};

const preflightRequest: SdkV1PreflightRequest = {
  workflow_id: "workflow-1",
  workspace_id: null,
  workflow_etag: "etag-1",
  interface_version: 1,
  level: "static",
  inputs: { text: "hello" }
};

const preflightSummary: SdkV1PreflightSummary = {
  version: 1,
  level: "static",
  workflow_id: "workflow-1",
  workflow_etag: "etag-1",
  runnable: true,
  issues: [],
  requirements: [],
  cost: null
};

function options(
  overrides: {
    getCapabilities?: () => SdkV1Capabilities;
    preflight?: () => Promise<SdkV1PreflightSummary>;
    getPrincipal?: () => { userId: string } | null;
    environment?: NodeJS.ProcessEnv;
    onInternalError?: (error: unknown) => void;
  } = {}
) {
  const boundary = createSdkV1ImplementationBoundary(
    createSdkV1Service({
      getCapabilities: overrides.getCapabilities ?? (() => capabilities),
      preflightService: {
        preflight: overrides.preflight ?? vi.fn(async () => preflightSummary)
      },
      getEnvironment: () => overrides.environment ?? enabled
    })
  );
  return {
    boundary,
    getPrincipal:
      overrides.getPrincipal ?? (() => ({ userId: "authenticated-user" })),
    onInternalError: overrides.onInternalError
  };
}

describe("standalone SDK lifecycle WebSocket handler", () => {
  it("honors the server kill switch before evaluating services", async () => {
    const getCapabilities = vi.fn(() => capabilities);
    const response = await handleSdkV1LifecycleRpc(
      {
        command: "get_capabilities",
        request_id: "request-1",
        data: {}
      },
      options({
        getCapabilities,
        environment: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" }
      })
    );

    expect(response).toMatchObject({
      type: "rpc_response",
      request_id: "request-1",
      command: "get_capabilities",
      error: {
        code: "SDK_LIFECYCLE_DISABLED",
        retryable: false
      }
    });
    expect(getCapabilities).not.toHaveBeenCalled();
  });

  it("returns schema-valid capability and preflight responses", async () => {
    const preflight = vi.fn(async () => preflightSummary);

    const capabilityResponse = await handleSdkV1LifecycleRpc(
      {
        command: "get_capabilities",
        request_id: "capabilities-1",
        data: {}
      },
      options()
    );
    const preflightResponse = await handleSdkV1LifecycleRpc(
      {
        command: "preflight_workflow",
        request_id: "preflight-1",
        data: preflightRequest
      },
      options({ preflight })
    );

    expect(capabilityResponse).toMatchObject({ result: capabilities });
    expect(preflightResponse).toMatchObject({ result: preflightSummary });
    expect(preflight).toHaveBeenCalledWith({
      request: preflightRequest,
      principal: { userId: "authenticated-user" }
    });
  });

  it("matches the successful HTTP payloads", async () => {
    const capabilityHttp = await handleSdkV1Capabilities(
      new Request("http://localhost/api/sdk/v1/capabilities"),
      { boundary: options().boundary }
    );
    const capabilityRpc = await handleSdkV1LifecycleRpc(
      {
        command: "get_capabilities",
        request_id: "capabilities-1",
        data: {}
      },
      options()
    );

    const preflightHttp = await handleSdkV1Preflight(
      new Request("http://localhost/api/sdk/v1/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preflightRequest)
      }),
      {
        boundary: options().boundary,
        getPrincipal: () => ({ userId: "authenticated-user" })
      }
    );
    const preflightRpc = await handleSdkV1LifecycleRpc(
      {
        command: "preflight_workflow",
        request_id: "preflight-1",
        data: preflightRequest
      },
      options()
    );

    expect(capabilityRpc).toMatchObject({
      result: await capabilityHttp.json()
    });
    expect(preflightRpc).toMatchObject({ result: await preflightHttp.json() });
  });

  it("rejects malformed owned requests without invoking services", async () => {
    const preflight = vi.fn(async () => preflightSummary);
    const response = await handleSdkV1LifecycleRpc(
      {
        command: "preflight_workflow",
        request_id: "request-1",
        data: { workflow_id: "" }
      },
      options({ preflight })
    );

    expect(response).toMatchObject({
      error: { code: "INVALID_REQUEST", retryable: false }
    });
    expect(preflight).not.toHaveBeenCalled();
  });

  it("requires a connection-authenticated principal", async () => {
    const response = await handleSdkV1LifecycleRpc(
      {
        command: "preflight_workflow",
        request_id: "request-1",
        data: preflightRequest,
        user_id: "spoofed-user"
      },
      options({ getPrincipal: () => null })
    );

    expect(response).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
  });

  it("redacts expected and unexpected preflight failures", async () => {
    const expected = await handleSdkV1LifecycleRpc(
      {
        command: "preflight_workflow",
        request_id: "expected",
        data: preflightRequest
      },
      options({
        preflight: async () => {
          throw new SdkV1PreflightServiceError(
            "WORKFLOW_NOT_FOUND",
            "secret workflow detail",
            false
          );
        }
      })
    );
    const onInternalError = vi.fn(() => {
      throw new Error("logger unavailable");
    });
    const unexpected = await handleSdkV1LifecycleRpc(
      {
        command: "preflight_workflow",
        request_id: "unexpected",
        data: preflightRequest
      },
      options({
        preflight: async () => {
          throw new Error("secret database detail");
        },
        onInternalError
      })
    );

    expect(expected).toMatchObject({
      error: {
        code: "WORKFLOW_NOT_FOUND",
        message: "Workflow not found.",
        retryable: false
      }
    });
    expect(unexpected).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        retryable: true
      }
    });
    expect(JSON.stringify([expected, unexpected])).not.toContain("secret");
    expect(onInternalError).toHaveBeenCalledOnce();
  });

  it("leaves later lifecycle commands and uncorrelatable input unhandled", async () => {
    await expect(
      handleSdkV1LifecycleRpc(
        { command: "submit_job", request_id: "request-1", data: {} },
        options()
      )
    ).resolves.toBeNull();
    await expect(
      handleSdkV1LifecycleRpc(
        { command: "get_capabilities", request_id: "", data: {} },
        options()
      )
    ).resolves.toBeNull();
  });
});
