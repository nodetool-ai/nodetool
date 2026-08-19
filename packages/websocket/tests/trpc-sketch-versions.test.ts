import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { __resetSketchAutosaveVersionState } from "../src/trpc/routers/sketch.js";
import type { Context } from "../src/trpc/context.js";
import type { ImageDocumentData } from "@nodetool-ai/models";

const emptyDoc: ImageDocumentData = {
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 1024, backgroundColor: "#ffffff" },
    layers: [],
    activeLayerId: "",
    maskLayerId: null
  },
  layerBindings: []
};

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();

  const defaultDocument = JSON.stringify({
    sketch: {
      version: 3,
      canvas: { width: 1024, height: 1024, backgroundColor: "#ffffff" },
      layers: [],
      activeLayerId: "",
      maskLayerId: null
    },
    layerBindings: []
  });

  class StubImageDocument {
    user_id = "user-1";
    project_id = "p-1";
    id = "doc-1";
    name = "Sketch";
    width = 1024;
    height = 1024;
    background_color = "#ffffff";
    workflow_id: string | null = null;
    thumbnail_asset_id: string | null = null;
    updated_at = "2026-01-01T00:00:00Z";
    created_at = "2026-01-01T00:00:00Z";
    document = defaultDocument;
    constructor(init: Record<string, unknown> = {}) {
      Object.assign(this, init);
    }
    save = vi.fn().mockResolvedValue(undefined);
    delete = vi.fn().mockResolvedValue(undefined);
    toDocumentData(): ImageDocumentData {
      return JSON.parse(this.document) as ImageDocumentData;
    }
    toResponse() {
      return {
        id: this.id,
        projectId: this.project_id,
        workflowId: this.workflow_id ?? undefined,
        name: this.name,
        width: this.width,
        height: this.height,
        backgroundColor: this.background_color,
        document: this.toDocumentData(),
        thumbnailAssetId: this.thumbnail_asset_id ?? undefined,
        createdAt: this.created_at,
        updatedAt: this.updated_at
      };
    }
    static findById = vi.fn();

    // Mirrors the real `deleteOwned`: ownership, the row, and the version
    // cascade in one call, so this double stays honest about what the route
    // now delegates. The route no longer does any of it itself.
    static async deleteOwned(userId: string, id: string): Promise<boolean> {
      const row = (await StubImageDocument.findById(id)) as StubImageDocument | null;
      if (!row || row.user_id !== userId) return false;
      await row.delete();
      await StubImageDocumentVersion.deleteForDocument(id);
      return true;
    }
    static listByUser = vi.fn();
    static listByProject = vi.fn();
    static updateDoc = vi.fn();
    static mutateDocumentData = vi.fn();

    // Plain static (not vi.fn) so `vi.resetAllMocks()` doesn't strip the body.
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
      await StubImageDocument.updateDoc(id, fields);
      return doc;
    }
  }

  class StubImageDocumentVersion {
    id = "ver-1";
    image_document_id = "doc-1";
    user_id = "user-1";
    name: string | null = null;
    version = 1;
    save_type = "manual";
    width = 1024;
    height = 1024;
    background_color = "#ffffff";
    document = defaultDocument;
    created_at = "2026-01-01T00:00:00Z";
    constructor(init: Record<string, unknown> = {}) {
      Object.assign(this, init);
    }
    delete = vi.fn().mockResolvedValue(undefined);

    static listForDocument = vi.fn();
    static findByVersion = vi.fn();
    static pruneAutosaves = vi.fn();
    static deleteForDocument = vi.fn();
    static snapshotCalls: {
      doc: StubImageDocument;
      opts: { saveType: string; name?: string | null };
    }[] = [];

    // Plain static so `vi.resetAllMocks()` doesn't strip the body; calls are
    // recorded on `snapshotCalls` instead of a spy.
    static async snapshot(
      doc: StubImageDocument,
      opts: { saveType: string; name?: string | null }
    ): Promise<StubImageDocumentVersion> {
      StubImageDocumentVersion.snapshotCalls.push({ doc, opts });
      return new StubImageDocumentVersion({
        id: `ver-${StubImageDocumentVersion.snapshotCalls.length}`,
        image_document_id: doc.id,
        version: StubImageDocumentVersion.snapshotCalls.length,
        save_type: opts.saveType,
        name: opts.name ?? null,
        width: doc.width,
        height: doc.height,
        background_color: doc.background_color,
        document: doc.document
      });
    }
  }

  return {
    ...actual,
    Workflow: { ...actual.Workflow, find: vi.fn() },
    ImageDocument: StubImageDocument,
    ImageDocumentVersion: StubImageDocumentVersion,
    createTimeOrderedUuid: () => "version-id"
  };
});

