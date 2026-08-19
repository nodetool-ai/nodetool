import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { __resetTimelineAutosaveVersionState } from "../src/trpc/routers/timeline.js";
import type { Context } from "../src/trpc/context.js";
import type { TimelineDocument } from "@nodetool-ai/models";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();

  class StubTimelineSequence {
    user_id = "user-1";
    project_id = "p-1";
    id = "seq-1";
    name = "Demo";
    fps = 30;
    width = 1920;
    height = 1080;
    duration_ms = 0;
    updated_at = "2026-01-01T00:00:00Z";
    created_at = "2026-01-01T00:00:00Z";
    document = JSON.stringify({ tracks: [], clips: [], markers: [] });
    constructor(init: Record<string, unknown> = {}) {
      Object.assign(this, init);
    }
    save = vi.fn().mockResolvedValue(undefined);
    delete = vi.fn().mockResolvedValue(undefined);
    toDocument(): TimelineDocument {
      return JSON.parse(this.document) as TimelineDocument;
    }
    toTimelineSequence() {
      return {
        id: this.id,
        projectId: this.project_id,
        name: this.name,
        fps: this.fps,
        width: this.width,
        height: this.height,
        durationMs: this.duration_ms,
        ...this.toDocument(),
        createdAt: this.created_at,
        updatedAt: this.updated_at
      };
    }
    static findById = vi.fn();

    // Mirrors the real `deleteOwned`: ownership, the row, and the version
    // cascade in one call, so this double stays honest about what the route
    // now delegates. The route no longer does any of it itself.
    static async deleteOwned(userId: string, id: string): Promise<boolean> {
      const row = (await StubTimelineSequence.findById(id)) as StubTimelineSequence | null;
      if (!row || row.user_id !== userId) return false;
      await row.delete();
      await StubTimelineSequenceVersion.deleteForTimeline(id);
      return true;
    }
    static listByUser = vi.fn();
    static listByProject = vi.fn();
    static update = vi.fn();

    // Plain static (not vi.fn) so `vi.resetAllMocks()` doesn't strip the body.
    static async updateFieldsIfUnchanged(
      id: string,
      _expectedUpdatedAt: string,
      fields: Record<string, unknown>
    ): Promise<StubTimelineSequence | null> {
      const seq = (await StubTimelineSequence.findById(
        id
      )) as StubTimelineSequence | null;
      if (!seq) return null;
      Object.assign(seq, fields);
      await StubTimelineSequence.update(id, fields);
      return seq;
    }
  }

  class StubTimelineSequenceVersion {
    id = "ver-1";
    timeline_id = "seq-1";
    user_id = "user-1";
    name: string | null = null;
    version = 1;
    save_type = "manual";
    fps = 30;
    width = 1920;
    height = 1080;
    duration_ms = 0;
    document = JSON.stringify({ tracks: [], clips: [], markers: [] });
    created_at = "2026-01-01T00:00:00Z";
    constructor(init: Record<string, unknown> = {}) {
      Object.assign(this, init);
    }
    delete = vi.fn().mockResolvedValue(undefined);

    static listForTimeline = vi.fn();
    static findByVersion = vi.fn();
    static pruneAutosaves = vi.fn();
    static deleteForTimeline = vi.fn();
    static snapshotCalls: {
      seq: StubTimelineSequence;
      opts: { saveType: string; name?: string | null };
    }[] = [];

    // Plain static so `vi.resetAllMocks()` doesn't strip the body; calls are
    // recorded on `snapshotCalls` instead of a spy.
    static async snapshot(
      seq: StubTimelineSequence,
      opts: { saveType: string; name?: string | null }
    ): Promise<StubTimelineSequenceVersion> {
      StubTimelineSequenceVersion.snapshotCalls.push({ seq, opts });
      return new StubTimelineSequenceVersion({
        id: `ver-${StubTimelineSequenceVersion.snapshotCalls.length}`,
        timeline_id: seq.id,
        version: StubTimelineSequenceVersion.snapshotCalls.length,
        save_type: opts.saveType,
        name: opts.name ?? null,
        fps: seq.fps,
        width: seq.width,
        height: seq.height,
        duration_ms: seq.duration_ms,
        document: seq.document
      });
    }
  }

  return {
    ...actual,
    Workflow: { ...actual.Workflow, find: vi.fn() },
    TimelineSequence: StubTimelineSequence,
    TimelineSequenceVersion: StubTimelineSequenceVersion,
    createTimeOrderedUuid: () => "version-id"
  };
});

import { TimelineSequence, TimelineSequenceVersion } from "@nodetool-ai/models";

