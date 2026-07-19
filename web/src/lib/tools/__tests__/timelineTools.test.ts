/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setTimelineAgentHandler,
  type TimelineAgentHandler,
  type TimelineClipFrameNode,
  type TimelineClipNode,
  type TimelineSnapshot,
  type TimelineTrackNode
} from "../../../components/timeline/timelineAgentBridge";
import "../builtin/timeline";

const clipNode = (
  overrides: Partial<TimelineClipNode> = {}
): TimelineClipNode => ({
  id: "clip-1",
  name: "Clip 1",
  trackId: "track-1",
  trackName: "Video 1",
  mediaType: "video",
  sourceType: "generated",
  bindingKind: "text-to-video",
  startMs: 0,
  durationMs: 4000,
  endMs: 4000,
  status: "draft",
  hasRender: false,
  hidden: false,
  muted: false,
  locked: false,
  ...overrides
});

const trackNode = (
  overrides: Partial<TimelineTrackNode> = {}
): TimelineTrackNode => ({
  id: "track-1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false,
  muted: false,
  solo: false,
  clipCount: 1,
  ...overrides
});

const snapshot = (): TimelineSnapshot => ({
  sequenceId: "seq-1",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 4000,
  playheadMs: 0,
  selectedClipIds: [],
  tracks: [trackNode()],
  clips: [clipNode()]
});

const createMockHandler = (): jest.Mocked<TimelineAgentHandler> => ({
  getSnapshot: jest.fn(),
  addTrack: jest.fn(),
  generateClip: jest.fn(),
  splitClip: jest.fn(),
  trimClip: jest.fn(),
  moveClip: jest.fn(),
  deleteClip: jest.fn(),
  duplicateClip: jest.fn(),
  setClipParams: jest.fn(),
  setClipBinding: jest.fn(),
  setClipAnimations: jest.fn(),
  clearClipAnimations: jest.fn(),
  getClipFrames: jest.fn(),
  selectClip: jest.fn(),
  seek: jest.fn()
});

// The timeline tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

afterEach(() => {
  setTimelineAgentHandler(null);
});

