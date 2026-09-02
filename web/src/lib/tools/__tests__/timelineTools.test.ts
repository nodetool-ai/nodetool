/**
 * @jest-environment node
 */
import { SHARED_TIMELINE_TOOL_NAMES } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setTimelineAgentHandler,
  listOpenTimelineSequenceIds,
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
  clips: [clipNode()],
  markers: []
});

const createMockHandler = (): jest.Mocked<TimelineAgentHandler> => ({
  getSnapshot: jest.fn(),
  addTrack: jest.fn(),
  addMediaClip: jest.fn(),
  addTextClip: jest.fn(),
  addShapeClip: jest.fn(),
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
  addGroup: jest.fn(),
  setParent: jest.fn(),
  setTransition: jest.fn(),
  setMask: jest.fn(),
  setMatte: jest.fn(),
  setTimeRemap: jest.fn(),
  setEffects: jest.fn(),
  selectClip: jest.fn(),
  seek: jest.fn(),
  addMarker: jest.fn(),
  deleteMarker: jest.fn()
});

// The timeline tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

/** Sequence id every test registers its handler under. */
const SEQ_ID = "seq-1";

afterEach(() => {
  for (const id of listOpenTimelineSequenceIds()) {
    setTimelineAgentHandler(id, null);
  }
});

