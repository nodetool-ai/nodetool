/**
 * Regressions for the assets router:
 *
 *  - deleting an asset removes its stored bytes and thumbnail, not just the
 *    row (which used to leave every object orphaned forever);
 *  - `update` refuses a `parent_id` that would create a folder cycle, and the
 *    recursive helpers terminate even when one already exists in the data.
 *    With synchronous better-sqlite3 a cycle starves the event loop and wedges
 *    the process, so both layers have to hold.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetFind: vi.fn(),
  getChildren: vi.fn(),
  validateParent: vi.fn(),
  existing: new Set<string>(),
  deleted: [] as string[],
  deleteImpl: vi.fn(async (_uri: string) => {}),
  adapter: {
    uriForKey: (key: string) => `file:///assets/${key}`,
    exists: vi.fn(),
    delete: vi.fn(),
    stat: vi.fn(),
    store: vi.fn(),
    retrieve: vi.fn(),
    createUploadUrl: undefined
  }
}));

mocks.adapter.exists.mockImplementation(async (uri: string) =>
  mocks.existing.has(uri.replace("file:///assets/", ""))
);
mocks.adapter.delete.mockImplementation(async (uri: string) => {
  const key = uri.replace("file:///assets/", "");
  await mocks.deleteImpl(key);
  mocks.deleted.push(key);
});

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Asset: {
      ...actual.Asset,
      find: mocks.assetFind,
      getChildren: mocks.getChildren,
      validateParent: mocks.validateParent,
      paginate: vi.fn(),
      searchAssetsGlobal: vi.fn()
    }
  };
});

vi.mock("../src/lib/storage.js", () => ({
  getAssetAdapter: () => mocks.adapter
}));

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

function makeAsset(opts: {
  id: string;
  content_type?: string;
  parent_id?: string | null;
  user_id?: string;
}) {
  return {
    id: opts.id,
    user_id: opts.user_id ?? "user-1",
    parent_id: opts.parent_id ?? "user-1",
    name: opts.id,
    content_type: opts.content_type ?? "image/png",
    size: 1,
    metadata: null,
    sketch_document_id: null,
    workflow_id: null,
    node_id: null,
    job_id: null,
    timeline_id: null,
    created_at: "2026-04-17T00:00:00Z",
    duration: null,
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

/** Route Asset.find/getChildren against an in-memory tree. */
function installTree(assets: ReturnType<typeof makeAsset>[]): void {
  const byId = new Map(assets.map((a) => [a.id, a]));
  mocks.assetFind.mockImplementation(async (_userId: string, id: string) =>
    byId.get(id) ?? null
  );
  mocks.getChildren.mockImplementation(async (_userId: string, pid: string) =>
    assets.filter((a) => a.parent_id === pid)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing.clear();
  mocks.deleted.length = 0;
  mocks.deleteImpl.mockImplementation(async () => {});
});