describe("ui_timeline_* tools", () => {
  it("registers all timeline tools in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_timeline_get_state",
        "ui_timeline_add_track",
        "ui_timeline_generate_clip",
        "ui_timeline_split_clip",
        "ui_timeline_trim_clip",
        "ui_timeline_move_clip",
        "ui_timeline_delete_clip",
        "ui_timeline_duplicate_clip",
        "ui_timeline_set_clip_params",
        "ui_timeline_set_clip_binding",
        "ui_timeline_animate_clip",
        "ui_timeline_clear_animations",
        "ui_timeline_list_animation_presets",
        "ui_timeline_get_clip_frames",
        "ui_timeline_select_clip",
        "ui_timeline_seek"
      ])
    );
  });

  it("exposes split_clip's parameter schema with target required", () => {
    // The model only learns `target` is required from this schema. If the
    // manifest ships an empty schema (or the server reads the wrong field), the
    // model calls split with no target and the tool rejects with a Zod error.
    const splitTool = FrontendToolRegistry.getManifest().find(
      (t) => t.name === "ui_timeline_split_clip"
    );
    expect(splitTool).toBeDefined();
    const schema = splitTool?.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("target");
    expect(schema.required).toContain("target");
  });

  it("rejects with a descriptive error when no editor is open", async () => {
    await expect(
      FrontendToolRegistry.call("ui_timeline_get_state", {}, "tc-1", ctx)
    ).rejects.toThrow("No timeline editor is open");
  });

  it("returns the timeline snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setTimelineAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_get_state",
      {},
      "tc-2",
      ctx
    )) as { ok: boolean } & TimelineSnapshot;

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.clips).toHaveLength(1);
    expect(result.tracks[0].name).toBe("Video 1");
  });

  it("generates a clip via the handler", async () => {
    const handler = createMockHandler();
    handler.generateClip.mockResolvedValue({
      clip: clipNode({ name: "city at night" }),
      generationStarted: true
    });
    setTimelineAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_generate_clip",
      {
        kind: "text-to-video",
        prompt: "city at night",
        provider: "fal",
        model: "some-video-model"
      },
      "tc-3",
      ctx
    )) as { ok: boolean; clip: TimelineClipNode; generationStarted: boolean };

    expect(handler.generateClip).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "text-to-video",
        prompt: "city at night",
        provider: "fal",
        model: "some-video-model"
      })
    );
    expect(result.ok).toBe(true);
    expect(result.generationStarted).toBe(true);
    expect(result.clip.name).toBe("city at night");
  });

  it("rejects an unknown generation kind during validation", async () => {
    setTimelineAgentHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_generate_clip",
        { kind: "text-to-hologram", prompt: "x" },
        "tc-4",
        ctx
      )
    ).rejects.toThrow();
  });

  it("splits a clip at a time through the handler", async () => {
    const handler = createMockHandler();
    handler.splitClip.mockReturnValue([
      clipNode({ id: "left", durationMs: 1000, endMs: 1000 }),
      clipNode({ id: "right", startMs: 1000, durationMs: 3000, endMs: 4000 })
    ]);
    setTimelineAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_split_clip",
      { target: "Clip 1", atMs: 1000 },
      "tc-5",
      ctx
    )) as { ok: boolean; clips: TimelineClipNode[] };

    expect(handler.splitClip).toHaveBeenCalledWith("Clip 1", 1000);
    expect(result.clips.map((c) => c.id)).toEqual(["left", "right"]);
  });

  it("forwards clip param patches to the handler", async () => {
    const handler = createMockHandler();
    handler.setClipParams.mockReturnValue(clipNode({ opacity: 0.5 }));
    setTimelineAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_timeline_set_clip_params",
      { target: "selected", opacity: 0.5, fadeOutMs: 500 },
      "tc-6",
      ctx
    );

    expect(handler.setClipParams).toHaveBeenCalledWith("selected", {
      opacity: 0.5,
      fadeOutMs: 500
    });
  });

  it("gets video frames through the handler", async () => {
    const handler = createMockHandler();
    const frame: TimelineClipFrameNode = {
      clipId: "clip-1",
      clipName: "Clip 1",
      timelineTimeMs: 1000,
      sourceTimeMs: 1000,
      width: 512,
      height: 288,
      dataUrl: "data:image/jpeg;base64,abc"
    };
    handler.getClipFrames.mockResolvedValue({
      clip: clipNode({ hasRender: true }),
      frames: [frame]
    });
    setTimelineAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_get_clip_frames",
      { target: "Clip 1", timesMs: [1000], width: 512 },
      "tc-frames",
      ctx
    )) as { ok: boolean; frames: TimelineClipFrameNode[] };

    expect(handler.getClipFrames).toHaveBeenCalledWith("Clip 1", {
      timesMs: [1000],
      count: undefined,
      width: 512
    });
    expect(result.ok).toBe(true);
    expect(result.frames[0].dataUrl).toBe("data:image/jpeg;base64,abc");
  });

  it("moves a clip to a new start and track", async () => {
    const handler = createMockHandler();
    handler.moveClip.mockReturnValue(
      clipNode({ startMs: 2000, endMs: 6000, trackId: "track-2" })
    );
    setTimelineAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_timeline_move_clip",
      { target: "clip-1", startMs: 2000, trackId: "track-2" },
      "tc-7",
      ctx
    );

    expect(handler.moveClip).toHaveBeenCalledWith("clip-1", {
      startMs: 2000,
      trackId: "track-2"
    });
  });

  it("seeks the playhead through the handler", async () => {
    const handler = createMockHandler();
    handler.seek.mockReturnValue(1500);
    setTimelineAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_seek",
      { timeMs: 1500 },
      "tc-8",
      ctx
    )) as { ok: boolean; playheadMs: number };

    expect(handler.seek).toHaveBeenCalledWith(1500);
    expect(result.playheadMs).toBe(1500);
  });

  it("animates a clip, defaulting mode to replace", async () => {
    const handler = createMockHandler();
    handler.setClipAnimations.mockReturnValue(clipNode());
    setTimelineAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_timeline_animate_clip",
      {
        target: "selected",
        animations: [{ role: "in", preset: "pop", durationMs: 400 }]
      },
      "tc-anim",
      ctx
    );

    expect(handler.setClipAnimations).toHaveBeenCalledWith(
      "selected",
      [{ role: "in", preset: "pop", durationMs: 400 }],
      "replace"
    );
  });

  it("passes mode add through to the handler", async () => {
    const handler = createMockHandler();
    handler.setClipAnimations.mockReturnValue(clipNode());
    setTimelineAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_timeline_animate_clip",
      {
        target: "clip-1",
        mode: "add",
        animations: [{ role: "loop", preset: "float" }]
      },
      "tc-anim-add",
      ctx
    );

    expect(handler.setClipAnimations).toHaveBeenCalledWith(
      "clip-1",
      [{ role: "loop", preset: "float" }],
      "add"
    );
  });

  it("rejects an animation with an unknown role during validation", async () => {
    setTimelineAgentHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_animate_clip",
        { target: "clip-1", animations: [{ role: "wiggle", preset: "pop" }] },
        "tc-anim-bad",
        ctx
      )
    ).rejects.toThrow();
  });

  it("clears animations, forwarding an optional role filter", async () => {
    const handler = createMockHandler();
    handler.clearClipAnimations.mockReturnValue(clipNode());
    setTimelineAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_timeline_clear_animations",
      { target: "clip-1", role: "out" },
      "tc-clear",
      ctx
    );

    expect(handler.clearClipAnimations).toHaveBeenCalledWith("clip-1", "out");
  });

  it("lists the animation preset catalog without needing an editor", async () => {
    const result = (await FrontendToolRegistry.call(
      "ui_timeline_list_animation_presets",
      {},
      "tc-presets",
      ctx
    )) as {
      ok: boolean;
      presets: Array<{ id: string; roles: string[]; describe: string }>;
    };

    expect(result.ok).toBe(true);
    const ids = result.presets.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["fade", "slide", "pop", "kenBurns", "float"])
    );
    const kenBurns = result.presets.find((p) => p.id === "kenBurns");
    expect(kenBurns?.roles).toContain("loop");
  });
});