describe("ui_timeline_* tools", () => {
  // I11: the headless bridge and this registry must expose one tool set. The
  // list this used to spell out was hand-maintained, which is how four
  // structural tools stayed in the bridge and never reached the browser.
  // `packages/agents/tests/timelines-op-input.test.ts` asserts the other half.
  it("registers every tool the headless bridge also exposes", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(SHARED_TIMELINE_TOOL_NAMES.length).toBeGreaterThan(0);
    for (const name of SHARED_TIMELINE_TOOL_NAMES) {
      expect(names).toContain(name);
    }
    // Browser-only: it samples rendered video frames, so no headless twin.
    expect(names).toContain("ui_timeline_get_clip_frames");
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
    expect(schema.properties).toHaveProperty("timeline_id");
    expect(schema.required).toContain("timeline_id");
  });

  it("rejects with a descriptive error when the sequence is not open", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_get_state",
        { timeline_id: SEQ_ID },
        "tc-1",
        ctx
      )
    ).rejects.toThrow('No timeline sequence "seq-1" is open');
  });

  it("returns the timeline snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_get_state",
      { timeline_id: SEQ_ID },
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
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_generate_clip",
      {
        timeline_id: SEQ_ID,
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

  it("places an existing asset as a clip", async () => {
    const handler = createMockHandler();
    handler.addMediaClip.mockResolvedValue(
      clipNode({ mediaType: "video", name: "panda.mp4" })
    );
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_add_media_clip",
      { timeline_id: SEQ_ID, asset: "asset://abc123.mp4" },
      "tc-media",
      ctx
    )) as { ok: boolean; clip: { name: string } };

    expect(handler.addMediaClip).toHaveBeenCalledWith({
      asset: "asset://abc123.mp4"
    });
    expect(result.ok).toBe(true);
    expect(result.clip.name).toBe("panda.mp4");
  });

  it("adds authored text with optional styling", async () => {
    const handler = createMockHandler();
    handler.addTextClip.mockReturnValue(
      clipNode({
        mediaType: "text",
        textStyle: {
          text: "Launch",
          fontSizePx: 72,
          color: "#fff"
        }
      })
    );
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_add_text_clip",
      {
        timeline_id: SEQ_ID,
        text: "Launch",
        style: { fontSizePx: 72, color: "#fff" }
      },
      "tc-text",
      ctx
    );

    expect(handler.addTextClip).toHaveBeenCalledWith({
      text: "Launch",
      style: { fontSizePx: 72, color: "#fff" }
    });
  });

  it("rejects blank authored text", async () => {
    setTimelineAgentHandler(SEQ_ID, createMockHandler());

    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_add_text_clip",
        { timeline_id: SEQ_ID, text: "   " },
        "tc-blank-text",
        ctx
      )
    ).rejects.toThrow();
  });

  it("accepts a minimal shape and forwards it to the handler", async () => {
    const handler = createMockHandler();
    handler.addShapeClip.mockReturnValue(
      clipNode({
        mediaType: "shape",
        shapeStyle: { kind: "rect", fill: "#fff" }
      })
    );
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_add_shape_clip",
      { timeline_id: SEQ_ID, shape: { kind: "rect" } },
      "tc-shape",
      ctx
    );

    expect(handler.addShapeClip).toHaveBeenCalledWith({
      shape: { kind: "rect" }
    });
  });

  it("rejects an unknown generation kind during validation", async () => {
    setTimelineAgentHandler(SEQ_ID, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_generate_clip",
        { timeline_id: SEQ_ID, kind: "text-to-hologram", prompt: "x" },
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
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_split_clip",
      { timeline_id: SEQ_ID, target: "Clip 1", atMs: 1000 },
      "tc-5",
      ctx
    )) as { ok: boolean; clips: TimelineClipNode[] };

    expect(handler.splitClip).toHaveBeenCalledWith("Clip 1", 1000);
    expect(result.clips.map((c) => c.id)).toEqual(["left", "right"]);
  });

  it("forwards clip param patches to the handler", async () => {
    const handler = createMockHandler();
    handler.setClipParams.mockReturnValue(clipNode({ opacity: 0.5 }));
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_set_clip_params",
      { timeline_id: SEQ_ID, target: "selected", opacity: 0.5, fadeOutMs: 500 },
      "tc-6",
      ctx
    );

    expect(handler.setClipParams).toHaveBeenCalledWith("selected", {
      opacity: 0.5,
      fadeOutMs: 500
    });
  });

  it("forwards shape style patches to the handler", async () => {
    const handler = createMockHandler();
    handler.setClipParams.mockReturnValue(
      clipNode({ mediaType: "shape", shapeStyle: { kind: "ellipse" } })
    );
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_set_clip_params",
      {
        timeline_id: SEQ_ID,
        target: "selected",
        shapeStyle: { kind: "ellipse", fill: "#123456" }
      },
      "tc-shape-style",
      ctx
    );

    expect(handler.setClipParams).toHaveBeenCalledWith("selected", {
      shapeStyle: { kind: "ellipse", fill: "#123456" }
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
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_get_clip_frames",
      { timeline_id: SEQ_ID, target: "Clip 1", timesMs: [1000], width: 512 },
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
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_move_clip",
      {
        timeline_id: SEQ_ID,
        target: "clip-1",
        startMs: 2000,
        trackId: "track-2"
      },
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
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_seek",
      { timeline_id: SEQ_ID, timeMs: 1500 },
      "tc-8",
      ctx
    )) as { ok: boolean; playheadMs: number };

    expect(handler.seek).toHaveBeenCalledWith(1500);
    expect(result.playheadMs).toBe(1500);
  });

  it("animates a clip, defaulting mode to replace", async () => {
    const handler = createMockHandler();
    handler.setClipAnimations.mockReturnValue(clipNode());
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_animate_clip",
      {
        timeline_id: SEQ_ID,
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
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_animate_clip",
      {
        timeline_id: SEQ_ID,
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
    setTimelineAgentHandler(SEQ_ID, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_animate_clip",
        {
          timeline_id: SEQ_ID,
          target: "clip-1",
          animations: [{ role: "wiggle", preset: "pop" }]
        },
        "tc-anim-bad",
        ctx
      )
    ).rejects.toThrow();
  });

  it("clears animations, forwarding an optional role filter", async () => {
    const handler = createMockHandler();
    handler.clearClipAnimations.mockReturnValue(clipNode());
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_clear_animations",
      { timeline_id: SEQ_ID, target: "clip-1", role: "out" },
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

describe("marker tools", () => {
  const marker = {
    id: "marker-1",
    timeMs: 4500,
    label: "Chorus",
    color: "#ff0055"
  };

  it("adds a marker, passing every field through to the handler", async () => {
    const handler = createMockHandler();
    handler.addMarker.mockReturnValue(marker);
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_add_marker",
      {
        timeline_id: SEQ_ID,
        timeMs: 4500,
        label: "Chorus",
        color: "#ff0055"
      },
      "tc-marker-add",
      ctx
    )) as { ok: boolean; marker: typeof marker };

    expect(handler.addMarker).toHaveBeenCalledWith({
      timeMs: 4500,
      label: "Chorus",
      color: "#ff0055"
    });
    expect(result).toMatchObject({ ok: true, marker });
  });

  it("deletes a marker by label", async () => {
    const handler = createMockHandler();
    handler.deleteMarker.mockReturnValue(marker);
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_delete_marker",
      { timeline_id: SEQ_ID, target: "Chorus" },
      "tc-marker-del",
      ctx
    )) as { ok: boolean; deleted: typeof marker };

    expect(handler.deleteMarker).toHaveBeenCalledWith("Chorus");
    expect(result.deleted).toEqual(marker);
  });

  it("requires timeMs, so a marker cannot land at an unstated time", () => {
    const tool = FrontendToolRegistry.getManifest().find(
      (t) => t.name === "ui_timeline_add_marker"
    );
    const schema = tool?.parameters as { required?: string[] };
    expect(schema.required).toEqual(
      expect.arrayContaining(["timeline_id", "timeMs"])
    );
  });
});

