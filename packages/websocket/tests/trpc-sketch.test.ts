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
    static mutateDocumentData = vi.fn();

    // Atomic CAS helper for sketch.update. Plain static method (not a vi.fn so
    // `vi.resetAllMocks()` can't strip its body) that routes its write through
    // `updateDoc`, keeping existing `ID.updateDoc.mock.calls` assertions valid.
    static async updateFieldsIfUnchanged(
      id: string,
      _expectedUpdatedAt: string,
      fields: Record<string, unknown>
    ): Promise<StubImageDocument | null> {
      const doc = (await StubImageDocument.findById(
        id
      )) as StubImageDocument | null;
      if (!doc) return null;
      Object.assign(doc, fields);
      if (fields.background_color !== undefined) {
        (doc as { background_color: unknown }).background_color =
          fields.background_color;
      }
      await StubImageDocument.updateDoc(id, fields);
      return doc;
    }
  }
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      find: vi.fn()
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
  mutateDocumentData: ReturnType<typeof vi.fn>;
};
const WF = Workflow as unknown as {
  find: ReturnType<typeof vi.fn>;
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
  beforeEach(() => {
    vi.resetAllMocks();
    ID.mutateDocumentData.mockImplementation(
      async (
        id: string,
        mutator: (
          data: ImageDocumentData,
          doc: ReturnType<typeof makeDoc>
        ) => unknown
      ) => {
        const doc = (await ID.findById(id)) as ReturnType<typeof makeDoc> | null;
        if (!doc) {
          return null;
        }
        const data = doc.toDocumentData();
        const result = await mutator(data, doc);
        await ID.updateDoc(id, { document: JSON.stringify(data) });
        return { document: doc, result };
      }
    );
  });
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

    it("filters by projectId scoped to current user at the DB level", async () => {
      ID.listByProject.mockResolvedValue([
        makeDoc({ id: "a", user_id: "user-1" })
      ]);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.list({ projectId: "p-1" });
      expect(ID.listByProject).toHaveBeenCalledWith("p-1", "user-1");
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
      expect(out.document.sketch.canvas.backgroundColor).toBe("#ffffff");
      expect(out.document.sketch.layers).toHaveLength(1);
      expect(out.document.sketch.activeLayerId).toBe(
        out.document.sketch.layers[0]?.id
      );
      expect(out.document.sketch.activeTool).toBe("brush");
      expect(out.document.sketch.viewport).toEqual({
        zoom: 1,
        pan: { x: 0, y: 0 }
      });
      expect(out.document.sketch.history).toEqual([]);
      expect(out.document.sketch.historyIndex).toBe(-1);
    });

    it("honors a client-supplied id", async () => {
      ID.findById.mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.create({
        id: "client-minted-id",
        name: "New",
        projectId: "p-1"
      });
      expect(out.id).toBe("client-minted-id");
    });

    it("is idempotent — a repeated create returns the existing document", async () => {
      ID.findById.mockResolvedValue(makeDoc({ id: "dupe", name: "Original" }));
      const caller = createCaller(makeCtx());
      const out = await caller.sketch.create({
        id: "dupe",
        name: "Should be ignored",
        projectId: "p-1"
      });
      expect(out.id).toBe("dupe");
      expect(out.name).toBe("Original");
    });

    it("hides another user's document behind a 404 rather than overwriting it", async () => {
      ID.findById.mockResolvedValue(makeDoc({ id: "theirs", user_id: "someone-else" }));
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.create({ id: "theirs", name: "Mine", projectId: "p-1" })
      ).rejects.toThrow();
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
            canvas: {
              width: 1024,
              height: 1024,
              backgroundColor: "#ffffff"
            },
            layers: [],
            activeLayerId: "",
            activeTool: "move",
            viewport: {
              zoom: 2,
              pan: { x: 12, y: -4 }
            },
            history: [],
            historyIndex: -1
          },
          layerBindings: []
        }
      });
      expect(out.name).toBe("Renamed");
      expect(ID.updateDoc).toHaveBeenCalled();
      expect(ID.updateDoc.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({
          document: expect.stringContaining('"activeTool":"move"')
        })
      );
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
    it("deletes when owned without touching bound workflows", async () => {
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
      const persisted = JSON.parse(
        updateArgs?.[1]?.document as string
      ) as ImageDocumentData;
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
      const persisted = JSON.parse(
        updateArgs?.[1]?.document as string
      ) as ImageDocumentData;
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

    const validSourceGraph = {
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
    };

    it("create binds directly to source workflow id", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      WF.find.mockResolvedValue({
        id: "source-wf",
        user_id: "user-1",
        access: "private",
        name: "Template",
        updated_at: "2026-01-01T00:00:00Z",
        graph: validSourceGraph
      });
      ID.updateDoc.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.create({
        id: "doc-1",
        layerId: "new-layer-1",
        sourceWorkflowId: "source-wf"
      });

      expect(WF.find).toHaveBeenCalledWith("user-1", "source-wf");
      expect(out.layerId).toBe("new-layer-1");
      expect(out.workflowId).toBe("source-wf");
      expect(out.selectedOutputNodeId).toBe("output");
      expect(out.paramOverrides).toEqual({ prompt: "" });
      expect(out.status).toBe("draft");
    });

    it("create rejects when source workflow not accessible", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      WF.find.mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.layers.create({
          id: "doc-1",
          layerId: "new-layer-1",
          sourceWorkflowId: "source-wf"
        })
      ).rejects.toThrow();
    });

    it("create rejects when source has no image output", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      WF.find.mockResolvedValue({
        id: "source-wf",
        user_id: "user-1",
        access: "private",
        name: "Template",
        updated_at: "2026-01-01T00:00:00Z",
        graph: {
          nodes: [
            {
              id: "prompt",
              type: "nodetool.input.StringInput",
              data: { name: "prompt", value: "" }
            }
          ],
          edges: []
        }
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.layers.create({
          id: "doc-1",
          layerId: "new-layer-1",
          sourceWorkflowId: "source-wf"
        })
      ).rejects.toThrow();
    });

    it("create rejects when layerId already has a binding", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );
      WF.find.mockResolvedValue({
        id: "source-wf",
        user_id: "user-1",
        access: "private",
        name: "Template",
        updated_at: "2026-01-01T00:00:00Z",
        graph: validSourceGraph
      });

      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.layers.create({
          id: "doc-1",
          layerId: "layer-1",
          sourceWorkflowId: "source-wf"
        })
      ).rejects.toThrow();
    });

    it("delete removes only the binding", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );
      ID.updateDoc.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.delete({
        id: "doc-1",
        layerId: "layer-1"
      });

      expect(out.ok).toBe(true);
      const updateArgs = ID.updateDoc.mock.calls[0];
      const persisted = JSON.parse(
        updateArgs?.[1]?.document as string
      ) as ImageDocumentData;
      expect(persisted.layerBindings).toHaveLength(0);
    });

    it("duplicate copies overrides and shares the workflow", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );
      ID.updateDoc.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.sketch.layers.duplicate({
        id: "doc-1",
        layerId: "layer-1",
        newLayerId: "layer-2"
      });

      expect(out.layerId).toBe("layer-2");
      expect(out.workflowId).toBe("wf-1");
      expect(out.paramOverrides).toEqual({ prompt: "hello" });
      expect(out.status).toBe("draft");
    });

    it("duplicate rejects when newLayerId already exists", async () => {
      ID.findById.mockResolvedValue(
        makeDoc({ document: JSON.stringify(layerDoc) })
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.layers.duplicate({
          id: "doc-1",
          layerId: "layer-1",
          newLayerId: "layer-1"
        })
      ).rejects.toThrow();
    });

    it("duplicate 404s on unknown layer", async () => {
      ID.findById.mockResolvedValue(makeDoc());
      const caller = createCaller(makeCtx());
      await expect(
        caller.sketch.layers.duplicate({
          id: "doc-1",
          layerId: "nope",
          newLayerId: "layer-2"
        })
      ).rejects.toThrow();
    });
  });
});
