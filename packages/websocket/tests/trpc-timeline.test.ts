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
    static update = vi.fn();
  }
  return {
    ...actual,
    TimelineSequence: StubTimelineSequence,
    createTimeOrderedUuid: () => "version-id"
  };
});

import { TimelineSequence } from "@nodetool-ai/models";

const TS = TimelineSequence as unknown as {
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

    it("filters by projectId and excludes other users' sequences", async () => {
      TS.listByProject.mockResolvedValue([
        makeSeq({ id: "a", user_id: "user-1" }),
        makeSeq({ id: "b", user_id: "other" })
      ]);
      const caller = createCaller(makeCtx());
      const out = await caller.timeline.list({ projectId: "p-1" });
      expect(out.map((s) => s.id)).toEqual(["a"]);
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
  });
});