import { ImageDocument, ImageDocumentVersion } from "@nodetool-ai/models";

const ID = ImageDocument as unknown as {
  findById: ReturnType<typeof vi.fn>;
  updateDoc: ReturnType<typeof vi.fn>;
};
const IDV = ImageDocumentVersion as unknown as {
  listForDocument: ReturnType<typeof vi.fn>;
  findByVersion: ReturnType<typeof vi.fn>;
  pruneAutosaves: ReturnType<typeof vi.fn>;
  deleteForDocument: ReturnType<typeof vi.fn>;
  snapshotCalls: {
    doc: { id: string };
    opts: { saveType: string; name?: string | null };
  }[];
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

function makeDoc(over: Record<string, unknown> = {}) {
  return new (ImageDocument as unknown as new (
    init: Record<string, unknown>
  ) => InstanceType<typeof ImageDocument>)({ ...over });
}

function makeVersion(over: Record<string, unknown> = {}) {
  return new (ImageDocumentVersion as unknown as new (
    init: Record<string, unknown>
  ) => InstanceType<typeof ImageDocumentVersion>)({ ...over });
}

describe("sketch.documentVersions router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    IDV.snapshotCalls.length = 0;
    __resetSketchAutosaveVersionState();
  });
  afterEach(() => vi.restoreAllMocks());

  // ── auth triad ────────────────────────────────────────────────────────────

  describe("auth", () => {
    const cases: [
      string,
      (c: ReturnType<typeof createCaller>) => Promise<unknown>
    ][] = [
      ["list", (c) => c.sketch.documentVersions.list({ id: "doc-1" })],
      ["create", (c) => c.sketch.documentVersions.create({ id: "doc-1" })],
      [
        "restore",
        (c) => c.sketch.documentVersions.restore({ id: "doc-1", version: 1 })
      ]
    ];

    for (const [name, call] of cases) {
      it(`${name} rejects unauthenticated callers`, async () => {
        ID.findById.mockResolvedValue(makeDoc());
        await expect(
          call(createCaller(makeCtx({ userId: null })))
        ).rejects.toThrow();
      });

      it(`${name} 404s on an unknown id`, async () => {
        ID.findById.mockResolvedValue(null);
        await expect(call(createCaller(makeCtx()))).rejects.toThrow();
      });

      it(`${name} 404s on another user's document`, async () => {
        ID.findById.mockResolvedValue(makeDoc({ user_id: "other" }));
        await expect(call(createCaller(makeCtx()))).rejects.toThrow();
      });
    }
  });

  // ── list ──────────────────────────────────────────────────────────────────

  it("list maps rows to metadata and forwards limit + saveType", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.listForDocument.mockResolvedValue([
      makeVersion({ id: "v2", version: 2, save_type: "autosave", name: null }),
      makeVersion({ id: "v1", version: 1, save_type: "manual", name: "First" })
    ]);
    const out = await createCaller(makeCtx()).sketch.documentVersions.list({
      id: "doc-1",
      limit: 10,
      saveType: "manual"
    });
    expect(IDV.listForDocument).toHaveBeenCalledWith("doc-1", {
      limit: 10,
      saveType: "manual"
    });
    expect(out.map((v) => v.version)).toEqual([2, 1]);
    expect(out[0]).toMatchObject({
      id: "v2",
      saveType: "autosave",
      name: null,
      backgroundColor: "#ffffff"
    });
    // metadata only — a sketch document holds layer bitmaps
    expect(out[0]).not.toHaveProperty("document");
  });

  // ── get ───────────────────────────────────────────────────────────────────

  it("get parses a JSON-string document", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.findByVersion.mockResolvedValue(
      makeVersion({ version: 3, document: JSON.stringify(emptyDoc) })
    );
    const out = await createCaller(makeCtx()).sketch.documentVersions.get({
      id: "doc-1",
      version: 3
    });
    expect(out.version).toBe(3);
    expect(out.document).toEqual(emptyDoc);
  });

  it("get accepts an already-parsed document object (Postgres)", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.findByVersion.mockResolvedValue(
      makeVersion({ version: 3, document: emptyDoc })
    );
    const out = await createCaller(makeCtx()).sketch.documentVersions.get({
      id: "doc-1",
      version: 3
    });
    expect(out.document).toEqual(emptyDoc);
  });

  it("get reports a corrupt document row rather than returning the raw text", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.findByVersion.mockResolvedValue(
      makeVersion({ version: 3, document: "{not json" })
    );
    await expect(
      createCaller(makeCtx()).sketch.documentVersions.get({
        id: "doc-1",
        version: 3
      })
    ).rejects.toThrow(/not valid JSON/);
  });

  it("get 404s on a missing version", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.findByVersion.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx()).sketch.documentVersions.get({
        id: "doc-1",
        version: 9
      })
    ).rejects.toThrow();
  });

  // ── create ────────────────────────────────────────────────────────────────

  it("create snapshots the current document as a manual version", async () => {
    ID.findById.mockResolvedValue(
      makeDoc({ width: 512, height: 256, background_color: "#000000" })
    );
    const out = await createCaller(makeCtx()).sketch.documentVersions.create({
      id: "doc-1",
      name: "Before the repaint"
    });
    expect(IDV.snapshotCalls).toHaveLength(1);
    expect(IDV.snapshotCalls[0].opts).toEqual({
      saveType: "manual",
      name: "Before the repaint"
    });
    expect(out).toMatchObject({
      version: 1,
      saveType: "manual",
      name: "Before the repaint",
      width: 512,
      height: 256,
      backgroundColor: "#000000"
    });
  });

  it("create defaults an omitted name to null", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    const out = await createCaller(makeCtx()).sketch.documentVersions.create({
      id: "doc-1"
    });
    expect(IDV.snapshotCalls[0].opts.name).toBeNull();
    expect(out.name).toBeNull();
  });

  // ── restore ───────────────────────────────────────────────────────────────

  it("restore writes the version's document and canvas, after a pre-restore snapshot", async () => {
    const restoredDoc: ImageDocumentData = {
      ...emptyDoc,
      sketch: {
        ...emptyDoc.sketch,
        canvas: { width: 640, height: 480, backgroundColor: "#101010" },
        activeLayerId: "layer-a"
      }
    };
    ID.findById.mockResolvedValue(
      makeDoc({ updated_at: "2026-02-02T00:00:00Z" })
    );
    IDV.findByVersion.mockResolvedValue(
      makeVersion({
        version: 7,
        document: JSON.stringify(restoredDoc),
        width: 640,
        height: 480,
        background_color: "#101010"
      })
    );

    const out = await createCaller(makeCtx()).sketch.documentVersions.restore({
      id: "doc-1",
      version: 7
    });

    // Pre-restore snapshot, so a restore is undoable.
    expect(IDV.snapshotCalls).toHaveLength(1);
    expect(IDV.snapshotCalls[0].opts).toEqual({
      saveType: "restore",
      name: "Before restore to v7"
    });

    const [id, fields] = ID.updateDoc.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(id).toBe("doc-1");
    expect(JSON.parse(fields.document as string)).toEqual(restoredDoc);
    expect(fields).toMatchObject({
      width: 640,
      height: 480,
      background_color: "#101010"
    });
    expect(out.width).toBe(640);
    expect(out.backgroundColor).toBe("#101010");
    expect(out.document).toEqual(restoredDoc);
  });

  it("restore 404s on a missing version and writes nothing", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.findByVersion.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx()).sketch.documentVersions.restore({
        id: "doc-1",
        version: 9
      })
    ).rejects.toThrow();
    expect(IDV.snapshotCalls).toHaveLength(0);
    expect(ID.updateDoc).not.toHaveBeenCalled();
  });

  it("restore reports a conflict when the document changed under it", async () => {
    ID.findById
      .mockResolvedValueOnce(makeDoc())
      // the CAS write re-reads and finds the row gone/changed
      .mockResolvedValue(null);
    IDV.findByVersion.mockResolvedValue(
      makeVersion({ version: 2, document: JSON.stringify(emptyDoc) })
    );
    await expect(
      createCaller(makeCtx()).sketch.documentVersions.restore({
        id: "doc-1",
        version: 2
      })
    ).rejects.toThrow(/modified since last read/);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("delete removes the version row", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    const version = makeVersion({ version: 4 });
    IDV.findByVersion.mockResolvedValue(version);
    const out = await createCaller(makeCtx()).sketch.documentVersions.delete({
      id: "doc-1",
      version: 4
    });
    expect(version.delete).toHaveBeenCalled();
    expect(out).toEqual({ ok: true });
  });

  it("delete 404s on a missing version", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.findByVersion.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx()).sketch.documentVersions.delete({
        id: "doc-1",
        version: 9
      })
    ).rejects.toThrow();
  });
});

