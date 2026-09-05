/**
 * @jest-environment node
 */
import {
  SHARED_TIMELINE_TOOL_NAMES
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { TIMELINE_OP_NAMES } from "@nodetool-ai/timeline/ops";
import type { TimelineOp } from "@nodetool-ai/timeline/ops";
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setTimelineAgentHandler,
  listOpenTimelineSequenceIds,
  type TimelineAgentHandler
} from "../../../components/timeline/timelineAgentBridge";
import "../builtin/timeline";

/** The ops the editor runs, in call order, plus canned results. */
interface RecordingHandler extends jest.Mocked<TimelineAgentHandler> {
  ops: TimelineOp[];
}

const createMockHandler = (): RecordingHandler => {
  const ops: TimelineOp[] = [];
  const handler = {
    ops,
    getSequenceId: jest.fn(() => SEQ_ID),
    applyOp: jest.fn(async (op: TimelineOp) => {
      ops.push(op);
      return { ok: true, clip: { id: "clip-1", name: "Clip 1" } };
    }),
    generateClip: jest.fn(async () => ({
      clip: { id: "clip-9", name: "generated" },
      generationStarted: true
    })),
    regenerateClip: jest.fn(async () => undefined),
    getClipFrames: jest.fn(async () => ({
      clip: { id: "clip-1" },
      frames: []
    }))
  } as unknown as RecordingHandler;
  return handler;
};

// The timeline tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

/** Sequence id every test registers its handler under. */
const SEQ_ID = "seq-1";

const call = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(
    name,
    { timeline_id: SEQ_ID, ...args },
    `tc-${name}`,
    ctx
  );

afterEach(() => {
  for (const id of listOpenTimelineSequenceIds()) {
    setTimelineAgentHandler(id, null);
  }
});

/**
 * One call per tool that carries a document op, with the op name it must hand
 * to `applyTimelineOp`. This is the roster: an op the module implements and no
 * web tool reaches would be a browser-only gap, which is what the whole
 * migration is here to stop.
 */
const OP_TOOL_CALLS: { tool: string; args: Record<string, unknown>; op: string }[] =
  [
    { tool: "ui_timeline_get_state", args: {}, op: "get_state" },
    { tool: "ui_timeline_add_track", args: { type: "video" }, op: "add_track" },
    {
      tool: "ui_timeline_move_track",
      args: { target: "Video 1", toIndex: 0 },
      op: "move_track"
    },
    {
      tool: "ui_timeline_delete_track",
      args: { target: "Video 1", deleteClips: true },
      op: "delete_track"
    },
    {
      tool: "ui_timeline_add_media_clip",
      args: { asset: "asset://a1.mp4" },
      op: "add_media_clip"
    },
    {
      tool: "ui_timeline_add_text_clip",
      args: { text: "Hello" },
      op: "add_text_clip"
    },
    {
      tool: "ui_timeline_add_shape_clip",
      args: { shape: { kind: "rect" } },
      op: "add_shape_clip"
    },
    {
      tool: "ui_timeline_add_group",
      args: { name: "Lower third", startMs: 0, durationMs: 2000 },
      op: "add_group"
    },
    {
      tool: "ui_timeline_split_clip",
      args: { target: "clip-1", atMs: 500 },
      op: "split_clip"
    },
    {
      tool: "ui_timeline_trim_clip",
      args: { target: "clip-1", durationMs: 800 },
      op: "trim_clip"
    },
    {
      tool: "ui_timeline_move_clip",
      args: { target: "clip-1", startMs: 100 },
      op: "move_clip"
    },
    { tool: "ui_timeline_delete_clip", args: { target: "clip-1" }, op: "delete_clip" },
    {
      tool: "ui_timeline_duplicate_clip",
      args: { target: "clip-1" },
      op: "duplicate_clip"
    },
    {
      tool: "ui_timeline_set_clip_params",
      args: { target: "clip-1", opacity: 0.5 },
      op: "set_clip_params"
    },
    {
      tool: "ui_timeline_set_parent",
      args: { target: "clip-1", parentId: null },
      op: "set_parent"
    },
    {
      tool: "ui_timeline_set_transition",
      args: { target: "clip-1", transition: null },
      op: "set_transition"
    },
    {
      tool: "ui_timeline_set_mask",
      args: { target: "clip-1", mask: null },
      op: "set_mask"
    },
    {
      tool: "ui_timeline_set_matte",
      args: { target: "clip-1", matte: null },
      op: "set_matte"
    },
    {
      tool: "ui_timeline_set_time_remap",
      args: { target: "clip-1", timeRemap: null },
      op: "set_time_remap"
    },
    {
      tool: "ui_timeline_set_effects",
      args: { target: "clip-1", effects: [] },
      op: "set_effects"
    },
    {
      tool: "ui_timeline_set_clip_binding",
      args: { target: "clip-1", prompt: "a cat" },
      op: "set_clip_binding"
    },
    {
      tool: "ui_timeline_animate_clip",
      args: { target: "clip-1", animations: [{ role: "in", preset: "fade" }] },
      op: "animate_clip"
    },
    {
      tool: "ui_timeline_clear_animations",
      args: { target: "clip-1" },
      op: "clear_animations"
    },
    {
      tool: "ui_timeline_list_animation_presets",
      args: {},
      op: "list_animation_presets"
    },
    { tool: "ui_timeline_select_clip", args: { target: "clip-1" }, op: "select_clip" },
    { tool: "ui_timeline_seek", args: { timeMs: 250 }, op: "seek" },
    { tool: "ui_timeline_add_marker", args: { timeMs: 0 }, op: "add_marker" },
    {
      tool: "ui_timeline_delete_marker",
      args: { target: "Beat 1" },
      op: "delete_marker"
    },
    {
      tool: "ui_timeline_set_markers_from_beats",
      args: { bpm: 120, count: 4 },
      op: "set_markers_from_beats"
    },
    {
      tool: "ui_timeline_snap_to_beats",
      args: { bpm: 120 },
      op: "snap_to_beats"
    },
    {
      tool: "ui_timeline_insert_composition",
      args: { composition_id: "lower-third", startMs: 0 },
      op: "insert_composition"
    }
  ];

