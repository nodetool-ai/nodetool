/**
 * Saving an asset over the storage size limit answers 413 with a message the
 * editor can show. Production hit this when the Supabase project's global
 * file size limit rejected an edited .glb, and `assets.update` answered 500.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { UploadTooLargeError } from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({
  assetFind: vi.fn(),
  adapter: {
    uriForKey: (key: string) => `supabase://assets/${key}`,
    store: vi.fn()
  }
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Asset: {
      ...actual.Asset,
      find: mocks.assetFind,
      // Statics are non-enumerable, so the spread above does not carry them.
      systemEntityRefusal: actual.Asset.systemEntityRefusal
    }
  };
});

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: () => mocks.adapter
}));

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const model = {
  id: "m1",
  user_id: "user-1",
  parent_id: "user-1",
  name: "plane.glb",
  content_type: "model/gltf-binary",
  size: 2012,
  metadata: null,
  external_path: null,
  save: vi.fn().mockResolvedValue(undefined)
};

const data = Buffer.from("glTF-bytes").toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assetFind.mockResolvedValue(model);
});

describe("assets.update over the storage size limit", () => {
  it("answers PAYLOAD_TOO_LARGE with the file size and leaves the row alone", async () => {
    mocks.adapter.store.mockRejectedValue(
      new UploadTooLargeError(
        'Supabase upload failed for "user-1/m1.glb": The object exceeded the maximum allowed size',
        60 * 1024 * 1024,
        null
      )
    );

    await expect(
      createCaller(makeCtx()).assets.update({
        id: "m1",
        data,
        data_encoding: "base64"
      })
    ).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      message:
        "This file is 60.0 MB, which is over the storage limit, so it was not saved."
    });
    expect(model.save).not.toHaveBeenCalled();
  });

  it("names the limit when storage reports it", async () => {
    mocks.adapter.store.mockRejectedValue(
      new UploadTooLargeError("too big", 3 * 1024 * 1024, 2 * 1024 * 1024)
    );

    await expect(
      createCaller(makeCtx()).assets.update({
        id: "m1",
        data,
        data_encoding: "base64"
      })
    ).rejects.toMatchObject({
      message:
        "This file is 3.0 MB, which is over the 2 MB limit, so it was not saved."
    });
  });

  it("still answers 500 for other storage failures", async () => {
    mocks.adapter.store.mockRejectedValue(new Error("Bucket full"));

    await expect(
      createCaller(makeCtx()).assets.update({
        id: "m1",
        data,
        data_encoding: "base64"
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
