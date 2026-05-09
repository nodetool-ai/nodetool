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
    name = "Test Document";
    width = 1024;
    height = 1024;
    background_color = "#ffffff";
    workflow_id: string | null = null;
    thumbnail_asset_id: string | null = null;
    updated_at = "2026-01-01T00:00:00Z";
    created_at = "2026-01-01T00:00:00Z";
    document = JSON.stringify({
      sketch: {
        version: 1,
        canvas: { width: 1024, height: 1024 },
        layers: [],
        activeLayerId: ""
      },
      layerBindings: []
    });
    constructor(init: Record<string, unknown> = {}) {
      Object.assign(this, init);
    }
    save = vi.fn().mockResolvedValue(undefined);
    delete = vi.fn().mockResolvedValue(undefined);
    toDocumentData(): ImageDocumentData {
      return JSON.parse(this.document) as ImageDocumentData;
    }
    toResponse() {
      const doc = this.toDocumentData();
      return {
        id: this.id,
        projectId: this.project_id,
        workflowId: this.workflow_id ?? undefined,
        name: this.name,
        width: this.width,
        height: this.height,
        backgroundColor: this.background_color,
        document: doc,
        thumbnailAssetId: this.thumbnail_asset_id ?? undefined,
        createdAt: this.created_at,
        updatedAt: this.updated_at
      };
    }
    static findById = vi.fn();
    static listByUser = vi.fn();
    static listByProject = vi.fn();
    static updateDoc = vi.fn();
  }
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      cloneAsLayerPrivate: vi.fn(),
      deleteLayerIfOrphaned: vi.fn()
    },
    ImageDocument: StubImageDocument,
    createTimeOrderedUuid: () => "test-uuid"
  };
});

import { ImageDocument, Workflow } from "@nodetool-ai/models";