describe("sketch autosave snapshots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    IDV.snapshotCalls.length = 0;
    __resetSketchAutosaveVersionState();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("snapshots on the first document write and not again within the interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    ID.findById.mockResolvedValue(makeDoc());
    const caller = createCaller(makeCtx());

    await caller.sketch.update({ id: "doc-1", document: emptyDoc });
    expect(IDV.snapshotCalls).toHaveLength(1);
    expect(IDV.snapshotCalls[0].opts).toEqual({ saveType: "autosave" });
    expect(IDV.pruneAutosaves).toHaveBeenCalledWith("doc-1", 20);

    vi.advanceTimersByTime(60_000);
    await caller.sketch.update({ id: "doc-1", document: emptyDoc });
    expect(IDV.snapshotCalls).toHaveLength(1);

    // Past the 5-minute interval it snapshots again.
    vi.advanceTimersByTime(5 * 60 * 1000);
    await caller.sketch.update({ id: "doc-1", document: emptyDoc });
    expect(IDV.snapshotCalls).toHaveLength(2);
  });

  it("does not snapshot a scalar-only update", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    await createCaller(makeCtx()).sketch.update({
      id: "doc-1",
      name: "Renamed"
    });
    expect(IDV.snapshotCalls).toHaveLength(0);
  });

  it("keeps the save when snapshotting throws", async () => {
    ID.findById.mockResolvedValue(makeDoc());
    IDV.pruneAutosaves.mockRejectedValue(new Error("no such table"));
    const out = await createCaller(makeCtx()).sketch.update({
      id: "doc-1",
      document: emptyDoc
    });
    expect(out.id).toBe("doc-1");
  });

  it("sketch.delete drops the version rows and the cadence entry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    ID.findById.mockResolvedValue(makeDoc());
    const caller = createCaller(makeCtx());

    await caller.sketch.update({ id: "doc-1", document: emptyDoc });
    expect(IDV.snapshotCalls).toHaveLength(1);

    await caller.sketch.delete({ id: "doc-1" });
    expect(IDV.deleteForDocument).toHaveBeenCalledWith("doc-1");

    // The cadence entry went with it, so the next write snapshots immediately.
    await caller.sketch.update({ id: "doc-1", document: emptyDoc });
    expect(IDV.snapshotCalls).toHaveLength(2);
  });
});