describe("ui_timeline_edit (batch)", () => {
  it("applies every op in order through the single-tool handlers", async () => {
    const handler = createMockHandler();
    handler.addTrack.mockReturnValue(trackNode({ id: "track-2" }));
    handler.seek.mockReturnValue(1200);
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_edit",
      {
        timeline_id: SEQ_ID,
        ops: [
          // Both spellings reach the same tool.
          { tool: "add_track", input: { type: "audio", name: "Music" } },
          { tool: "ui_timeline_seek", input: { timeMs: 1200 } }
        ]
      },
      "tc-edit-1",
      ctx
    )) as {
      ok: boolean;
      applied: number;
      failed: number;
      results: { tool: string; ok: boolean }[];
    };

    expect(handler.addTrack).toHaveBeenCalledWith("audio", "Music");
    expect(handler.seek).toHaveBeenCalledWith(1200);
    expect(result).toMatchObject({ ok: true, applied: 2, failed: 0 });
    expect(result.results.map((r) => r.tool)).toEqual([
      "ui_timeline_add_track",
      "ui_timeline_seek"
    ]);
  });

  it("continues past a failing op and reports it", async () => {
    const handler = createMockHandler();
    handler.trimClip.mockImplementation(() => {
      throw new Error("Clip not found on the timeline: ghost");
    });
    handler.seek.mockReturnValue(80);
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_edit",
      {
        timeline_id: SEQ_ID,
        ops: [
          { tool: "trim_clip", input: { target: "ghost", durationMs: 100 } },
          { tool: "seek", input: { timeMs: 80 } }
        ]
      },
      "tc-edit-2",
      ctx
    )) as {
      ok: boolean;
      applied: number;
      failed: number;
      results: { tool: string; ok: boolean; error?: string }[];
    };

    // The second op still ran: a bad edit must not abandon the rest.
    expect(handler.seek).toHaveBeenCalledWith(80);
    expect(result).toMatchObject({ ok: false, applied: 1, failed: 1 });
    expect(result.results[0]).toMatchObject({ ok: false });
    expect(result.results[0].error).toContain("ghost");
    expect(result.results[1].ok).toBe(true);
  });

  it("refuses an unknown op name without aborting the batch", async () => {
    const handler = createMockHandler();
    handler.seek.mockReturnValue(10);
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_edit",
      {
        timeline_id: SEQ_ID,
        ops: [
          { tool: "frobnicate", input: {} },
          // A batch inside a batch is refused the same way.
          { tool: "edit", input: { ops: [] } },
          { tool: "seek", input: { timeMs: 10 } }
        ]
      },
      "tc-edit-3",
      ctx
    )) as {
      applied: number;
      failed: number;
      results: { ok: boolean; error?: string }[];
    };

    expect(result).toMatchObject({ applied: 1, failed: 2 });
    expect(result.results[0].error).toContain('No timeline operation named "frobnicate"');
    // The refusal names what it could have called instead.
    expect(result.results[0].error).toContain("seek");
    expect(result.results[1].error).toContain('named "edit"');
    expect(handler.seek).toHaveBeenCalledWith(10);
  });
});

