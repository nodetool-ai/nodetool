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

  describe("versions", () => {
    const docWithClip: TimelineDocument = {
      tracks: [],
      clips: [
        {
          id: "clip-1",
          trackId: "v1",
          name: "Clip",
          startMs: 0,
          durationMs: 1000,
          mediaType: "video",
          sourceType: "imported",
          status: "generated",
          locked: false,
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
      markers: []
    };

    it("list returns the clip versions", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.versions.list({
        id: "seq-1",
        clipId: "clip-1"
      });
      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe("v0");
    });

    it("list 404s on unknown clip", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.timeline.versions.list({ id: "seq-1", clipId: "nope" })
      ).rejects.toThrow();
    });

    it("append adds a new version and persists", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      TS.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.versions.append({
        id: "seq-1",
        clipId: "clip-1",
        jobId: "job-2",
        assetId: "asset-2",
        dependencyHash: "h2",
        workflowUpdatedAt: "2026-01-02T00:00:00Z"
      });
      expect(out.id).toBe("version-id");
      expect(out.status).toBe("success");
      expect(TS.update).toHaveBeenCalled();
      const updateArgs = TS.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as TimelineDocument;
      expect(persisted.clips[0].versions).toHaveLength(2);
    });

    it("append prunes successful versions beyond cap, keeping favorites", async () => {
      // Build a clip with 10 successful versions (none favorited) + 1 favorite
      const existingVersions = Array.from({ length: 10 }, (_, i) => ({
        id: `v-${i}`,
        createdAt: `2026-01-01T00:00:0${i}Z`,
        jobId: `j-${i}`,
        assetId: `a-${i}`,
        workflowUpdatedAt: "2026-01-01T00:00:00Z",
        dependencyHash: `h${i}`,
        paramOverridesSnapshot: {},
        status: "success" as const,
        favorite: i === 0 // first one is favorited
      }));

      const docWithManyVersions: TimelineDocument = {
        tracks: [],
        clips: [
          {
            id: "clip-1",
            trackId: "v1",
            name: "Clip",
            startMs: 0,
            durationMs: 1000,
            mediaType: "video",
            sourceType: "imported",
            status: "generated",
            locked: false,
            versions: existingVersions
          }
        ],
        markers: []
      };

      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithManyVersions) })
      );
      TS.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      await caller.timeline.versions.append({
        id: "seq-1",
        clipId: "clip-1",
        jobId: "job-new",
        assetId: "asset-new",
        dependencyHash: "h-new",
        workflowUpdatedAt: "2026-01-02T00:00:00Z"
      });
      const updateArgs = TS.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as TimelineDocument;
      const versions = persisted.clips[0].versions!;
      // Favorites are retained on top of the non-favorite cap (mirrors sketch):
      // the 1 favorite plus the newest MAX_SUCCESSFUL_VERSIONS non-favorites.
      // Here there are exactly 10 non-favorite successes (9 old + the new one),
      // so all are kept and the favorite is extra: 11 total.
      expect(versions.filter((v) => !v.favorite).length).toBeLessThanOrEqual(
        10
      );
      // The favorite version must still be present.
      expect(versions.some((v) => v.id === "v-0")).toBe(true);
      // The just-appended version is retained.
      expect(versions.some((v) => v.jobId === "job-new")).toBe(true);
    });

    it("append keeps the just-created version even when favorites fill the cap", async () => {
      // Regression (#16): previously, 10 favorites zeroed the non-favorite
      // slots and the freshly-appended version was silently dropped while still
      // being returned to the client as saved. Favorites must not evict the new
      // generation result.
      const allFavVersions = Array.from({ length: 10 }, (_, i) => ({
        id: `vf-${i}`,
        createdAt: `2026-01-01T00:00:0${i}Z`,
        jobId: `j-${i}`,
        assetId: `a-${i}`,
        workflowUpdatedAt: "2026-01-01T00:00:00Z",
        dependencyHash: `h${i}`,
        paramOverridesSnapshot: {},
        status: "success" as const,
        favorite: true
      }));

      const docAllFav: TimelineDocument = {
        tracks: [],
        clips: [
          {
            id: "clip-1",
            trackId: "v1",
            name: "Clip",
            startMs: 0,
            durationMs: 1000,
            mediaType: "video",
            sourceType: "imported",
            status: "generated",
            locked: false,
            versions: allFavVersions
          }
        ],
        markers: []
      };

      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docAllFav) })
      );
      TS.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.versions.append({
        id: "seq-1",
        clipId: "clip-1",
        jobId: "job-new",
        assetId: "asset-new",
        dependencyHash: "h-new",
        workflowUpdatedAt: "2026-01-02T00:00:00Z"
      });
      const updateArgs = TS.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as TimelineDocument;
      const versions = persisted.clips[0].versions!;
      // All 10 favorites survive (favorites are not counted against the cap).
      expect(versions.filter((v) => v.favorite).length).toBe(10);
      // The just-created non-favorite version is retained, not dropped.
      expect(versions.some((v) => v.id === out.id)).toBe(true);
      expect(versions.filter((v) => !v.favorite)).toHaveLength(1);
      expect(versions.length).toBe(11);
    });

    it("setFavorite toggles the favorite flag", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      TS.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.versions.setFavorite({
        id: "seq-1",
        clipId: "clip-1",
        versionId: "v0",
        favorite: true
      });
      expect(out.favorite).toBe(true);
      expect(TS.update).toHaveBeenCalled();
    });

    it("setFavorite 404s on unknown version", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.timeline.versions.setFavorite({
          id: "seq-1",
          clipId: "clip-1",
          versionId: "nope",
          favorite: true
        })
      ).rejects.toThrow();
    });

    it("delete removes the version and persists", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      TS.update.mockResolvedValue(undefined);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.versions.delete({
        id: "seq-1",
        clipId: "clip-1",
        versionId: "v0"
      });
      expect(out.ok).toBe(true);
      const updateArgs = TS.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as TimelineDocument;
      expect(persisted.clips[0].versions).toHaveLength(0);
    });

    it("delete 404s on unknown version", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(docWithClip) })
      );
      const caller = createCaller(makeCtx());
      await expect(
        caller.timeline.versions.delete({
          id: "seq-1",
          clipId: "clip-1",
          versionId: "nope"
        })
      ).rejects.toThrow();
    });
  });

  describe("clips", () => {
    const clipDoc: TimelineDocument = {
      tracks: [],
      clips: [
        {
          id: "clip-1",
          trackId: "t1",
          name: "Generated",
          startMs: 500,
          durationMs: 1000,
          mediaType: "video",
          sourceType: "generated",
          workflowId: "wf-1",
          paramOverrides: { prompt: "hello" },
          status: "generated",
          locked: false,
          versions: []
        }
      ],
      markers: []
    };

    it("delete removes only the clip", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(clipDoc) })
      );
      TS.update.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.timeline.clips.delete({
        id: "seq-1",
        clipId: "clip-1"
      });

      expect(out.ok).toBe(true);
      const updateArgs = TS.update.mock.calls[0]?.[1];
      const persisted = JSON.parse(
        updateArgs?.document as string
      ) as TimelineDocument;
      expect(persisted.clips).toHaveLength(0);
    });

    it("duplicate copies overrides and shares the workflow", async () => {
      TS.findById.mockResolvedValue(
        makeSeq({ document: JSON.stringify(clipDoc) })
      );
      TS.update.mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const out = await caller.timeline.clips.duplicate({
        id: "seq-1",
        clipId: "clip-1",
        deltaMs: 2000
      });

      expect(out.id).toBe("version-id");
      expect(out.workflowId).toBe("wf-1");
      expect(out.startMs).toBe(2500);
      expect(out.paramOverrides).toEqual({ prompt: "hello" });
    });
  });
});
