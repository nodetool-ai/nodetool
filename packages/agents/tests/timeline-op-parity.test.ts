/**
 * Every timeline op, driven twice: through the headless `ui_timeline_*` tool
 * and through `applyTimelineOp` directly. The two must agree on the result and
 * on the document (I11).
 *
 * The bridge delegates to the op module today, so a passing run is a check
 * that it still does — the table is what fails when a handler is forked back
 * into a host. Inverting one fixture's expectation (e.g. dropping the
 * `set_clip_params` timing keys from the op) turns it red.
 */

import { describe, expect, it } from "vitest";
import {
  makeClip,
  makeTrack,
  type TimelineClip,
  type TimelineComposition,
  type TimelineMarker,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import {
  applyTimelineOp,
  TIMELINE_OP_NAMES,
  type TimelineOp,
  type TimelineOpContext,
  type TimelineOpIdKind,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import { parseSvgPath } from "@nodetool-ai/timeline/scene";
import {
  createTimelineToolBridge,
  type TimelineBridgeInitialState
} from "../src/evals/surfaces/timeline.js";

const COMPOSITION: TimelineComposition = {
  id: "lower_third",
  name: "Lower Third",
  params: {
    name: { type: "string", default: "Ada", path: "/0/textStyle/text" }
  },
  group: makeClip({
    id: "tpl_group",
    trackId: "group",
    name: "Lower Third",
    startMs: 0,
    durationMs: 3000,
    mediaType: "group",
    sourceType: "imported",
    status: "generated"
  }),
  children: [
    makeClip({
      id: "tpl_text",
      trackId: "Name",
      name: "Name",
      startMs: 0,
      durationMs: 3000,
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      textStyle: { text: "Ada" }
    })
  ]
};

function seedTracks(): TimelineTrack[] {
  return [
    makeTrack({ id: "track_a", type: "video", name: "Video 1", index: 0 }),
    makeTrack({ id: "track_b", type: "overlay", name: "Overlay 1", index: 1 })
  ];
}

function seedClips(): TimelineClip[] {
  return [
    makeClip({
      id: "clip_a",
      trackId: "track_a",
      name: "Shot A",
      startMs: 0,
      durationMs: 4000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated"
    }),
    makeClip({
      id: "clip_b",
      trackId: "track_b",
      name: "Title",
      startMs: 0,
      durationMs: 3000,
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      textStyle: { text: "Hello world", fontSizePx: 64 }
    }),
    makeClip({
      id: "clip_c",
      trackId: "track_a",
      name: "Gen",
      startMs: 4000,
      durationMs: 5000,
      mediaType: "video",
      sourceType: "generated",
      status: "generated",
      prompt: "a cat"
    }),
    makeClip({
      id: "clip_g",
      trackId: "track_b",
      name: "Group",
      startMs: 0,
      durationMs: 3000,
      mediaType: "group",
      sourceType: "imported",
      status: "generated"
    })
  ];
}

function seedMarkers(): TimelineMarker[] {
  return [{ id: "marker_a", timeMs: 1000, label: "One" }];
}

const ASSET = {
  id: "asset_1",
  name: "Clip.mp4",
  contentType: "video/mp4",
  durationMs: 2500
};

function bridgeInit(): TimelineBridgeInitialState {
  return {
    sequence: {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: seedTracks(),
      clips: seedClips(),
      markers: seedMarkers()
    },
    resolveAsset: async (ref) => (ref.includes("asset_1") ? ASSET : null),
    loadComposition: {
      get: async (id) => (id === COMPOSITION.id ? COMPOSITION : null),
      listIds: async () => [COMPOSITION.id]
    }
  };
}

/** The bridge's id minting, replayed so the direct run mints the same ids. */
function directContext(state: TimelineOpState): TimelineOpContext {
  const used = new Set<string>();
  for (const t of state.tracks) used.add(t.id);
  for (const c of state.clips) {
    used.add(c.id);
    for (const a of c.animations ?? []) used.add(a.id);
  }
  for (const m of state.markers) used.add(m.id);
  const counters: Record<TimelineOpIdKind, number> = {
    track: 0,
    clip: 0,
    anim: 0,
    marker: 0
  };
  return {
    newId: (kind) => {
      let id = `${kind}_${++counters[kind]}`;
      while (used.has(id)) id = `${kind}_${++counters[kind]}`;
      used.add(id);
      return id;
    },
    now: () => "2026-01-01T00:00:00.000Z",
    resolveAsset: async (ref) => (ref.includes("asset_1") ? ASSET : null),
    loadComposition: {
      get: async (id) => (id === COMPOSITION.id ? COMPOSITION : null),
      listIds: async () => [COMPOSITION.id]
    },
    parseSvgPath
  };
}

function directState(): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: seedTracks(),
    clips: seedClips(),
    markers: seedMarkers(),
    playheadMs: 0,
    selectedClipIds: []
  };
}