const TS = TimelineSequence as unknown as {
  findById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const TSV = TimelineSequenceVersion as unknown as {
  listForTimeline: ReturnType<typeof vi.fn>;
  findByVersion: ReturnType<typeof vi.fn>;
  pruneAutosaves: ReturnType<typeof vi.fn>;
  deleteForTimeline: ReturnType<typeof vi.fn>;
  snapshotCalls: {
    seq: { id: string };
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

function makeSeq(over: Record<string, unknown> = {}) {
  return new (TimelineSequence as unknown as new (
    init: Record<string, unknown>
  ) => InstanceType<typeof TimelineSequence>)({ ...over });
}

function makeVersion(over: Record<string, unknown> = {}) {
  return new (TimelineSequenceVersion as unknown as new (
    init: Record<string, unknown>
  ) => InstanceType<typeof TimelineSequenceVersion>)({ ...over });
}

const emptyDoc = { tracks: [], clips: [], markers: [] };

describe("timeline.versions router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    TSV.snapshotCalls.length = 0;
    __resetTimelineAutosaveVersionState();
  });
  afterEach(() => vi.restoreAllMocks());

  // ── auth triad ────────────────────────────────────────────────────────────

  describe("auth", () => {
    const cases: [string, (c: ReturnType<typeof createCaller>) => Promise<unknown>][] =
      [
        ["list", (c) => c.timeline.versions.list({ id: "seq-1" })],
        ["create", (c) => c.timeline.versions.create({ id: "seq-1" })],
        [
          "restore",
          (c) => c.timeline.versions.restore({ id: "seq-1", version: 1 })
        ]
      ];

    for (const [name, call] of cases) {
      it(`${name} rejects unauthenticated callers`, async () => {
        TS.findById.mockResolvedValue(makeSeq());
        await expect(call(createCaller(makeCtx({ userId: null })))).rejects.toThrow();
      });

      it(`${name} 404s on an unknown id`, async () => {
        TS.findById.mockResolvedValue(null);
        await expect(call(createCaller(makeCtx()))).rejects.toThrow();
      });

      it(`${name} 404s on another user's timeline`, async () => {
        TS.findById.mockResolvedValue(makeSeq({ user_id: "other" }));
        await expect(call(createCaller(makeCtx()))).rejects.toThrow();
      });
    }
  });

  // ── list ──────────────────────────────────────────────────────────────────

  it("list maps rows to metadata and forwards limit + saveType", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.listForTimeline.mockResolvedValue([
      makeVersion({ id: "v2", version: 2, save_type: "autosave", name: null }),
      makeVersion({ id: "v1", version: 1, save_type: "manual", name: "First" })
    ]);
    const out = await createCaller(makeCtx()).timeline.versions.list({
      id: "seq-1",
      limit: 10,
      saveType: "manual"
    });
    expect(TSV.listForTimeline).toHaveBeenCalledWith("seq-1", {
      limit: 10,
      saveType: "manual"
    });
    expect(out.map((v) => v.version)).toEqual([2, 1]);
    expect(out[0]).toMatchObject({
      id: "v2",
      timelineId: "seq-1",
      saveType: "autosave",
      name: null
    });
    // metadata only — no document on the wire
    expect(out[0]).not.toHaveProperty("document");
  });

  // ── get ───────────────────────────────────────────────────────────────────

  it("get parses a JSON-string document", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.findByVersion.mockResolvedValue(
      makeVersion({ version: 3, document: JSON.stringify(emptyDoc) })
    );
    const out = await createCaller(makeCtx()).timeline.versions.get({
      id: "seq-1",
      version: 3
    });
    expect(out.version).toBe(3);
    expect(out.document).toEqual(emptyDoc);
  });

  it("get accepts an already-parsed document object (Postgres)", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.findByVersion.mockResolvedValue(
      makeVersion({ version: 3, document: emptyDoc })
    );
    const out = await createCaller(makeCtx()).timeline.versions.get({
      id: "seq-1",
      version: 3
    });
    expect(out.document).toEqual(emptyDoc);
  });

  it("get 404s on a missing version", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.findByVersion.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx()).timeline.versions.get({ id: "seq-1", version: 9 })
    ).rejects.toThrow();
  });

  // ── create ────────────────────────────────────────────────────────────────

  it("create snapshots the current sequence as a manual version", async () => {
    TS.findById.mockResolvedValue(makeSeq({ fps: 24, duration_ms: 5000 }));
    const out = await createCaller(makeCtx()).timeline.versions.create({
      id: "seq-1",
      name: "Before the big cut"
    });
    expect(TSV.snapshotCalls).toHaveLength(1);
    expect(TSV.snapshotCalls[0].opts).toEqual({
      saveType: "manual",
      name: "Before the big cut"
    });
    expect(out).toMatchObject({
      version: 1,
      saveType: "manual",
      name: "Before the big cut",
      fps: 24,
      durationMs: 5000
    });
  });

  it("create defaults an omitted name to null", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    const out = await createCaller(makeCtx()).timeline.versions.create({
      id: "seq-1"
    });
    expect(TSV.snapshotCalls[0].opts.name).toBeNull();
    expect(out.name).toBeNull();
  });

  // ── restore ───────────────────────────────────────────────────────────────

  it("restore writes the version's document and scalars, after a pre-restore snapshot", async () => {
    const restoredDoc = {
      tracks: [
        {
          id: "t1",
          name: "V1",
          type: "video" as const,
          index: 0,
          visible: true,
          locked: false
        }
      ],
      clips: [],
      markers: []
    };
    TS.findById.mockResolvedValue(makeSeq({ updated_at: "2026-02-02T00:00:00Z" }));
    TSV.findByVersion.mockResolvedValue(
      makeVersion({
        version: 7,
        document: JSON.stringify(restoredDoc),
        fps: 24,
        width: 1280,
        height: 720,
        duration_ms: 4200
      })
    );

    const out = await createCaller(makeCtx()).timeline.versions.restore({
      id: "seq-1",
      version: 7
    });

    // Pre-restore snapshot, so a restore is undoable.
    expect(TSV.snapshotCalls).toHaveLength(1);
    expect(TSV.snapshotCalls[0].opts).toEqual({
      saveType: "restore",
      name: "Before restore to v7"
    });

    const [id, fields] = TS.update.mock.calls[0] as [
      string,
      Record<string, unknown>
    ];
    expect(id).toBe("seq-1");
    expect(JSON.parse(fields.document as string)).toEqual(restoredDoc);
    expect(fields).toMatchObject({
      fps: 24,
      width: 1280,
      height: 720,
      duration_ms: 4200
    });
    expect(out.fps).toBe(24);
    expect(out.tracks).toEqual(restoredDoc.tracks);
  });

  it("restore 404s on a missing version and writes nothing", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.findByVersion.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx()).timeline.versions.restore({
        id: "seq-1",
        version: 9
      })
    ).rejects.toThrow();
    expect(TSV.snapshotCalls).toHaveLength(0);
    expect(TS.update).not.toHaveBeenCalled();
  });

  it("restore reports a conflict when the sequence changed under it", async () => {
    TS.findById
      .mockResolvedValueOnce(makeSeq())
      // the CAS write re-reads and finds the row gone/changed
      .mockResolvedValue(null);
    TSV.findByVersion.mockResolvedValue(
      makeVersion({ version: 2, document: JSON.stringify(emptyDoc) })
    );
    await expect(
      createCaller(makeCtx()).timeline.versions.restore({
        id: "seq-1",
        version: 2
      })
    ).rejects.toThrow();
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it("delete removes the version row", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    const version = makeVersion({ version: 4 });
    TSV.findByVersion.mockResolvedValue(version);
    const out = await createCaller(makeCtx()).timeline.versions.delete({
      id: "seq-1",
      version: 4
    });
    expect(version.delete).toHaveBeenCalled();
    expect(out).toEqual({ ok: true });
  });

  it("delete 404s on a missing version", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.findByVersion.mockResolvedValue(null);
    await expect(
      createCaller(makeCtx()).timeline.versions.delete({
        id: "seq-1",
        version: 9
      })
    ).rejects.toThrow();
  });
});

