import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import type { ImageDocumentData } from "@nodetool-ai/models";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  class StubImageDocument {
    user_id = "user-1";
    project_id = "p-1";
    id = "doc-1";
    name = "Untitled";
    width = 1024;
    height = 1024;
    background_color = "#ffffff";
    workflow_id: string | null = null;
    thumbnail_asset_id: string | null = null;
    updated_at = "2026-01-01T00:00:00Z";
    created_at = "2026-01-01T00:00:00Z";
    document = JSON.stringify({
      layers: [],
      guides: [],
      artboards: [],
      activeLayerId: null,
      maskLayerId: null
    });
    constructor(init: Record<string, unknown> = {}) {
      Object.assign(this, init);
    }
    save = vi.fn().mockResolvedValue(undefined);
    delete = vi.fn().mockResolvedValue(undefined);
    toDocument(): ImageDocumentData {
      return JSON.parse(this.document) as ImageDocumentData;
    }
    toImageDocumentResponse() {
      return {
        id: this.id,
        projectId: this.project_id,
        workflowId: this.workflow_id ?? undefined,
        name: this.name,
        width: this.width,
        height: this.height,
        backgroundColor: this.background_color,
        document: this.document,
        thumbnailAssetId: this.thumbnail_asset_id ?? undefined,
        createdAt: this.created_at,
        updatedAt: this.updated_at
      };
    }
    static findById = vi.fn();
    static listByUser = vi.fn();
    static listByProject = vi.fn();
    static update = vi.fn();
  }
  return {
    ...actual,
    ImageDocument: StubImageDocument,
    createTimeOrderedUuid: () => "version-id"
  };
});

import { ImageDocument } from "@nodetool-ai/models";