/**
 * Ops the browser cannot run as a pure document edit. `generate_clip` mints a
 * job through the direct-gen runner before the op writes the clip, so its tool
 * goes through `generateClip` instead of `applyOp`.
 */
const HOST_IO_OPS = ["generate_clip"];

describe("ui_timeline_* tools", () => {
  // I11: the headless bridge and this registry must expose one tool set. The
  // list this used to spell out was hand-maintained, which is how four
  // structural tools stayed in the bridge and never reached the browser.
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
    await expect(call("ui_timeline_get_state", {})).rejects.toThrow(
      'No timeline sequence "seq-1" is open'
    );
  });

  it.each(OP_TOOL_CALLS)(
    "$tool hands the $op op to applyTimelineOp",
    async ({ tool, args, op }) => {
      const handler = createMockHandler();
      setTimelineAgentHandler(SEQ_ID, handler);

      const result = (await call(tool, args)) as { ok?: boolean };

      expect(handler.ops.map((o) => o.op)).toEqual([op]);
      expect(result.ok).toBe(true);
    }
  );

  // The roster: every op the shared module implements is either driven by a
  // tool here or named as host I/O. A new op that reaches only the headless
  // surface fails this.
  it("reaches every op the shared module implements", () => {
    const covered = new Set([
      ...OP_TOOL_CALLS.map((entry) => entry.op),
      ...HOST_IO_OPS
    ]);
    expect(TIMELINE_OP_NAMES.length).toBeGreaterThan(0);
    for (const op of TIMELINE_OP_NAMES) {
      expect([...covered]).toContain(op);
    }
  });

  it("passes a clip-params patch through whole, timing included", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    await call("ui_timeline_set_clip_params", {
      target: "clip-1",
      startMs: 500,
      durationMs: 3000,
      fontSizePx: 96
    });

    expect(handler.ops[0]).toEqual({
      op: "set_clip_params",
      target: "clip-1",
      patch: { startMs: 500, durationMs: 3000, fontSizePx: 96 }
    });
  });

  it("generates a clip through the host, not through applyOp", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await call("ui_timeline_generate_clip", {
      kind: "text-to-video",
      prompt: "city at night"
    })) as { ok: boolean; generationStarted: boolean };

    expect(handler.generateClip).toHaveBeenCalledTimes(1);
    expect(handler.ops).toHaveLength(0);
    expect(result.generationStarted).toBe(true);
  });

  it("re-runs generation after a binding change asks for it", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    await call("ui_timeline_set_clip_binding", {
      target: "clip-1",
      prompt: "a cat",
      regenerate: true
    });

    expect(handler.regenerateClip).toHaveBeenCalledWith("clip-1");
    // `regenerate` is the host's flag; it must not reach the document op.
    expect(handler.ops[0]).toEqual({
      op: "set_clip_binding",
      target: "clip-1",
      prompt: "a cat"
    });
  });
});

describe("ui_timeline_edit", () => {
  it("applies ops in order and reports each one", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await call("ui_timeline_edit", {
      ops: [
        { tool: "add_track", input: { type: "video" } },
        { tool: "ui_timeline_seek", input: { timeMs: 100 } }
      ]
    })) as { ok: boolean; applied: number; failed: number };

    expect(handler.ops.map((o) => o.op)).toEqual(["add_track", "seek"]);
    expect(result).toMatchObject({ ok: true, applied: 2, failed: 0 });
  });

  it("is not ok when one op failed, and keeps going", async () => {
    const handler = createMockHandler();
    handler.applyOp.mockRejectedValueOnce(new Error("no such clip"));
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await call("ui_timeline_edit", {
      ops: [
        { tool: "delete_clip", input: { target: "gone" } },
        { tool: "seek", input: { timeMs: 0 } }
      ]
    })) as {
      ok: boolean;
      applied: number;
      failed: number;
      results: { ok: boolean; error?: string }[];
    };

    expect(result.ok).toBe(false);
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("no such clip");
  });

  it("names the valid ops when one is unknown", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    const result = (await call("ui_timeline_edit", {
      ops: [{ tool: "teleport_clip", input: {} }]
    })) as { ok: boolean; results: { error?: string }[] };

    expect(result.ok).toBe(false);
    expect(result.results[0].error).toContain('No timeline operation named');
    expect(result.results[0].error).toContain("split_clip");
  });

  it("refuses a batch over the cap", async () => {
    const handler = createMockHandler();
    setTimelineAgentHandler(SEQ_ID, handler);

    await expect(
      call("ui_timeline_edit", {
        ops: Array.from({ length: 61 }, () => ({
          tool: "seek",
          input: { timeMs: 0 }
        }))
      })
    ).rejects.toThrow(/at most 60 per call/);
  });
});