describe("timeline autosave snapshots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    TSV.snapshotCalls.length = 0;
    __resetTimelineAutosaveVersionState();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("snapshots on the first document write and not again within the interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    TS.findById.mockResolvedValue(makeSeq());
    const caller = createCaller(makeCtx());

    await caller.timeline.update({ id: "seq-1", document: emptyDoc });
    expect(TSV.snapshotCalls).toHaveLength(1);
    expect(TSV.snapshotCalls[0].opts).toEqual({ saveType: "autosave" });
    expect(TSV.pruneAutosaves).toHaveBeenCalledWith("seq-1", 20);

    vi.advanceTimersByTime(60_000);
    await caller.timeline.update({ id: "seq-1", document: emptyDoc });
    expect(TSV.snapshotCalls).toHaveLength(1);

    // Past the 5-minute interval it snapshots again.
    vi.advanceTimersByTime(5 * 60 * 1000);
    await caller.timeline.update({ id: "seq-1", document: emptyDoc });
    expect(TSV.snapshotCalls).toHaveLength(2);
  });

  it("does not snapshot a scalar-only update", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    await createCaller(makeCtx()).timeline.update({
      id: "seq-1",
      name: "Renamed"
    });
    expect(TSV.snapshotCalls).toHaveLength(0);
  });

  it("keeps the save when snapshotting throws", async () => {
    TS.findById.mockResolvedValue(makeSeq());
    TSV.pruneAutosaves.mockRejectedValue(new Error("no such table"));
    const out = await createCaller(makeCtx()).timeline.update({
      id: "seq-1",
      document: emptyDoc
    });
    expect(out.id).toBe("seq-1");
  });

  it("timeline.delete drops the version rows and the cadence entry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    TS.findById.mockResolvedValue(makeSeq());
    const caller = createCaller(makeCtx());

    await caller.timeline.update({ id: "seq-1", document: emptyDoc });
    expect(TSV.snapshotCalls).toHaveLength(1);

    await caller.timeline.delete({ id: "seq-1" });
    expect(TSV.deleteForTimeline).toHaveBeenCalledWith("seq-1");

    // The cadence entry went with it, so the next write snapshots immediately.
    await caller.timeline.update({ id: "seq-1", document: emptyDoc });
    expect(TSV.snapshotCalls).toHaveLength(2);
  });
});
