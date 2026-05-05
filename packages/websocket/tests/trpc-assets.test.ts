import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool-ai/models — router orchestrates Asset static + instance methods.
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Asset: {
      ...actual.Asset,
      find: vi.fn(),
      paginate: vi.fn(),
      getChildren: vi.fn(),
      create: vi.fn()
    }
  };
});

// Mock @nodetool-ai/config — `buildAssetUrl` is used by toAssetResponse.
vi.mock("@nodetool-ai/config", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    buildAssetUrl: vi.fn((filename: string) => `/api/storage/${filename}`)
  };
});

// Mock filesystem writes so update() with `data` doesn't hit disk.
vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
  };
});

import { Asset } from "@nodetool-ai/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never, storage: {} } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

function makeAsset(opts: {
  id?: string;
  user_id?: string;
  parent_id?: string | null;
  name?: string;
  content_type?: string;
  size?: number | null;
  metadata?: Record<string, unknown> | null;
  workflow_id?: string | null;
  node_id?: string | null;
  job_id?: string | null;
  created_at?: string;
  updated_at?: string;
  duration?: number | null;
}) {
  return {
    id: opts.id ?? "a1",
    user_id: opts.user_id ?? "user-1",
    parent_id: opts.parent_id ?? "user-1",
    name: opts.name ?? "asset.png",
    content_type: opts.content_type ?? "image/png",
    size: opts.size ?? 1024,
    metadata: opts.metadata ?? null,
    workflow_id: opts.workflow_id ?? null,
    node_id: opts.node_id ?? null,
    job_id: opts.job_id ?? null,
    created_at: opts.created_at ?? "2026-04-17T00:00:00Z",
    updated_at: opts.updated_at ?? "2026-04-17T00:00:00Z",
    duration: opts.duration ?? null,
    get hasThumbnail() {
      return (
        (opts.content_type ?? "image/png").startsWith("image/") ||
        (opts.content_type ?? "image/png").startsWith("video/")
      );
    },
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

describe("assets router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("defaults to home folder when no filters are given", async () => {
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      await caller.assets.list({});
      expect(Asset.paginate).toHaveBeenCalledWith("user-1", {
        parentId: "user-1",
        contentType: undefined,
        workflowId: undefined,
        nodeId: undefined,
        jobId: undefined,
        limit: 10000
      });
    });

    it("does not apply the home-folder default when parent_id is provided", async () => {
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      await caller.assets.list({ parent_id: "folder-1" });
      expect(Asset.paginate).toHaveBeenCalledWith("user-1", {
        parentId: "folder-1",
        contentType: undefined,
        workflowId: undefined,
        nodeId: undefined,
        jobId: undefined,
        limit: 10000
      });
    });

    it("skips the home-folder default when a non-parent filter is active", async () => {
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      await caller.assets.list({ content_type: "image/png" });
      expect(Asset.paginate).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ parentId: undefined, contentType: "image/png" })
      );
    });

    it("maps assets through toAssetResponse with get_url + thumb_url", async () => {
      const a = makeAsset({
        id: "img-1",
        content_type: "image/png",
        updated_at: "2026-04-17T00:00:00Z"
      });
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [a],
        "next-cursor"
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.list({ parent_id: "folder" });
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]?.get_url).toMatch(/^\/api\/storage\//);
      expect(result.assets[0]?.thumb_url).toMatch(/^\/api\/storage\//);
      expect(result.next).toBe("next-cursor");
    });

    it("folder assets have null get_url", async () => {
      const folder = makeAsset({
        id: "f1",
        content_type: "folder",
        name: "My Folder"
      });
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [folder],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.list({ parent_id: "p1" });
      expect(result.assets[0]?.get_url).toBeNull();
      expect(result.assets[0]?.thumb_url).toBeNull();
      expect(result.next).toBeNull();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.assets.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns the asset when the user owns it", async () => {
      const a = makeAsset({ id: "a1" });
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(a);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.get({ id: "a1" });
      expect(result.id).toBe("a1");
    });

    it("returns the synthetic 'Home' folder when id === userId", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.assets.get({ id: "user-1" });
      expect(result).toMatchObject({
        id: "user-1",
        user_id: "user-1",
        parent_id: "",
        name: "Home",
        content_type: "folder"
      });
      expect(Asset.find).not.toHaveBeenCalled();
    });

    it("throws NOT_FOUND when the asset does not exist", async () => {
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.assets.get({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── create ──────────────────────────────────────────────────────
  describe("create", () => {
    it("creates an asset with required fields", async () => {
      const created = makeAsset({ id: "new", name: "pic.png" });
      (Asset.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.create({
        name: "pic.png",
        content_type: "image/png",
        parent_id: "folder-1"
      });
      expect(Asset.create).toHaveBeenCalledWith({
        user_id: "user-1",
        name: "pic.png",
        content_type: "image/png",
        parent_id: "folder-1",
        workflow_id: null,
        node_id: null,
        job_id: null,
        metadata: null,
        size: null
      });
      expect(result.id).toBe("new");
    });

    it("passes through optional workflow/node/job/metadata/size", async () => {
      const created = makeAsset({ id: "new" });
      (Asset.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const caller = createCaller(makeCtx());
      await caller.assets.create({
        name: "x.bin",
        content_type: "application/octet-stream",
        parent_id: "user-1",
        workflow_id: "wf-1",
        node_id: "node-1",
        job_id: "job-1",
        metadata: { a: 1 },
        size: 42
      });
      expect(Asset.create).toHaveBeenCalledWith({
        user_id: "user-1",
        name: "x.bin",
        content_type: "application/octet-stream",
        parent_id: "user-1",
        workflow_id: "wf-1",
        node_id: "node-1",
        job_id: "job-1",
        metadata: { a: 1 },
        size: 42
      });
    });
  });

  // ── update ──────────────────────────────────────────────────────
  describe("update", () => {
    it("updates basic fields (name, parent_id, metadata)", async () => {
      const a = makeAsset({ id: "a1", name: "old", parent_id: "p1" });
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(a);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.update({
        id: "a1",
        name: "new",
        parent_id: "p2",
        metadata: { k: "v" }
      });
      expect(a.name).toBe("new");
      expect(a.parent_id).toBe("p2");
      expect(a.metadata).toEqual({ k: "v" });
      expect(a.save).toHaveBeenCalled();
      expect(result.name).toBe("new");
    });

    it("writes base64 data to storage when provided", async () => {
      const a = makeAsset({ id: "a1" });
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(a);

      const caller = createCaller(makeCtx());
      await caller.assets.update({
        id: "a1",
        data: Buffer.from("hello").toString("base64"),
        data_encoding: "base64"
      });
      // size is set to the byteLength of the decoded buffer.
      expect(a.size).toBe(5);
    });

    it("throws NOT_FOUND when the asset does not exist", async () => {
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.assets.update({ id: "missing", name: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── delete ──────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes a non-folder asset and returns its id", async () => {
      const a = makeAsset({ id: "a1", content_type: "image/png" });
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(a);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.delete({ id: "a1" });
      expect(a.delete).toHaveBeenCalled();
      expect(result.deleted_asset_ids).toEqual(["a1"]);
    });

    it("recursively deletes folders and returns all ids", async () => {
      const folder = makeAsset({ id: "folder", content_type: "folder" });
      const child1 = makeAsset({ id: "c1", content_type: "image/png" });
      const child2Folder = makeAsset({ id: "c2", content_type: "folder" });
      const grandchild = makeAsset({ id: "gc", content_type: "image/png" });

      // Find returns the correct asset for each lookup.
      (Asset.find as ReturnType<typeof vi.fn>).mockImplementation(
        (_userId: string, id: string) => {
          if (id === "folder") return Promise.resolve(folder);
          if (id === "c2") return Promise.resolve(child2Folder);
          return Promise.resolve(null);
        }
      );
      // getChildren returns the right batch for each parent.
      (Asset.getChildren as ReturnType<typeof vi.fn>).mockImplementation(
        (_userId: string, parentId: string) => {
          if (parentId === "folder") return Promise.resolve([child1, child2Folder]);
          if (parentId === "c2") return Promise.resolve([grandchild]);
          return Promise.resolve([]);
        }
      );

      const caller = createCaller(makeCtx());
      const result = await caller.assets.delete({ id: "folder" });
      expect(result.deleted_asset_ids).toEqual(["c1", "gc", "c2", "folder"]);
      expect(child1.delete).toHaveBeenCalled();
      expect(grandchild.delete).toHaveBeenCalled();
      expect(child2Folder.delete).toHaveBeenCalled();
      expect(folder.delete).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when the asset does not exist", async () => {
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.assets.delete({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ── children ────────────────────────────────────────────────────
  describe("children", () => {
    it("returns a slim list of children (id/name/content_type)", async () => {
      const a1 = makeAsset({ id: "a1", name: "one.png" });
      const a2 = makeAsset({ id: "a2", name: "two.pdf", content_type: "application/pdf" });
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [a1, a2],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.children({ id: "folder" });
      expect(result.assets).toEqual([
        { id: "a1", name: "one.png", content_type: "image/png" },
        { id: "a2", name: "two.pdf", content_type: "application/pdf" }
      ]);
      expect(result.next).toBeNull();
      expect(Asset.paginate).toHaveBeenCalledWith("user-1", {
        parentId: "folder",
        limit: 100
      });
    });
  });

  // ── recursive ───────────────────────────────────────────────────
  describe("recursive", () => {
    it("returns a flat list of all descendants", async () => {
      const child1 = makeAsset({ id: "c1", content_type: "image/png" });
      const folder = makeAsset({ id: "f1", content_type: "folder" });
      const grandchild = makeAsset({ id: "gc", content_type: "image/png" });

      (Asset.getChildren as ReturnType<typeof vi.fn>).mockImplementation(
        (_userId: string, parentId: string) => {
          if (parentId === "root") return Promise.resolve([child1, folder]);
          if (parentId === "f1") return Promise.resolve([grandchild]);
          return Promise.resolve([]);
        }
      );

      const caller = createCaller(makeCtx());
      const result = await caller.assets.recursive({ id: "root" });
      expect(result.assets.map((a) => a.id)).toEqual(["c1", "f1", "gc"]);
    });
  });

  // ── search ──────────────────────────────────────────────────────
  describe("search", () => {
    it("filters by name substring (case-insensitive)", async () => {
      const a1 = makeAsset({ id: "a1", name: "Vacation.png" });
      const a2 = makeAsset({ id: "a2", name: "notes.pdf" });
      const a3 = makeAsset({ id: "a3", name: "HOLIDAY vacation.jpg" });
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [a1, a2, a3],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.search({ query: "vacation" });
      expect(result.assets.map((a) => a.id)).toEqual(["a1", "a3"]);
      expect(result.total_count).toBe(2);
      expect(result.is_global_search).toBe(true);
    });

    it("sets is_global_search=false when workflow_id is present", async () => {
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.search({
        query: "abc",
        workflow_id: "wf-1"
      });
      expect(result.is_global_search).toBe(false);
    });
  });

  // ── byFilename ──────────────────────────────────────────────────
  describe("byFilename", () => {
    it("returns the asset whose name exactly matches", async () => {
      const wanted = makeAsset({ id: "match", name: "hello.png" });
      const other = makeAsset({ id: "other", name: "world.png" });
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [other, wanted],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.assets.byFilename({ filename: "hello.png" });
      expect(result.id).toBe("match");
    });

    it("throws NOT_FOUND when no asset matches", async () => {
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);
      const caller = createCaller(makeCtx());
      await expect(
        caller.assets.byFilename({ filename: "ghost.png" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
