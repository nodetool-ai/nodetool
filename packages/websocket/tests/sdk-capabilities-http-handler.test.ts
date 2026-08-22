import { describe, expect, it, vi } from "vitest";
import type { SdkV1Capabilities } from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import { handleApiRequest } from "../src/http-api.js";
import { handleSdkV1Capabilities } from "../src/sdk/sdk-capabilities-http-handler.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";

const capabilities = {
  protocol_version: "1",
  nodetool_version: "test",
  server_time: "2026-07-25T10:00:00.000Z",
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
} satisfies SdkV1Capabilities;

const request = (method = "GET") =>
  new Request("http://localhost/api/sdk/v1/capabilities", { method });

function boundary(input: {
  getCapabilities: () => SdkV1Capabilities;
  environment?: NodeJS.ProcessEnv;
}) {
  return createSdkV1ImplementationBoundary(
    createSdkV1Service({
      getCapabilities: input.getCapabilities,
      getEnvironment: () => input.environment ?? {}
    })
  );
}

describe("standalone SDK capabilities HTTP handler", () => {
  it("honors the server kill switch without evaluating runtime state", async () => {
    const getCapabilities = vi.fn(() => capabilities);
    const response = await handleSdkV1Capabilities(request(), {
      boundary: boundary({
        getCapabilities,
        environment: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" }
      })
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "SDK_LIFECYCLE_DISABLED",
      message: "SDK lifecycle v1 is disabled",
      retryable: false,
      detail: "SDK lifecycle v1 is disabled"
    });
    expect(getCapabilities).not.toHaveBeenCalled();
  });

  it("returns a capability snapshot by default", async () => {
    const response = await handleSdkV1Capabilities(request(), {
      boundary: boundary({ getCapabilities: () => capabilities })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(capabilities);
  });

  it("redacts unexpected provider failures", async () => {
    const onInternalError = vi.fn();
    const response = await handleSdkV1Capabilities(request(), {
      boundary: boundary({
        getCapabilities: () => {
          throw new Error("secret backend detail");
        },
        environment: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0" }
      }),
      onInternalError
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      retryable: true,
      detail: "Internal server error"
    });
    expect(onInternalError).toHaveBeenCalledOnce();
  });

  it("still redacts failures when the diagnostic callback also throws", async () => {
    const response = await handleSdkV1Capabilities(request(), {
      boundary: boundary({
        getCapabilities: () => {
          throw new Error("secret provider detail");
        },
        environment: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0" }
      }),
      onInternalError: () => {
        throw new Error("logger unavailable");
      }
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error"
    });
  });

  it("rejects unsupported methods before evaluating the provider", async () => {
    const getCapabilities = vi.fn(() => capabilities);
    const response = await handleSdkV1Capabilities(request("POST"), {
      boundary: boundary({
        getCapabilities,
        environment: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0" }
      })
    });

    expect(response.status).toBe(405);
    expect(getCapabilities).not.toHaveBeenCalled();
  });

  it("is registered and default-on in the HTTP dispatcher", async () => {
    const response = await handleApiRequest(request(), {
      sdkV1Boundary: boundary({ getCapabilities: () => capabilities })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(capabilities);
  });

  it("uses an injected live provider through the HTTP dispatcher", async () => {
    vi.stubEnv("NODETOOL_DISABLE_SDK_LIFECYCLE_V1", "0");
    try {
      const response = await handleApiRequest(request(), {
        sdkV1Boundary: boundary({ getCapabilities: () => capabilities })
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(capabilities);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