const ID = ImageDocument as unknown as {
  findById: ReturnType<typeof vi.fn>;
  listByUser: ReturnType<typeof vi.fn>;
  listByProject: ReturnType<typeof vi.fn>;
  updateDoc: ReturnType<typeof vi.fn>;
};
const WF = Workflow as unknown as {
  cloneAsLayerPrivate: ReturnType<typeof vi.fn>;
  deleteLayerIfOrphaned: ReturnType<typeof vi.fn>;
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
    it("merges document fields", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      const updated = makeDoc({ name: "Renamed" });
      ID.updateDoc.mockResolvedValue(updated);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.update({
        id: "doc-1",
        name: "Renamed",
        document: {
          sketch: {
            version: 1,
            canvas: { width: 1024, height: 1024 },
            layers: [],
            activeLayerId: ""
          },
          layerBindings: []
        }
      });
      expect(out.name).toBe("Renamed");
      expect(ID.updateDoc).toHaveBeenCalled();
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
      ID.updateDoc.mockResolvedValue(makeDoc({ name: "X" }));
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
    it("deletes when owned and cascades orphan cleanup", async () => {
      const docData: ImageDocumentData = {
        sketch: {
          version: 1,
          canvas: { width: 1024, height: 1024 },
          layers: [],
          activeLayerId: ""
        },
        layerBindings: [
          {
            layerId: "layer-1",
            workflowId: "wf-1",
            status: "draft",
            versions: []
          }
        ]
      };
      const doc = makeDoc({ document: JSON.stringify(docData) });
      ID.findById.mockResolvedValue(doc);
      WF.deleteLayerIfOrphaned.mockResolvedValue(true);
      const caller = createCaller(makeCtx());
      await caller.sketch.delete({ id: "doc-1" });
      expect(doc.delete).toHaveBeenCalled();
      expect(WF.deleteLayerIfOrphaned).toHaveBeenCalledWith("wf-1");
    });

    it("404 when not owned", async () => {
      ID.findById.mockResolvedValue(makeDoc({ user_id: "other" }));
      const caller = createCaller(makeCtx());
      await expect(caller.sketch.delete({ id: "doc-1" })).rejects.toThrow();
    });
  });

  describe("versions", () => {
    const docWithBinding: ImageDocumentData = {
      sketch: {
        version: 1,
        canvas: { width: 1024, height: 1024 },
        layers: [],
        activeLayerId: ""
      },
      layerBindings: [
        {
          layerId: "layer-1",
          workflowId: "wf-1",
          status: "generated",
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
      ]
    };

    it("list returns the layer versions", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithBinding) })
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
        makeDoc({ document: JSON.stringify(docWithBinding) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.versions.list({ id: "doc-1", layerId: "nope" })
      ).rejects.toThrow();
    });

    it("append adds a new version and persists", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithBinding) })
      );
      ID.updateDoc.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.append({
        id: "doc-1",
        layerId: "layer-1",
        jobId: "job-2",
        assetId: "asset-2",
        dependencyHash: "h2",
        workflowUpdatedAt: "2026-01-02T00:00:00Z"
      });
      expect(out.id).toBe("test-uuid");
      expect(out.status).toBe("success");
      expect(ID.updateDoc).toHaveBeenCalled();
      const updateArgs = ID.updateDoc.mock.calls[0];
      const persisted = JSON.parse(updateArgs?.[1]?.document as string) as ImageDocumentData;
      expect(persisted.layerBindings[0]!.versions).toHaveLength(2);
    });

    it("setFavorite toggles the favorite flag", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithBinding) })
      );
      ID.updateDoc.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.setFavorite({
        id: "doc-1",
        layerId: "layer-1",
        versionId: "v0",
        favorite: true
      });
      expect(out.favorite).toBe(true);
      expect(ID.updateDoc).toHaveBeenCalled();
    });

    it("setFavorite 404s on unknown version", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithBinding) })
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
        makeDoc({ document: JSON.stringify(docWithBinding) })
      );
      ID.updateDoc.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.versions.delete({
        id: "doc-1",
        layerId: "layer-1",
        versionId: "v0"
      });
      expect(out.ok).toBe(true);
      const updateArgs = ID.updateDoc.mock.calls[0];
      const persisted = JSON.parse(updateArgs?.[1]?.document as string) as ImageDocumentData;
      expect(persisted.layerBindings[0]!.versions).toHaveLength(0);
    });

    it("delete 404s on unknown version", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(docWithBinding) })
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

  describe("layers", () => {
    const layerDoc: ImageDocumentData = {
      sketch: {
        version: 1,
        canvas: { width: 1024, height: 1024 },
        layers: [],
        activeLayerId: ""
      },
      layerBindings: [
        {
          layerId: "layer-1",
          workflowId: "wf-1",
          selectedOutputNodeId: "output",
          paramOverrides: { prompt: "hello" },
          status: "generated",
          versions: []
        }
      ]
    };

    it("create clones workflow and adds binding", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      WF.cloneAsLayerPrivate.mockResolvedValue({
        id: "wf-clone",
        name: "Template",
        updated_at: "2026-01-01T00:00:00Z",
        graph: {
          nodes: [
            {
              id: "prompt",
              type: "nodetool.input.StringInput",
              data: { name: "prompt", value: "" }
            },
            {
              id: "output",
              type: "nodetool.output.Output",
              data: { name: "image", value: null }
            }
          ],
          edges: []
        }
      });
      ID.updateDoc.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.create({
        id: "doc-1",
        layerId: "new-layer-1",
        sourceWorkflowId: "source-wf"
      });

      expect(WF.cloneAsLayerPrivate).toHaveBeenCalledWith(
        "source-wf",
        "user-1"
      );
      expect(out.layerId).toBe("new-layer-1");
      expect(out.workflowId).toBe("wf-clone");
      expect(out.selectedOutputNodeId).toBe("output");
      expect(out.paramOverrides).toEqual({ prompt: "" });
      expect(out.status).toBe("draft");
    });

    it("delete removes binding and cascades orphan cleanup", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );
      ID.updateDoc.mockResolvedValue(undefined);
      WF.deleteLayerIfOrphaned.mockResolvedValue(true);

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.delete({
        id: "doc-1",
        layerId: "layer-1"
      });

      expect(out.ok).toBe(true);
      expect(WF.deleteLayerIfOrphaned).toHaveBeenCalledWith("wf-1");
      const updateArgs = ID.updateDoc.mock.calls[0];
      const persisted = JSON.parse(
        updateArgs?.[1]?.document as string
      ) as ImageDocumentData;
      expect(persisted.layerBindings).toHaveLength(0);
    });

    it("duplicate linked keeps workflowId", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );
      ID.updateDoc.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.duplicate({
        id: "doc-1",
        layerId: "layer-1",
        newLayerId: "layer-2",
        mode: "linked"
      });

      expect(WF.cloneAsLayerPrivate).not.toHaveBeenCalled();
      expect(out.layerId).toBe("layer-2");
      expect(out.workflowId).toBe("wf-1");
      expect(out.paramOverrides).toEqual({ prompt: "hello" });
    });

    it("duplicate variation clones workflow and assigns new workflowId", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );
      ID.updateDoc.mockResolvedValue(undefined);
      WF.cloneAsLayerPrivate.mockResolvedValue({ id: "wf-2" });

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.duplicate({
        id: "doc-1",
        layerId: "layer-1",
        newLayerId: "layer-3",
        mode: "variation"
      });

      expect(WF.cloneAsLayerPrivate).toHaveBeenCalledWith("wf-1", "user-1");
      expect(out.workflowId).toBe("wf-2");
      expect(out.paramOverrides).toEqual({ prompt: "hello" });
    });

    it("duplicate 404s on unknown layer", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.layers.duplicate({
          id: "doc-1",
          layerId: "nope",
          newLayerId: "layer-2",
          mode: "linked"
        })
      ).rejects.toThrow();
    });
  });
});
