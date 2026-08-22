import { describe, expect, it, vi } from "vitest";
import type {
  SdkV1PreflightRequest,
  SdkV1PreflightSummary
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import {
  SdkV1PreflightServiceError,
  type SdkV1PreflightPrincipal
} from "../src/sdk/sdk-preflight-orchestrator.js";
import { handleSdkV1Preflight } from "../src/sdk/sdk-preflight-http-handler.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";
import { requestSdkV1Route } from "./sdk-v1-fastify-test-helper.js";

const requestBody: SdkV1PreflightRequest = {
  workflow_id: "workflow-1",
  workspace_id: null,
  workflow_etag: "etag-1",
  interface_version: 1,
  level: "static",
  inputs: { text: "hello" }
};

const summary: SdkV1PreflightSummary = {
  version: 1,
  level: "static",
  workflow_id: "workflow-1",
  workflow_etag: "etag-1",
  runnable: true,
  issues: [],
  requirements: [],
  cost: null
};

function request(
  body: unknown = requestBody,
  init: Omit<RequestInit, "body"> = {}
): Request {
  return new Request("http://localhost/api/sdk/v1/preflight", {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function enabledOptions(
  overrides: {
    preflight?: (input: {
      request: SdkV1PreflightRequest;
      principal: SdkV1PreflightPrincipal;
    }) => Promise<SdkV1PreflightSummary>;
    getPrincipal?: () => SdkV1PreflightPrincipal | null;
    onInternalError?: (error: unknown) => void;
  } = {}
) {
  const service = {
    preflight: overrides.preflight ?? vi.fn(async () => summary)
  };
  return {
    boundary: createSdkV1ImplementationBoundary(
      createSdkV1Service({
        preflightService: service,
        getEnvironment: () => ({
          NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0"
        })
      })
    ),
    service,
    getPrincipal:
      overrides.getPrincipal ?? vi.fn(() => ({ userId: "authenticated-user" })),
    onInternalError: overrides.onInternalError
  };
}

describe("standalone SDK preflight HTTP handler", () => {
  it("honors the server kill switch before parsing or resolving a principal", async () => {
    const preflight = vi.fn(async () => summary);
    const getPrincipal = vi.fn(() => ({ userId: "authenticated-user" }));
    const response = await handleSdkV1Preflight(request("{"), {
      boundary: createSdkV1ImplementationBoundary(
        createSdkV1Service({
          preflightService: { preflight },
          getEnvironment: () => ({
            NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1"
          })
        })
      ),
      getPrincipal
    });

    expect(response.status).toBe(503);
    expect(preflight).not.toHaveBeenCalled();
    expect(getPrincipal).not.toHaveBeenCalled();
  });

  it("passes the validated request and authenticated principal to the service", async () => {
    const preflight = vi.fn(async () => summary);
    const response = await handleSdkV1Preflight(
      request(),
      enabledOptions({ preflight })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(preflight).toHaveBeenCalledWith({
      request: requestBody,
      principal: { userId: "authenticated-user" }
    });
  });

  it.each([
    [
      request(requestBody, {
        headers: { "content-type": "text/plain" }
      }),
      415,
      "UNSUPPORTED_MEDIA_TYPE"
    ],
    [request("{"), 400, "INVALID_REQUEST"],
    [request({ workflow_id: "" }), 400, "INVALID_REQUEST"]
  ])("rejects invalid transport input", async (input, status, code) => {
    const options = enabledOptions();
    const response = await handleSdkV1Preflight(input, options);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(options.service.preflight).not.toHaveBeenCalled();
  });

  it("requires an authenticated principal without trusting caller headers", async () => {
    const options = enabledOptions({ getPrincipal: () => null });
    const response = await handleSdkV1Preflight(
      request(requestBody, {
        headers: {
          "content-type": "application/json",
          "x-user-id": "spoofed-user"
        }
      }),
      options
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "AUTHENTICATION_REQUIRED"
    });
    expect(options.service.preflight).not.toHaveBeenCalled();
  });

  it.each([
    [
      "WORKFLOW_NOT_FOUND" as const,
      404,
      "Workflow not found.",
      "secret source detail"
    ],
    [
      "PREFLIGHT_LEVEL_UNAVAILABLE" as const,
      503,
      "Requested preflight level is not available.",
      "secret target detail"
    ]
  ])(
    "maps expected service error %s through an allowlisted message",
    async (code, status, message, internalMessage) => {
      const response = await handleSdkV1Preflight(
        request(),
        enabledOptions({
          preflight: async () => {
            throw new SdkV1PreflightServiceError(code, internalMessage, false);
          }
        })
      );

      expect(response.status).toBe(status);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({
        code,
        message,
        retryable: false,
        detail: message
      });
      expect(body).not.toContain(internalMessage);
    }
  );

  it("redacts unexpected service and diagnostic failures", async () => {
    const response = await handleSdkV1Preflight(
      request(),
      enabledOptions({
        preflight: async () => {
          throw new Error("secret database detail");
        },
        onInternalError: () => {
          throw new Error("logger unavailable");
        }
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      retryable: true,
      detail: "Internal server error"
    });
  });

  it("is registered in the Fastify route plugin and honors the kill switch", async () => {
    vi.stubEnv("NODETOOL_DISABLE_SDK_LIFECYCLE_V1", "1");
    const response = await requestSdkV1Route(request(), {});

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "SDK_LIFECYCLE_DISABLED"
    });
    vi.unstubAllEnvs();
  });

  it("dispatches through the Fastify route plugin with the authenticated principal", async () => {
    vi.stubEnv("NODETOOL_DISABLE_SDK_LIFECYCLE_V1", "0");
    const preflight = vi.fn(async () => summary);
    try {
      const response = await requestSdkV1Route(
        request(requestBody, {
          headers: {
            "content-type": "application/json",
            "x-user-id": "user-7"
          }
        }),
        {
          sdkV1Boundary: createSdkV1ImplementationBoundary(
            createSdkV1Service({
              preflightService: { preflight },
              getEnvironment: () => ({
                NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "0"
              })
            })
          )
        }
      );

      expect(response.status).toBe(200);
      expect(preflight).toHaveBeenCalledWith({
        request: requestBody,
        principal: { userId: "user-7" }
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