describe("beat tools", () => {
  it("lays a marker on every beat of a tempo grid", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    handler.addMarker.mockImplementation((opts) => ({
      id: `m-${opts.timeMs}`,
      timeMs: opts.timeMs,
      label: opts.label ?? ""
    }));
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_set_markers_from_beats",
      { timeline_id: SEQ_ID, bpm: 120, count: 3 },
      "tc-beats-1",
      ctx
    )) as { ok: boolean; grid: { count: number }; added: { timeMs: number }[] };

    // 120bpm is one beat every 500ms.
    expect(handler.addMarker).toHaveBeenCalledTimes(3);
    expect(result.grid.count).toBe(3);
    expect(result.added.map((m) => m.timeMs)).toEqual([0, 500, 1000]);
    expect(handler.addMarker).toHaveBeenLastCalledWith({
      timeMs: 1000,
      label: "Beat 3"
    });
  });

  it("skips a beat that already carries a marker", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue({
      ...snapshot(),
      markers: [{ id: "m-0", timeMs: 0, label: "Beat 1" }]
    });
    handler.addMarker.mockImplementation((opts) => ({
      id: `m-${opts.timeMs}`,
      timeMs: opts.timeMs,
      label: opts.label ?? ""
    }));
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_set_markers_from_beats",
      { timeline_id: SEQ_ID, onsets_ms: [0, 500], label: "Hit" },
      "tc-beats-2",
      ctx
    )) as { added: { timeMs: number }[]; skipped_times_ms: number[] };

    expect(result.skipped_times_ms).toEqual([0]);
    expect(result.added.map((m) => m.timeMs)).toEqual([500]);
  });

  it("snaps a clip start onto the nearest beat through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    handler.moveClip.mockReturnValue(clipNode({ startMs: 50 }));
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_snap_to_beats",
      { timeline_id: SEQ_ID, onsets_ms: [50, 4000], targets: "all" },
      "tc-snap-1",
      ctx
    )) as {
      snapped: number;
      skipped: number;
      clips: { clipId: string; snapped: boolean; after: { startMs: number } }[];
    };

    expect(handler.moveClip).toHaveBeenCalledWith("clip-1", { startMs: 50 });
    // `move` keeps the length, so nothing is trimmed.
    expect(handler.trimClip).not.toHaveBeenCalled();
    expect(result.snapped).toBe(1);
    expect(result.clips[0]).toMatchObject({ clipId: "clip-1", snapped: true });
    expect(result.clips[0].after.startMs).toBe(50);
  });

  it("reports a boundary out of tolerance and a name nothing matches", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_timeline_snap_to_beats",
      {
        timeline_id: SEQ_ID,
        onsets_ms: [900],
        tolerance_ms: 60,
        targets: ["clip-1", "ghost"]
      },
      "tc-snap-2",
      ctx
    )) as {
      snapped: number;
      skipped: number;
      clips: { clipId: string; snapped: boolean; reason?: string }[];
    };

    expect(handler.moveClip).not.toHaveBeenCalled();
    expect(result.snapped).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.clips[1]).toMatchObject({
      clipId: "ghost",
      reason: 'no clip matches "ghost"'
    });
  });
});

describe("ui_timeline_set_time_remap", () => {
  it("passes the curve to the handler", async () => {
    const handler = createMockHandler();
    handler.setTimeRemap.mockReturnValue(clipNode());
    setTimelineAgentHandler(SEQ_ID, handler);

    const keyframes = [
      { t: 0, sourceMs: 0 },
      { t: 1, sourceMs: 2000 }
    ];
    const result = (await FrontendToolRegistry.call(
      "ui_timeline_set_time_remap",
      { timeline_id: SEQ_ID, target: "clip-1", timeRemap: { keyframes } },
      "tc-remap-1",
      ctx
    )) as { ok: boolean };

    expect(handler.setTimeRemap).toHaveBeenCalledWith("clip-1", { keyframes });
    expect(result.ok).toBe(true);
  });

  it("clears the curve with null", async () => {
    const handler = createMockHandler();
    handler.setTimeRemap.mockReturnValue(clipNode());
    setTimelineAgentHandler(SEQ_ID, handler);

    await FrontendToolRegistry.call(
      "ui_timeline_set_time_remap",
      { timeline_id: SEQ_ID, target: "clip-1", timeRemap: null },
      "tc-remap-2",
      ctx
    );

    expect(handler.setTimeRemap).toHaveBeenCalledWith("clip-1", null);
  });

  it("refuses a single keyframe — one point is a freeze, not a curve", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    await expect(
      FrontendToolRegistry.call(
        "ui_timeline_set_time_remap",
        {
          timeline_id: SEQ_ID,
          target: "clip-1",
          timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] }
        },
        "tc-remap-3",
        ctx
      )
    ).rejects.toThrow();
    expect(handler.setTimeRemap).not.toHaveBeenCalled();
  });
});
