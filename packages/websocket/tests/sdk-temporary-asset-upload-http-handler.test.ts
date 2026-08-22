import { describe, expect, it, vi } from "vitest";
import {
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { handleSdkV1TemporaryAssetUpload } from "../src/sdk/sdk-temporary-asset-upload-http-handler.js";
import { createSdkV1TemporaryAssetService } from "../src/sdk/sdk-temporary-asset-service.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import { createSdkV1Service } from "../src/sdk/sdk-v1-service.js";

function uploadRequest(bytes: Uint8Array = new Uint8Array([1, 2, 3])): Request {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "input.png");
  return new Request("http://localhost/api/sdk/v1/assets/temporary", {
    method: "POST",
    body: form
  });
}

function boundary(input: {
  storage: StorageAdapter;
  createId?: () => string;
  getConfiguredMaxUploadBytes?: () => number;
  environment?: NodeJS.ProcessEnv;
}) {
  return createSdkV1ImplementationBoundary(
    createSdkV1Service({
      temporaryAssetService: createSdkV1TemporaryAssetService({
        getStorage: () => input.storage,
        createId: input.createId,
        getConfiguredMaxUploadBytes: input.getConfiguredMaxUploadBytes
      }),
      getEnvironment: () => input.environment ?? {}
    })
  );
}

describe("SDK temporary asset upload", () => {
  it("stores bytes directly without creating persistent asset metadata", async () => {
    const storage = new InMemoryStorageAdapter();
    const store = vi.spyOn(storage, "store");
    let internalError: unknown;

    const response = await handleSdkV1TemporaryAssetUpload(uploadRequest(), {
      boundary: boundary({
        storage,
        createId: () => "upload-id",
        getConfiguredMaxUploadBytes: () => 1024
      }),
      getConfiguredMaxUploadBytes: () => 1024,
      onInternalError: (error) => {
        internalError = error;
      }
    });

    expect(response.status, String(internalError)).toBe(200);
    expect(await response.json()).toEqual({
      version: 1,
      uri: "memory://temp/sdk-inputs/upload-id.png",
      name: "input.png",
      content_type: "image/png",
      size: 3,
      expires_at: null
    });
    expect(store).toHaveBeenCalledOnce();
    expect(
      await storage.retrieve("memory://temp/sdk-inputs/upload-id.png")
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("enforces the configured upload limit before storage", async () => {
    const storage = new InMemoryStorageAdapter();
    const store = vi.spyOn(storage, "store");

    const response = await handleSdkV1TemporaryAssetUpload(uploadRequest(), {
      boundary: boundary({
        storage,
        getConfiguredMaxUploadBytes: () => 2
      }),
      getConfiguredMaxUploadBytes: () => 2
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: "UPLOAD_TOO_LARGE",
      retryable: false
    });
    expect(store).not.toHaveBeenCalled();
  });

  it("does not expose a server-local file path", async () => {
    const storage = {
      store: vi.fn(async () => "file:///C:/private/assets/temp/input.png")
    } as unknown as StorageAdapter;

    const response = await handleSdkV1TemporaryAssetUpload(uploadRequest(), {
      boundary: boundary({
        storage,
        createId: () => "upload-id",
        getConfiguredMaxUploadBytes: () => 1024
      }),
      getConfiguredMaxUploadBytes: () => 1024
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uri: "/api/storage/temp/sdk-inputs/upload-id.png"
    });
  });

  it("is unavailable with the lifecycle kill switch", async () => {
    const response = await handleSdkV1TemporaryAssetUpload(uploadRequest(), {
      boundary: boundary({
        storage: new InMemoryStorageAdapter(),
        environment: { NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1" }
      })
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "SDK_LIFECYCLE_DISABLED"
    });
  });
});