interface Fixture {
  /** The `ui_timeline_*` tool name, minus the prefix. */
  tool: string;
  args: Record<string, unknown>;
  op: TimelineOp;
}

const FIXTURES: Fixture[] = [
  { tool: "get_state", args: {}, op: { op: "get_state" } },
  {
    tool: "add_track",
    args: { type: "audio", name: "Score" },
    op: { op: "add_track", type: "audio", name: "Score" }
  },
  {
    tool: "move_track",
    args: { target: "track_b", toIndex: 0 },
    op: { op: "move_track", target: "track_b", toIndex: 0 }
  },
  {
    tool: "delete_track",
    args: { target: "track_a", deleteClips: true },
    op: { op: "delete_track", target: "track_a", deleteClips: true }
  },
  {
    tool: "add_text_clip",
    args: { text: "New title", fontSizePx: 48 },
    op: {
      op: "add_text_clip",
      text: "New title",
      loose: { fontSizePx: 48 }
    }
  },
  {
    tool: "add_media_clip",
    args: { asset: "asset://asset_1.mp4" },
    op: { op: "add_media_clip", asset: "asset://asset_1.mp4" }
  },
  {
    tool: "add_shape_clip",
    args: { kind: "rect", width: 0.5 },
    op: { op: "add_shape_clip", loose: { kind: "rect", width: 0.5 } }
  },
  {
    tool: "add_group",
    args: {
      name: "Band",
      startMs: 0,
      durationMs: 2000,
      children: ["clip_b"]
    },
    op: {
      op: "add_group",
      name: "Band",
      startMs: 0,
      durationMs: 2000,
      children: ["clip_b"]
    }
  },
  {
    tool: "generate_clip",
    args: { kind: "text-to-image", prompt: "a fox" },
    op: { op: "generate_clip", kind: "text-to-image", prompt: "a fox" }
  },
  {
    tool: "split_clip",
    args: { target: "clip_a", atMs: 2000 },
    op: { op: "split_clip", target: "clip_a", atMs: 2000 }
  },
  {
    tool: "trim_clip",
    args: { target: "clip_a", durationMs: 2500 },
    op: { op: "trim_clip", target: "clip_a", durationMs: 2500 }
  },
  {
    tool: "move_clip",
    args: { target: "clip_a", startMs: 500, trackId: "track_b" },
    op: { op: "move_clip", target: "clip_a", startMs: 500, trackId: "track_b" }
  },
  {
    tool: "delete_clip",
    args: { target: "clip_a" },
    op: { op: "delete_clip", target: "clip_a" }
  },
  {
    tool: "duplicate_clip",
    args: { target: "clip_a", gapMs: 100 },
    op: { op: "duplicate_clip", target: "clip_a", gapMs: 100 }
  },
  {
    tool: "set_clip_params",
    args: {
      target: "clip_b",
      startMs: 1200,
      durationMs: 2000,
      fontSizePx: 80,
      opacity: 0.5
    },
    op: {
      op: "set_clip_params",
      target: "clip_b",
      patch: {
        startMs: 1200,
        durationMs: 2000,
        fontSizePx: 80,
        opacity: 0.5
      }
    }
  },
  {
    tool: "set_parent",
    args: { target: "clip_b", parentId: "clip_g" },
    op: { op: "set_parent", target: "clip_b", parentId: "clip_g" }
  },
  {
    tool: "set_transition",
    args: { target: "clip_a", transition: { type: "crossfade", durationMs: 500 } },
    op: {
      op: "set_transition",
      target: "clip_a",
      transition: { type: "crossfade", durationMs: 500 }
    }
  },
  {
    tool: "set_mask",
    args: { target: "clip_a", mask: { kind: "ellipse", featherPx: 4 } },
    op: {
      op: "set_mask",
      target: "clip_a",
      mask: { kind: "ellipse", featherPx: 4 }
    }
  },
  {
    tool: "set_matte",
    args: { target: "clip_a", matte: { source: "clip_b", mode: "luma" } },
    op: {
      op: "set_matte",
      target: "clip_a",
      matte: { source: "clip_b", mode: "luma" }
    }
  },
  {
    tool: "set_time_remap",
    args: {
      target: "clip_a",
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    },
    op: {
      op: "set_time_remap",
      target: "clip_a",
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    }
  },
  {
    tool: "set_effects",
    args: { target: "clip_a", effects: [{ type: "blur", radius: 6 }] },
    op: {
      op: "set_effects",
      target: "clip_a",
      effects: [{ type: "blur", radius: 6 }]
    }
  },
  {
    tool: "set_clip_binding",
    args: { target: "clip_c", prompt: "a dog", regenerate: true },
    op: {
      op: "set_clip_binding",
      target: "clip_c",
      prompt: "a dog",
      regenerate: true
    }
  },
  {
    tool: "animate_clip",
    args: {
      target: "clip_b",
      animations: [{ role: "in", preset: "fade" }]
    },
    op: {
      op: "animate_clip",
      target: "clip_b",
      animations: [{ role: "in", preset: "fade" }]
    }
  },
  {
    tool: "clear_animations",
    args: { target: "clip_b" },
    op: { op: "clear_animations", target: "clip_b" }
  },
  {
    tool: "list_animation_presets",
    args: {},
    op: { op: "list_animation_presets" }
  },
  {
    tool: "select_clip",
    args: { target: "clip_a" },
    op: { op: "select_clip", target: "clip_a" }
  },
  { tool: "seek", args: { timeMs: 900 }, op: { op: "seek", timeMs: 900 } },
  {
    tool: "add_marker",
    args: { timeMs: 2000, label: "Two" },
    op: { op: "add_marker", timeMs: 2000, label: "Two" }
  },
  {
    tool: "delete_marker",
    args: { target: "One" },
    op: { op: "delete_marker", target: "One" }
  },
  {
    tool: "set_markers_from_beats",
    args: { bpm: 120, count: 4 },
    op: { op: "set_markers_from_beats", bpm: 120, count: 4 }
  },
  {
    tool: "snap_to_beats",
    args: { bpm: 120, targets: ["clip_a"] },
    op: { op: "snap_to_beats", bpm: 120, targets: ["clip_a"] }
  },
  {
    tool: "insert_composition",
    args: { composition_id: "lower_third", startMs: 1000 },
    op: { op: "insert_composition", composition_id: "lower_third", startMs: 1000 }
  }
];

