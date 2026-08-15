/**
 * Tests for the client-direct upload procedures: `assets.createUpload` mints
 * a target for a key the *server* picks, and `assets.finalizeUpload` records
 * what actually landed rather than what the client claimed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetCreate: vi.fn(),
  assetFind: vi.fn(),
  generateThumb: vi.fn(),
  adapter: {
    createUploadUrl: vi.fn() as ReturnType<typeof vi.fn> | undefined,
    stat: vi.fn(),
    delete: vi.fn(),
    uriForKey: (key: string) => `file:///assets/${key}`,
    store: vi.fn(),
    retrieve: vi.fn()
  }
}));
const { assetCreate, assetFind, generateThumb, adapter } = mocks;

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Asset: {
      ...actual.Asset,
      create: mocks.assetCreate,
      find: mocks.assetFind
    }
  };
});

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => mocks.adapter
}));

vi.mock("../src/lib/thumbnail.js", async (orig) => {
  const actual = await orig<typeof import("../src/lib/thumbnail.js")>();
  return { ...actual, generateThumbnailForStoredAsset: mocks.generateThumb };
});

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId = "user-1"): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

function pendingAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    user_id: "user-1",
    parent_id: "user-1",
    name: "pic.png",
    content_type: "image/png",
    size: null,
    metadata: null,
    workflow_id: null,
    node_id: null,
    job_id: null,
    timeline_id: null,
    duration: null,
    sketch_document_id: null,
    created_at: "2026-07-27T00:00:00Z",
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["NODETOOL_MAX_UPLOAD_BYTES"];
  adapter.createUploadUrl.mockResolvedValue({
    url: "https://xyz.supabase.co/storage/v1/object/upload/sign/assets/user-1/a1.png?token=t",
    method: "PUT",
    headers: { "content-type": "image/png" },
    expiresAt: 1_800_000_000_000
  });
});

describe("assets.createUpload", () => {
  it("assigns an owner-prefixed key the client never chose", async () => {
    assetCreate.mockResolvedValue(pendingAsset());
    const result = await createCaller(makeCtx()).assets.createUpload({
      name: "pic.png",
      content_type: "image/png",
      parent_id: "user-1",
      size: 1024
    });

    expect(result.key).toBe("user-1/a1.png");
    expect(result.asset_id).toBe("a1");
    expect(adapter.createUploadUrl).toHaveBeenCalledWith("user-1/a1.png", {
      contentType: "image/png"
    });
    expect(result.upload?.method).toBe("PUT");
  });

  it("creates the row owned by the caller, with size left unset", async () => {
    assetCreate.mockResolvedValue(pendingAsset());
    await createCaller(makeCtx()).assets.createUpload({
      name: "pic.png",
      content_type: "image/png",
      parent_id: "user-1",
      size: 1024
    });
    expect(assetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", size: null })
    );
  });

  it("files an upload with no parent under the caller's root folder", async () => {
    // Regression: the node property dropzones upload without a folder, and a
    // required parent_id rejected every one of them with a 400 — a picked
    // file never reached the property.
    assetCreate.mockResolvedValue(pendingAsset());
    await createCaller(makeCtx()).assets.createUpload({
      name: "doc.pdf",
      content_type: "application/pdf",
      parent_id: "",
      size: 1024
    });
    expect(assetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "user-1" })
    );
  });

  it("rejects a declared size over the cap before minting anything", async () => {
    process.env["NODETOOL_MAX_UPLOAD_BYTES"] = "1000";
    await expect(
      createCaller(makeCtx()).assets.createUpload({
        name: "big.png",
        content_type: "image/png",
        parent_id: "user-1",
        size: 5000
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(assetCreate).not.toHaveBeenCalled();
    expect(adapter.createUploadUrl).not.toHaveBeenCalled();
  });

  it("assigns a .glb key for model/gltf-binary", async () => {
    assetCreate.mockResolvedValue(
      pendingAsset({ id: "m1", content_type: "model/gltf-binary", name: "Untitled.glb" })
    );
    const result = await createCaller(makeCtx()).assets.createUpload({
      name: "Untitled.glb",
      content_type: "model/gltf-binary",
      parent_id: "user-1",
      size: 2012
    });
    expect(result.key).toBe("user-1/m1.glb");
  });

  it("infers model/gltf-binary from a .glb name when the type is generic", async () => {
    assetCreate.mockImplementation(async (row: Record<string, unknown>) =>
      pendingAsset({ id: "m1", ...row })
    );
    const result = await createCaller(makeCtx()).assets.createUpload({
      name: "Duck.glb",
      content_type: "application/octet-stream",
      parent_id: "user-1",
      size: 100
    });
    expect(assetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ content_type: "model/gltf-binary" })
    );
    expect(result.key).toBe("user-1/m1.glb");
  });

  it("returns a null target on a backend with no direct upload and creates no row", async () => {
    const restore = adapter.createUploadUrl;
    adapter.createUploadUrl = undefined;
    try {
      const result = await createCaller(makeCtx()).assets.createUpload({
        name: "pic.png",
        content_type: "image/png",
        parent_id: "user-1",
        size: 1024
      });
      expect(result.upload).toBeNull();
      expect(assetCreate).not.toHaveBeenCalled();
    } finally {
      adapter.createUploadUrl = restore;
    }
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      createCaller({ ...makeCtx(), userId: null } as Context).assets.createUpload(
        {
          name: "pic.png",
          content_type: "image/png",
          parent_id: "user-1",
          size: 1
        }
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("assets.finalizeUpload", () => {
  it("records the size read off the object, not the client's claim", async () => {
    const asset = pendingAsset();
    assetFind.mockResolvedValue(asset);
    adapter.stat.mockResolvedValue({ key: "user-1/a1.png", size: 4096, modifiedAt: 0 });

    const result = await createCaller(makeCtx()).assets.finalizeUpload({
      asset_id: "a1"
    });

    expect(adapter.stat).toHaveBeenCalledWith("file:///assets/user-1/a1.png");
    expect(asset.size).toBe(4096);
    expect(asset.save).toHaveBeenCalled();
    expect(result.size).toBe(4096);
  });

  it("deletes the pending row when nothing was uploaded", async () => {
    const asset = pendingAsset();
    assetFind.mockResolvedValue(asset);
    adapter.stat.mockResolvedValue(null);

    await expect(
      createCaller(makeCtx()).assets.finalizeUpload({ asset_id: "a1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(asset.delete).toHaveBeenCalled();
  });

  it("treats a zero-byte object as no upload", async () => {
    const asset = pendingAsset();
    assetFind.mockResolvedValue(asset);
    adapter.stat.mockResolvedValue({ key: "user-1/a1.png", size: 0, modifiedAt: 0 });

    await expect(
      createCaller(makeCtx()).assets.finalizeUpload({ asset_id: "a1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(asset.delete).toHaveBeenCalled();
  });

  it("removes an over-cap object instead of keeping it", async () => {
    process.env["NODETOOL_MAX_UPLOAD_BYTES"] = "1000";
    const asset = pendingAsset();
    assetFind.mockResolvedValue(asset);
    adapter.stat.mockResolvedValue({ key: "user-1/a1.png", size: 9999, modifiedAt: 0 });

    await expect(
      createCaller(makeCtx()).assets.finalizeUpload({ asset_id: "a1" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(adapter.delete).toHaveBeenCalledWith(
      "file:///assets/user-1/a1.png"
    );
    expect(asset.delete).toHaveBeenCalled();
  });

  it("does not finalize another user's asset", async () => {
    assetFind.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx("user-b")).assets.finalizeUpload({ asset_id: "a1" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(assetFind).toHaveBeenCalledWith("user-b", "a1");
  });

  it("skips the thumbnail download for an oversized object", async () => {
    const asset = pendingAsset({ content_type: "video/mp4", name: "clip.mp4" });
    assetFind.mockResolvedValue(asset);
    adapter.stat.mockResolvedValue({
      key: "user-1/a1.mp4",
      size: 200 * 1024 * 1024,
      modifiedAt: 0
    });

    await createCaller(makeCtx()).assets.finalizeUpload({ asset_id: "a1" });
    expect(generateThumb).not.toHaveBeenCalled();
  });

  it("generates a thumbnail for an ordinary-sized object", async () => {
    const asset = pendingAsset();
    assetFind.mockResolvedValue(asset);
    adapter.stat.mockResolvedValue({ key: "user-1/a1.png", size: 4096, modifiedAt: 0 });

    await createCaller(makeCtx()).assets.finalizeUpload({ asset_id: "a1" });
    expect(generateThumb).toHaveBeenCalledWith("user-1", "a1", "image/png");
  });
});
