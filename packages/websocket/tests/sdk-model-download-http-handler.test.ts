import { describe, expect, it, vi } from "vitest";
import type {
  SdkV1ModelDownloadSnapshot,
  SdkV1ModelDownloadState
} from "@nodetool-ai/protocol/api-schemas/sdk-models-v1.js";
import {
  handleSdkV1ModelDownloadCancel,
  handleSdkV1ModelDownloads,
  handleSdkV1ModelDownloadStart
} from "../src/sdk/sdk-model-download-http-handler.js";
import {
  SdkModelDownloadServiceError,
  type SdkV1ModelDownloadService
} from "../src/sdk/sdk-model-download-service.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";

const state: SdkV1ModelDownloadState = {
  version: "1",
  operation_id: "mdl_test",
  scope: "local",
  repo_id: "org/model",
  path: null,
  model_type: "hf.text_generation",
  status: "start",
  downloaded_bytes: 0,
  total_bytes: 0,
  downloaded_files: 0,
  current_files: [],
  total_files: 0,
  error: null,
  started_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z"
};

function options(service: SdkV1ModelDownloadService) {
  return {
    boundary: createSdkV1ImplementationBoundary(
      createSdkV1Service({ modelDownloadService: service })
    ),
    getUserId: () => "alice",
    onInternalError: vi.fn()
  };
}

function service(overrides: Partial<SdkV1ModelDownloadService> = {}) {
  return {
    start: vi.fn(() => state),
    list: vi.fn(
      (): SdkV1ModelDownloadSnapshot => ({
        version: "1",
        downloads: [state]
      })
    ),
    cancel: vi.fn(() => ({ ...state, status: "cancelled" as const })),
    ...overrides
  } satisfies SdkV1ModelDownloadService;
}

describe("SDK model download HTTP handlers", () => {
  it("starts a bounded validated download for the authenticated principal", async () => {
    const implementation = service();
    const response = await handleSdkV1ModelDownloadStart(
      new Request("http://localhost/api/sdk/v1/model-downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo_id: "org/model",
          model_type: "hf.text_generation"
        })
      }),
      options(implementation)
    );

    expect(response.status).toBe(202);
    expect(implementation.start).toHaveBeenCalledWith({
      userId: "alice",
      request: {
        repo_id: "org/model",
        model_type: "hf.text_generation",
        scope: "local"
      }
    });
  });

  it("lists and filters reconnectable state", async () => {
    const implementation = service();
    const response = await handleSdkV1ModelDownloads(
      new Request(
        "http://localhost/api/sdk/v1/model-downloads?scope=local&operation_id=mdl_test"
      ),
      options(implementation)
    );

    expect(response.status).toBe(200);
    expect(implementation.list).toHaveBeenCalledWith({
      userId: "alice",
      query: { scope: "local", operation_id: "mdl_test" }
    });
  });

  it("cancels by opaque operation id", async () => {
    const implementation = service();
    const response = await handleSdkV1ModelDownloadCancel(
      new Request("http://localhost/api/sdk/v1/model-downloads/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation_id: "mdl_test" })
      }),
      options(implementation)
    );

    expect(response.status).toBe(200);
    expect(implementation.cancel).toHaveBeenCalledWith({
      userId: "alice",
      operationId: "mdl_test"
    });
  });

  it("rejects invalid patterns and preserves service status codes", async () => {
    const invalid = await handleSdkV1ModelDownloadStart(
      new Request("http://localhost/api/sdk/v1/model-downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo_id: "org/model",
          path: "model.bin",
          model_type: "hf.text_generation",
          allow_patterns: ["*.bin"]
        })
      }),
      options(service())
    );
    expect(invalid.status).toBe(400);

    const unavailable = await handleSdkV1ModelDownloads(
      new Request("http://localhost/api/sdk/v1/model-downloads?scope=worker"),
      options(
        service({
          list: () => {
            throw new SdkModelDownloadServiceError(
              501,
              "MODEL_SCOPE_UNAVAILABLE",
              "Worker unavailable"
            );
          }
        })
      )
    );
    expect(unavailable.status).toBe(501);
    expect(await unavailable.json()).toMatchObject({
      code: "MODEL_SCOPE_UNAVAILABLE"
    });
  });
});
