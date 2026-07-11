/**
 * Additional coverage for the tRPC timeline router, focused on the
 * `clips.create` flow (source-workflow validation, output-node selection,
 * media-type override, param/duration extraction) and a few auth branches not
 * exercised by trpc-timeline.test.ts.
 */
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
  let counter = 0;
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      find: vi.fn()
    },
    TimelineSequence: StubTimelineSequence,
    createTimeOrderedUuid: () => `uuid-${counter++}`
  };
});

import { TimelineSequence, Workflow } from "@nodetool-ai/models";

const TS = TimelineSequence as unknown as {
  findById: ReturnType<typeof vi.fn>;
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

function workflow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "wf-1",
    name: "My Workflow",
    updated_at: "2026-02-02T00:00:00Z",
    graph: { nodes: [], edges: [] },
    ...over
  };
}

describe("timeline.clips.create", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    TS.findById.mockResolvedValue(makeSeq());
    TS.update.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("404s when the source workflow is not found", async () => {
    WF.find.mockResolvedValue(null);
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.create({
        id: "seq-1",
        trackId: "t1",
        startMs: 0,
        sourceWorkflowId: "wf-missing"
      })
    ).rejects.toThrow(/not found|not accessible/i);
  });

  it("errors when the source workflow has no media output node", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }] }
      })
    );
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.create({
        id: "seq-1",
        trackId: "t1",
        startMs: 0,
        sourceWorkflowId: "wf-1"
      })
    ).rejects.toThrow(/media output/i);
  });

  it("auto-picks the single output node and inherits the workflow name", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [{ id: "out-1", type: "nodetool.output.ImageOutput" }]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 250,
      sourceWorkflowId: "wf-1"
    });
    expect(clip.name).toBe("My Workflow");
    expect(clip.mediaType).toBe("image");
    expect(clip.startMs).toBe(250);
    expect(clip.workflowId).toBe("wf-1");
    expect(clip.selectedOutputNodeId).toBe("out-1");
    // image default duration
    expect(clip.durationMs).toBe(4000);
    expect(TS.update).toHaveBeenCalled();
  });

  it("requires selectedOutputNodeId when multiple output nodes exist", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [
            { id: "out-1", type: "nodetool.output.ImageOutput" },
            { id: "out-2", type: "nodetool.output.VideoOutput" }
          ]
        }
      })
    );
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.create({
        id: "seq-1",
        trackId: "t1",
        startMs: 0,
        sourceWorkflowId: "wf-1"
      })
    ).rejects.toThrow(/multiple terminal output nodes/i);
  });

  it("rejects a selectedOutputNodeId that is not a terminal output node", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [
            { id: "out-1", type: "nodetool.output.ImageOutput" },
            { id: "out-2", type: "nodetool.output.VideoOutput" }
          ]
        }
      })
    );
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.create({
        id: "seq-1",
        trackId: "t1",
        startMs: 0,
        sourceWorkflowId: "wf-1",
        selectedOutputNodeId: "not-an-output"
      })
    ).rejects.toThrow(/is not a terminal output node/i);
  });

  it("honors an explicit selectedOutputNodeId among multiple outputs", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [
            { id: "out-1", type: "nodetool.output.ImageOutput" },
            { id: "out-2", type: "nodetool.output.VideoOutput" }
          ]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 0,
      sourceWorkflowId: "wf-1",
      selectedOutputNodeId: "out-2"
    });
    expect(clip.selectedOutputNodeId).toBe("out-2");
    expect(clip.mediaType).toBe("video");
  });

  it("applies the overlay override only for video outputs", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [{ id: "out-1", type: "nodetool.output.VideoOutput" }]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 0,
      sourceWorkflowId: "wf-1",
      mediaTypeOverride: "overlay"
    });
    expect(clip.mediaType).toBe("overlay");
  });

  it("ignores the overlay override for non-video outputs", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [{ id: "out-1", type: "nodetool.output.ImageOutput" }]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 0,
      sourceWorkflowId: "wf-1",
      mediaTypeOverride: "overlay"
    });
    expect(clip.mediaType).toBe("image");
  });

  it("extracts param overrides and duration_ms from input nodes", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [
            { id: "out-1", type: "nodetool.output.VideoOutput" },
            {
              id: "in-1",
              type: "nodetool.input.StringInput",
              data: { name: "prompt", value: "a cat" }
            },
            {
              id: "in-2",
              type: "nodetool.input.IntegerInput",
              data: { name: "duration_ms", value: 7500 }
            },
            {
              // input node without a name — skipped
              id: "in-3",
              type: "nodetool.input.FloatInput",
              data: { value: 1 }
            }
          ]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 0,
      sourceWorkflowId: "wf-1"
    });
    expect(clip.durationMs).toBe(7500);
    expect(clip.paramOverrides).toMatchObject({
      prompt: "a cat",
      duration_ms: 7500
    });
    // unnamed input node contributed no override key
    expect(Object.keys(clip.paramOverrides ?? {})).toHaveLength(2);
  });

  it("reads input node name from dynamic_properties when data.name is absent", async () => {
    WF.find.mockResolvedValue(
      workflow({
        graph: {
          nodes: [
            { id: "out-1", type: "nodetool.output.AudioOutput" },
            {
              id: "in-1",
              type: "nodetool.input.StringInput",
              dynamic_properties: { name: "voice" },
              data: { value: "alto" }
            }
          ]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 0,
      sourceWorkflowId: "wf-1"
    });
    // audio has no DEFAULT_DURATION override beyond 4000
    expect(clip.mediaType).toBe("audio");
    expect(clip.durationMs).toBe(4000);
    expect(clip.paramOverrides).toMatchObject({ voice: "alto" });
  });

  it("falls back to a generated workflowUpdatedAt when the source lacks one", async () => {
    WF.find.mockResolvedValue(
      workflow({
        updated_at: null,
        graph: {
          nodes: [{ id: "out-1", type: "nodetool.output.ImageOutput" }]
        }
      })
    );
    const caller = createCaller(makeCtx());
    const clip = await caller.timeline.clips.create({
      id: "seq-1",
      trackId: "t1",
      startMs: 0,
      sourceWorkflowId: "wf-1"
    });
    // dependencyHash is computed regardless; clip is created successfully
    expect(clip.workflowId).toBe("wf-1");
    expect(typeof clip.dependencyHash).toBe("string");
  });

  it("handles a workflow whose graph is missing entirely (no nodes)", async () => {
    WF.find.mockResolvedValue(workflow({ graph: undefined }));
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.create({
        id: "seq-1",
        trackId: "t1",
        startMs: 0,
        sourceWorkflowId: "wf-1"
      })
    ).rejects.toThrow(/media output/i);
  });
});

describe("timeline auth branches", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("versions.list rejects unauthenticated callers before any DB read", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(
      caller.timeline.versions.list({ id: "seq-1", clipId: "c" })
    ).rejects.toThrow();
    expect(TS.findById).not.toHaveBeenCalled();
  });

  it("clips.duplicate 404s on unknown clip id", async () => {
    TS.findById.mockResolvedValue(
      makeSeq({
        document: JSON.stringify({ tracks: [], clips: [], markers: [] })
      })
    );
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.duplicate({
        id: "seq-1",
        clipId: "missing",
        deltaMs: 0
      })
    ).rejects.toThrow(/clip not found/i);
  });

  it("clips.delete 404s on unknown clip id", async () => {
    TS.findById.mockResolvedValue(
      makeSeq({
        document: JSON.stringify({ tracks: [], clips: [], markers: [] })
      })
    );
    const caller = createCaller(makeCtx());
    await expect(
      caller.timeline.clips.delete({ id: "seq-1", clipId: "missing" })
    ).rejects.toThrow(/clip not found/i);
  });
});