const ID = ImageDocument as unknown as {
  findById: ReturnType<typeof vi.fn>;
  listByUser: ReturnType<typeof vi.fn>;
  listByProject: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

function makeDoc(over: Partial<Record<string, unknown>> = {}) {
  return new (ImageDocument as unknown as new (
    init: Record<string, unknown>
  ) => InstanceType<typeof ImageDocument>)({ ...over });
}

describe("sketch router", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe("list", () => {
    it("returns documents for the user when no projectId given", async () => {
      ID.listByUser.mockResolvedValue([
        makeDoc({ id: "a" }),
        makeDoc({ id: "b" })
      ]);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.list({});
      expect(ID.listByUser).toHaveBeenCalledWith("user-1");
      expect(out.map((d) => d.id)).toEqual(["a", "b"]);
    });

    it("filters by projectId and excludes other users' documents", async () => {
      ID.listByProject.mockResolvedValue([
        makeDoc({ id: "a", user_id: "user-1" }),
        makeDoc({ id: "b", user_id: "other" })
      ]);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.list({ projectId: "p-1" });
      expect(out.map((d) => d.id)).toEqual(["a"]);
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.sketch.list({})).rejects.toThrow();
    });
  });

  describe("get", () => {
    it("returns the document when owned", async () => {
      ID.findById.mockResolvedValue(makeDoc({ id: "x" }));
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.get({ id: "x" });
      expect(out.id).toBe("x");
    });

    it("404 on unknown id", async () => {
      ID.findById.mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(caller.sketch.get({ id: "x" })).rejects.toThrow();
    });

    it("404 when owned by another user", async () => {
      ID.findById.mockResolvedValue(makeDoc({ user_id: "other" }));
      const caller = createCaller(makeCtx());
      await expect(caller.sketch.get({ id: "x" })).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("persists with defaults applied", async () => {
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.create({
        name: "New",
        projectId: "p-1"
      });
      expect(out.name).toBe("New");
      expect(out.width).toBe(1024);
      expect(out.height).toBe(1024);
      expect(out.backgroundColor).toBe("#ffffff");
    });
  });

  describe("update", () => {
    it("patches document fields", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      const updated = makeDoc({ name: "Renamed" });
      ID.update.mockResolvedValue(updated);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.update({
        id: "doc-1",
        name: "Renamed"
      });
      expect(out.name).toBe("Renamed");
      expect(ID.update).toHaveBeenCalled();
    });

    it("rejects stale baseUpdatedAt", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ updated_at: "2026-01-02T00:00:00Z" })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.update({
          id: "doc-1",
          name: "X",
          baseUpdatedAt: "2026-01-01T00:00:00Z"
        })
      ).rejects.toThrow();
    });

    it("accepts matching baseUpdatedAt", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ updated_at: "2026-01-02T00:00:00Z" })
      );
      ID.update.mockResolvedValue(makeDoc({ name: "X" }));
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.update({
        id: "doc-1",
        name: "X",
        baseUpdatedAt: "2026-01-02T00:00:00Z"
      });
      expect(out.name).toBe("X");
    });
  });

  describe("delete", () => {
    it("deletes when owned", async () => {
      const doc = makeDoc();
      ID.findById.mockResolvedValue(doc);
      const caller = createCaller(makeCtx());
      await caller.sketch.delete({ id: "doc-1" });
      expect(doc.delete).toHaveBeenCalled();
    });

    it("404 when not owned", async () => {
      ID.findById.mockResolvedValue(makeDoc({ user_id: "other" }));
      const caller = createCaller(makeCtx());
      await expect(caller.sketch.delete({ id: "doc-1" })).rejects.toThrow();
    });
  });

  describe("versions", () => {
    const docWithLayer: ImageDocumentData = {
      layers: [
        {
          id: "layer-1",
          name: "Layer",
          versions: [
            {
              id: "v0",
              createdAt: "2026-01-01T00:00:00Z",
              jobId: "j",
              assetId: "a",
              workflowUpdatedAt: "2026-01-01T00:00:00Z",
              dependencyHash: "h",
              paramOverridesSnapshot: {},
              status: "success"
            }
          ]
        }
      ],
      guides: [],
      artboards: [],
      activeLayerId: "layer-1",
      maskLayerId: null
    };

    it("list returns the layer versions", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.list({
        id: "doc-1",
        layerId: "layer-1"
      });
      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe("v0");
    });

    it("list 404s on unknown layer", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.versions.list({ id: "doc-1", layerId: "nope" })
      ).rejects.toThrow();
    });

    it("append adds a new version and persists", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      ID.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.append({
        id: "doc-1",
        layerId: "layer-1",
        jobId: "job-2",
        assetId: "asset-2",
        dependencyHash: "h2",
        workflowUpdatedAt: "2026-01-02T00:00:00Z"
      });
      expect(out.id).toBe("version-id");
      expect(out.status).toBe("success");
      expect(ID.update).toHaveBeenCalled();
      const updateArgs = ID.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as ImageDocumentData;
      const layer = (persisted.layers as Array<{ versions: unknown[] }>)[0];
      expect(layer.versions).toHaveLength(2);
    });

    it("setFavorite toggles the favorite flag", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      ID.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.setFavorite({
        id: "doc-1",
        layerId: "layer-1",
        versionId: "v0",
        favorite: true
      });
      expect(out.favorite).toBe(true);
      expect(ID.update).toHaveBeenCalled();
    });

    it("setFavorite 404s on unknown version", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.versions.setFavorite({
          id: "doc-1",
          layerId: "layer-1",
          versionId: "nope",
          favorite: true
        })
      ).rejects.toThrow();
    });

    it("delete removes the version and persists", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      ID.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.delete({
        id: "doc-1",
        layerId: "layer-1",
        versionId: "v0"
      });
      expect(out.ok).toBe(true);
      const updateArgs = ID.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as ImageDocumentData;
      const layer = (persisted.layers as Array<{ versions: unknown[] }>)[0];
      expect(layer.versions).toHaveLength(0);
    });

    it("delete 404s on unknown version", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithLayer) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.versions.delete({
          id: "doc-1",
          layerId: "layer-1",
          versionId: "nope"
        })
      ).rejects.toThrow();
    });
  });
});
