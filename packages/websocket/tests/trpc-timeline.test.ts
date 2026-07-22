import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
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
    static listByUser = vi.fn();
    static listByProject = vi.fn();
    // `update` is retained as the spy the assertions inspect; the atomic
    // helpers below route their write through it so existing assertions on
    // `TS.update.mock.calls[...]` keep working. These helpers are plain static
    // methods (not vi.fn) so `vi.resetAllMocks()` doesn't strip their bodies.
    static update = vi.fn();

    static async updateDocumentIfUnchanged(
      id: string,
      _expectedUpdatedAt: string,
      doc: TimelineDocument
    ): Promise<StubTimelineSequence | null> {
      const seq = (await StubTimelineSequence.findById(
        id
      )) as StubTimelineSequence | null;
      if (!seq) return null;
      seq.document = JSON.stringify(doc);
      await StubTimelineSequence.update(id, { document: seq.document });
      return seq;
    }

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

    static async mutateDocument(
      id: string,
      mutator: (
        doc: TimelineDocument,
        seq: StubTimelineSequence
      ) => unknown | Promise<unknown>
    ): Promise<{ sequence: StubTimelineSequence; result: unknown } | null> {
      const seq = (await StubTimelineSequence.findById(
        id
      )) as StubTimelineSequence | null;
      if (!seq) return null;
      const doc = seq.toDocument();
      const result = await mutator(doc, seq);
      seq.document = JSON.stringify(doc);
      await StubTimelineSequence.update(id, { document: seq.document });
      return { sequence: seq, result };
    }
  }
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      find: vi.fn()
    },
    TimelineSequence: StubTimelineSequence,
    createTimeOrderedUuid: () => "version-id"
  };
});

import { TimelineSequence, Workflow } from "@nodetool-ai/models";