describe("assets.delete removes stored objects", () => {
  it("deletes the object and its thumbnail for a single asset", async () => {
    const a = makeAsset({ id: "a1", content_type: "image/png" });
    installTree([a]);
    mocks.existing.add("user-1/a1.png");
    mocks.existing.add("user-1/a1_thumb.jpg");

    const result = await createCaller(makeCtx()).assets.delete({ id: "a1" });

    expect(result.deleted_asset_ids).toEqual(["a1"]);
    expect(mocks.deleted).toEqual(["user-1/a1.png", "user-1/a1_thumb.jpg"]);
    expect(a.delete).toHaveBeenCalled();
  });

  it("also removes flat legacy keys written before the owner prefix", async () => {
    const a = makeAsset({ id: "a1", content_type: "image/png" });
    installTree([a]);
    mocks.existing.add("a1.png");

    await createCaller(makeCtx()).assets.delete({ id: "a1" });

    expect(mocks.deleted).toEqual(["a1.png"]);
  });

  it("deletes bytes for every asset in a recursive folder delete", async () => {
    const folder = makeAsset({ id: "folder", content_type: "folder" });
    const child = makeAsset({
      id: "c1",
      content_type: "image/png",
      parent_id: "folder"
    });
    const sub = makeAsset({
      id: "sub",
      content_type: "folder",
      parent_id: "folder"
    });
    const grandchild = makeAsset({
      id: "gc",
      content_type: "image/png",
      parent_id: "sub"
    });
    installTree([folder, child, sub, grandchild]);
    mocks.existing.add("user-1/c1.png");
    mocks.existing.add("user-1/gc.png");

    const result = await createCaller(makeCtx()).assets.delete({
      id: "folder"
    });

    expect(result.deleted_asset_ids).toEqual(["c1", "gc", "sub", "folder"]);
    expect(mocks.deleted).toEqual(["user-1/c1.png", "user-1/gc.png"]);
  });

  it("keeps going when one object fails to delete", async () => {
    const folder = makeAsset({ id: "folder", content_type: "folder" });
    const bad = makeAsset({
      id: "bad",
      content_type: "image/png",
      parent_id: "folder"
    });
    const good = makeAsset({
      id: "good",
      content_type: "image/png",
      parent_id: "folder"
    });
    installTree([folder, bad, good]);
    mocks.existing.add("user-1/bad.png");
    mocks.existing.add("user-1/good.png");
    mocks.deleteImpl.mockImplementation(async (key: string) => {
      if (key === "user-1/bad.png") throw new Error("storage unavailable");
    });

    const result = await createCaller(makeCtx()).assets.delete({
      id: "folder"
    });

    expect(result.deleted_asset_ids).toEqual(["bad", "good", "folder"]);
    expect(mocks.deleted).toEqual(["user-1/good.png"]);
    expect(good.delete).toHaveBeenCalled();
  });
});

/**
 * The parent rule moved onto `Asset.validateParent` when the sandbox's
 * `update_asset` capability grew a second caller for it, and is covered
 * against a real database in packages/models/tests/asset-parent-cycle.ts.
 * What is this route's to get right is turning the model's answer into an
 * HTTP error rather than applying the move.
 */
describe("assets.update parent validation", () => {
  it("refuses the move and reports the model's own reason", async () => {
    const a = makeAsset({ id: "a1" });
    installTree([a]);
    mocks.validateParent.mockResolvedValue("Parent must be a folder");

    await expect(
      createCaller(makeCtx()).assets.update({ id: "a1", parent_id: "f1" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Parent must be a folder"
    });
    expect(a.parent_id).toBe("user-1");
  });

  it("applies the move when the model raises no objection", async () => {
    const a = makeAsset({ id: "a1" });
    installTree([a]);
    mocks.validateParent.mockResolvedValue(null);

    await createCaller(makeCtx()).assets.update({
      id: "a1",
      parent_id: "dest"
    });
    expect(mocks.validateParent).toHaveBeenCalledWith("user-1", a, "dest");
    expect(a.parent_id).toBe("dest");
  });
});

describe("recursive helpers survive a pre-existing cycle", () => {
  /** A -> B -> A, with a file in each. */
  function cyclicTree() {
    const a = makeAsset({ id: "A", content_type: "folder", parent_id: "B" });
    const b = makeAsset({ id: "B", content_type: "folder", parent_id: "A" });
    const fa = makeAsset({ id: "fa", parent_id: "A" });
    const fb = makeAsset({ id: "fb", parent_id: "B" });
    installTree([a, b, fa, fb]);
    return { a, b, fa, fb };
  }

  it("assets.delete terminates instead of hanging", async () => {
    cyclicTree();
    const result = await createCaller(makeCtx()).assets.delete({ id: "A" });
    expect([...result.deleted_asset_ids].sort()).toEqual([
      "A",
      "B",
      "fa",
      "fb"
    ]);
  });

  it("assets.recursive terminates instead of hanging", async () => {
    cyclicTree();
    const result = await createCaller(makeCtx()).assets.recursive({ id: "A" });
    expect(result.assets.map((x) => x.id).sort()).toEqual([
      "A",
      "B",
      "fa",
      "fb"
    ]);
  });
});