describe("timeline op parity", () => {
  it("covers every op the module handles", () => {
    expect(FIXTURES.map((f) => f.tool).sort()).toEqual(
      [...TIMELINE_OP_NAMES].sort()
    );
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.tool} agrees between the bridge and applyTimelineOp`, async () => {
      const bridge = createTimelineToolBridge(bridgeInit());
      const entry = bridge.tools.find(
        (t) => t.name === `ui_timeline_${fixture.tool}`
      );
      expect(entry, `${fixture.tool} is registered`).toBeDefined();
      const viaTool = (await entry!.execute(fixture.args)) as Record<
        string,
        unknown
      >;

      const state = directState();
      const outcome = await applyTimelineOp(
        state,
        fixture.op,
        directContext(state)
      );
      expect(outcome.error).toBeUndefined();

      // `get_state` is the one result the bridge adds to: it names the row the
      // ops module knows nothing about.
      const { sequenceId, ...toolResult } = viaTool as { sequenceId?: string };
      expect(toolResult).toEqual(outcome.result);

      const final = bridge.finalState();
      expect(final.documentTracks).toEqual(outcome.state.tracks);
      expect(final.documentClips).toEqual(outcome.state.clips);
      expect(final.markers).toEqual(outcome.state.markers);
    });
  }

  it("applies timing sent to set_clip_params rather than dropping it", async () => {
    // The divergence this module closes: the browser handler used to strip
    // startMs/durationMs/fontSizePx from a set_clip_params call and report ok.
    const state = directState();
    const outcome = await applyTimelineOp(
      state,
      {
        op: "set_clip_params",
        target: "clip_b",
        patch: { startMs: 1200, durationMs: 2000, fontSizePx: 80 }
      },
      directContext(state)
    );
    expect(outcome.error).toBeUndefined();
    const clip = outcome.state.clips.find((c) => c.id === "clip_b")!;
    expect(clip.startMs).toBe(1200);
    expect(clip.durationMs).toBe(2000);
    expect(clip.textStyle?.fontSizePx).toBe(80);
    expect(outcome.changedClipIds).toContain("clip_b");
  });

  it("leaves the caller's document alone when an op refuses", async () => {
    const state = directState();
    const outcome = await applyTimelineOp(
      state,
      { op: "delete_clip", target: "nope" },
      directContext(state)
    );
    expect(outcome.error).toContain('No clip found matching "nope"');
    expect(outcome.state).toBe(state);
    expect(state.clips).toHaveLength(4);
  });
});