const TS = TimelineSequence as unknown as {
  findById: ReturnType<typeof vi.fn>;
  listByUser: ReturnType<typeof vi.fn>;
  listByProject: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
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

function makeSeq(over: Partial<Record<string, unknown>> = {}) {
  return new (TimelineSequence as unknown as new (
    init: Record<string, unknown>
  ) => InstanceType<typeof TimelineSequence>)({ ...over });
}

describe("timeline router", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  describe("list", () => {
    it("returns sequences for the user when no projectId given", async () => {
      TS.listByUser.mockResolvedValue([
        makeSeq({ id: "a" }),
        makeSeq({ id: "b" })
      ]);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.list({});
      expect(TS.listByUser).toHaveBeenCalledWith("user-1");
      expect(out.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("scopes project listing by user before applying its limit", async () => {
      TS.listByProject.mockResolvedValue([
        makeSeq({ id: "a", user_id: "user-1" })
      ]);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.list({ projectId: "p-1" });
      expect(out.map((s) => s.id)).toEqual(["a"]);
      expect(TS.listByProject).toHaveBeenCalledWith("p-1", "user-1");
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.timeline.list({})).rejects.toThrow();
    });
  });

  describe("get", () => {
    it("returns the sequence when owned", async () => {
      TS.findById.mockResolvedValue(makeSeq({ id: "x" }));
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.get({ id: "x" });
      expect(out.id).toBe("x");
    });

    it("404 on unknown id", async () => {
      TS.findById.mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(caller.timeline.get({ id: "x" })).rejects.toThrow();
    });

    it("404 when owned by another user", async () => {
      TS.findById.mockResolvedValue(makeSeq({ user_id: "other" }));
      const caller = createCaller(makeCtx());
      await expect(caller.timeline.get({ id: "x" })).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("persists with defaults applied", async () => {
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.create({
        name: "New",
        projectId: "p-1"
      });
      expect(out.name).toBe("New");
      expect(out.fps).toBe(30);
      expect(out.width).toBe(1920);
      expect(out.height).toBe(1080);
    });

    it("honors a client-supplied id", async () => {
      TS.findById.mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.create({
        id: "client-minted-id",
        name: "New",
        projectId: "p-1"
      });
      expect(out.id).toBe("client-minted-id");
    });

    it("is idempotent — a repeated create returns the existing sequence", async () => {
      TS.findById.mockResolvedValue(makeSeq({ id: "dupe", name: "Original" }));
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.create({
        id: "dupe",
        name: "Should be ignored",
        projectId: "p-1"
      });
      expect(out.id).toBe("dupe");
      expect(out.name).toBe("Original");
    });

    it("hides another user's sequence behind a 404 rather than overwriting it", async () => {
      TS.findById.mockResolvedValue(makeSeq({ id: "theirs", user_id: "other" }));
      const caller = createCaller(makeCtx());
      await expect(
        caller.timeline.create({ id: "theirs", name: "Mine", projectId: "p-1" })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("merges document fields", async () => {
      TS.findById.mockResolvedValue(makeSeq());
      const updated = makeSeq({ name: "Renamed" });
      TS.update.mockResolvedValue(updated);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.update({
        id: "seq-1",
        name: "Renamed",
        document: { tracks: [], clips: [], markers: [] }
      });
      expect(out.name).toBe("Renamed");
      expect(TS.update).toHaveBeenCalled();
    });

    it("persists the transcript in the merged document", async () => {
      TS.findById.mockResolvedValue(makeSeq());
      TS.update.mockResolvedValue(makeSeq());
      const caller = createCaller(makeCtx());
      const transcript = [
        { id: "l1", text: "Hello world.", beatStartMs: 0, clipIds: ["vo-1"] }
      ];
      await caller.timeline.update({
        id: "seq-1",
        document: { tracks: [], clips: [], markers: [], transcript }
      });
      const savedDocument = JSON.parse(
        TS.update.mock.calls[0][1].document as string
      );
      expect(savedDocument.transcript).toEqual(transcript);
    });

    it("preserves an existing transcript when the patch omits it", async () => {
      const transcript = [
        { id: "l1", text: "Kept.", beatStartMs: 0, clipIds: [] }
      ];
      TS.findById.mockResolvedValue(
        makeSeq({
          document: JSON.stringify({
            tracks: [],
            clips: [],
            markers: [],
            transcript
          })
        })
      );
      TS.update.mockResolvedValue(makeSeq());
      const caller = createCaller(makeCtx());
      await caller.timeline.update({
        id: "seq-1",
        document: { tracks: [], clips: [], markers: [] }
      });
      const savedDocument = JSON.parse(
        TS.update.mock.calls[0][1].document as string
      );
      expect(savedDocument.transcript).toEqual(transcript);
    });

    it("persists a clip's word-level caption through the round-trip", async () => {
      TS.findById.mockResolvedValue(makeSeq());
      TS.update.mockResolvedValue(makeSeq());
      const caller = createCaller(makeCtx());
      const caption = {
        words: [
          { word: "Hello", startMs: 0, endMs: 400 },
          { word: "world", startMs: 400, endMs: 900 }
        ]
      };
      await caller.timeline.update({
        id: "seq-1",
        document: {
          tracks: [],
          clips: [
            {
              id: "cap-1",
              trackId: "subs",
              name: "Caption",
              startMs: 0,
              durationMs: 900,
              mediaType: "video",
              sourceType: "generated",
              status: "generated",
              locked: false,
              versions: [],
              caption
            }
          ],
          markers: []
        }
      });
      const savedDocument = JSON.parse(
        TS.update.mock.calls[0][1].document as string
      );
      expect(savedDocument.clips[0].caption).toEqual(caption);
    });

    it("persists a clip's linkId through the round-trip", async () => {
      TS.findById.mockResolvedValue(makeSeq());
      TS.update.mockResolvedValue(makeSeq());
      const caller = createCaller(makeCtx());
      await caller.timeline.update({
        id: "seq-1",
        document: {
          tracks: [],
          clips: [
            {
              id: "vid-1",
              trackId: "v1",
              name: "Video",
              startMs: 0,
              durationMs: 1000,
              mediaType: "video",
              sourceType: "imported",
              status: "generated",
              locked: false,
              versions: [],
              linkId: "lnk-x"
            },
            {
              id: "aud-1",
              trackId: "a1",
              name: "Audio",
              startMs: 0,
              durationMs: 1000,
              mediaType: "audio",
              sourceType: "imported",
              status: "generated",
              locked: false,
              versions: [],
              linkId: "lnk-x"
            }
          ],
          markers: []
        }
      });
      const savedDocument = JSON.parse(
        TS.update.mock.calls[0][1].document as string
      );
      expect(savedDocument.clips[0].linkId).toBe("lnk-x");
      expect(savedDocument.clips[1].linkId).toBe("lnk-x");
    });

    it("persists scriptEnabled through update and returns it from get", async () => {
      TS.findById.mockResolvedValue(makeSeq());
      let savedDocumentJson = "";
      TS.update.mockImplementation((_id, fields) => {
        savedDocumentJson = (fields as { document: string }).document;
        return Promise.resolve(makeSeq({ document: savedDocumentJson }));
      });
      const caller = createCaller(makeCtx());
      await caller.timeline.update({
        id: "seq-1",
        document: {
          tracks: [],
          clips: [],
          markers: [],
          scriptEnabled: true
        }
      });
      const savedDocument = JSON.parse(savedDocumentJson);
      expect(savedDocument.scriptEnabled).toBe(true);

      TS.findById.mockResolvedValue(
        makeSeq({ id: "seq-1", document: savedDocumentJson })
      );
      const got = await caller.timeline.get({ id: "seq-1" });
      expect(got.scriptEnabled).toBe(true);
    });

    it("persists a clip's speaker and paragraphId through the round-trip", async () => {
      TS.findById.mockResolvedValue(makeSeq());
      TS.update.mockResolvedValue(makeSeq());
      const caller = createCaller(makeCtx());
      await caller.timeline.update({
        id: "seq-1",
        document: {
          tracks: [],
          clips: [
            {
              id: "vo-1",
              trackId: "a1",
              name: "VO",
              startMs: 0,
              durationMs: 900,
              mediaType: "audio",
              sourceType: "generated",
              status: "generated",
              locked: false,
              versions: [],
              speaker: "Alice",
              paragraphId: "para-1"
            }
          ],
          markers: []
        }
      });
      const savedDocument = JSON.parse(
        TS.update.mock.calls[0][1].document as string
      );
      expect(savedDocument.clips[0].speaker).toBe("Alice");
      expect(savedDocument.clips[0].paragraphId).toBe("para-1");
    });

    it("rejects stale baseUpdatedAt", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ updated_at: "2026-01-02T00:00:00Z" })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.timeline.update({
          id: "seq-1",
          name: "X",
          baseUpdatedAt: "2026-01-01T00:00:00Z"
        })
      ).rejects.toThrow();
    });

    it("accepts matching baseUpdatedAt", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ updated_at: "2026-01-02T00:00:00Z" })
      );
      TS.update.mockResolvedValue(makeSeq({ name: "X" }));
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.update({
        id: "seq-1",
        name: "X",
        baseUpdatedAt: "2026-01-02T00:00:00Z"
      });
      expect(out.name).toBe("X");
    });
  });

  describe("delete", () => {
    it("deletes when owned", async () => {
      const seq = makeSeq();
      TS.findById.mockResolvedValue(seq);
      const caller = createCaller(makeCtx());
      await caller.timeline.delete({ id: "seq-1" });
      expect(seq.delete).toHaveBeenCalled();
    });

    it("404 when not owned", async () => {
      TS.findById.mockResolvedValue(makeSeq({ user_id: "other" }));
      const caller = createCaller(makeCtx());
      await expect(caller.timeline.delete({ id: "seq-1" })).rejects.toThrow();
    });
  });
});
