/**
 * Regression tests for the timeline op audit: beat resolution, linked snaps,
 * lock and track-fit checks, duplicate semantics, short-id lookups and
 * binding regeneration.
 */

import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { applyTimelineOp, resolveBeatTarget } from "../src/ops/apply.js";
import type { TimelineOp } from "../src/ops/op.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";
import type { MediaTrack, TimelineClip, TimelineTrack } from "../src/types.js";

const BEAT_1 = "11111111111111111111111111111111";
const BEAT_2 = "2f4c0000000000000000000000000000";
const BEAT_3 = "33333333333333333333333333333333";

function context(
  overrides: Partial<TimelineOpContext> = {}
): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}`, ...overrides };
}

function state(
  clips: TimelineClip[],
  tracks: TimelineTrack[] = [
    makeTrack({ id: "track_v", type: "video", name: "Video", index: 0 }),
    makeTrack({ id: "track_a", type: "audio", name: "Audio", index: 1 })
  ],
  extra: Partial<TimelineOpState> = {}
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    markers: [],
    playheadMs: 0,
    selectedClipIds: [],
    ...extra
  };
}

function video(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "clip_v",
    trackId: "track_v",
    name: "Shot",
    startMs: 0,
    durationMs: 2000,
    mediaType: "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_v",
    ...overrides
  });
}

async function run(
  s: TimelineOpState,
  op: TimelineOp,
  ctx: TimelineOpContext = context()
) {
  return applyTimelineOp(s, op, ctx);
}

describe("beat targets (F1)", () => {
  const beats = [
    { id: BEAT_1, prompt: "one", duration_ms: 1000 },
    { id: BEAT_2, prompt: "two", duration_ms: 1000 },
    { id: BEAT_3, prompt: "three", duration_ms: 1000 }
  ];
  const planned = () =>
    state([], undefined, {
      setup: { stage: "review", brief: "", beats: structuredClone(beats) }
    });

  it("refuses a non-matching hex id instead of reading its digits as a position", async () => {
    const outcome = await run(planned(), {
      op: "remove_beat",
      beat: "2f4c1111aaaa"
    });
    expect(outcome.error).toMatch(/No beat matches/);
    expect(() => resolveBeatTarget(beats, "3abc")).toThrow(/No beat matches/);
  });

  it("resolves an exact unique 12-character prefix", async () => {
    const outcome = await run(planned(), {
      op: "update_beat",
      beat: BEAT_2.slice(0, 12),
      prompt: "changed"
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.state.setup?.beats?.[1]).toMatchObject({
      id: BEAT_2,
      prompt: "changed"
    });
  });

  it("still accepts a digits-only 1-based position", async () => {
    const outcome = await run(planned(), { op: "remove_beat", beat: "3" });
    expect(outcome.result.removed).toMatchObject({ id: BEAT_3 });
  });
});

describe("snap_to_beats with linked clips (F2)", () => {
  it("moves a linked pair once, and the saved start matches the report", async () => {
    const s = state([
      video({ id: "clip_v", startMs: 1010, linkId: "link" }),
      makeClip({
        id: "clip_a",
        trackId: "track_a",
        name: "Sound",
        startMs: 1050,
        durationMs: 2000,
        mediaType: "audio",
        sourceType: "imported",
        linkId: "link"
      })
    ]);
    const outcome = await run(s, {
      op: "snap_to_beats",
      bpm: 60,
      mode: "start"
    });
    expect(outcome.error).toBeUndefined();
    const byId = new Map(outcome.state.clips.map((c) => [c.id, c]));
    expect(byId.get("clip_v")?.startMs).toBe(1000);
    expect(byId.get("clip_a")?.startMs).toBe(1040);
    const reported = outcome.result.clips as Array<{
      clipId: string;
      after: { startMs: number };
    }>;
    for (const entry of reported) {
      expect(byId.get(entry.clipId)?.startMs).toBe(entry.after.startMs);
    }
  });
});

describe("binding regeneration (F4)", () => {
  it("does not mark a clip queued when no runner will start a job", async () => {
    const s = state([
      video({
        sourceType: "generated",
        bindingKind: "text-to-video",
        prompt: "old"
      })
    ]);
    const outcome = await run(s, {
      op: "set_clip_binding",
      target: "clip_v",
      prompt: "new",
      regenerate: true
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.state.clips[0]?.status).toBe("stale");
    expect(outcome.result).toMatchObject({ regenerationStarted: false });
    expect(outcome.result.note).toMatch(/editor/);
  });
});

describe("locks (F5)", () => {
  const lockedVideo = () =>
    makeTrack({
      id: "track_v",
      type: "video",
      name: "Video",
      index: 0,
      locked: true
    });

  it("refuses take edits on a locked clip", async () => {
    const s = state([
      video({
        locked: true,
        versions: [
          {
            id: "take_1",
            createdAt: "",
            workflowUpdatedAt: "",
            jobId: "",
            assetId: "asset_v",
            status: "success"
          }
        ]
      })
    ]);
    for (const op of [
      { op: "select_take", target: "clip_v", takeId: "take_1" },
      { op: "rename_take", target: "clip_v", takeId: "take_1", label: "x" },
      { op: "delete_take", target: "clip_v", takeId: "take_1" }
    ] as TimelineOp[]) {
      expect((await run(s, op)).error).toMatch(/locked/);
    }
  });

  it("refuses a move onto a locked track", async () => {
    const s = state(
      [video({ trackId: "track_o" })],
      [
        lockedVideo(),
        makeTrack({ id: "track_o", type: "overlay", name: "Over", index: 1 })
      ]
    );
    const outcome = await run(s, {
      op: "move_clip",
      target: "clip_v",
      trackId: "track_v"
    });
    expect(outcome.error).toMatch(/locked/);
  });

  it("refuses placement on a locked track and skips one by default", async () => {
    const s = state([], [lockedVideo()]);
    const explicit = await run(s, {
      op: "generate_clip",
      kind: "text-to-video",
      prompt: "x",
      trackId: "track_v"
    });
    expect(explicit.error).toMatch(/locked/);
    const implicit = await run(s, {
      op: "generate_clip",
      kind: "text-to-video",
      prompt: "x"
    });
    expect(implicit.error).toBeUndefined();
    const placed = implicit.state.clips[0]!;
    expect(placed.trackId).not.toBe("track_v");
  });

  it("refuses duplicating onto a locked track and grouping locked clips", async () => {
    const s = state(
      [video()],
      [
        lockedVideo(),
        makeTrack({ id: "track_o", type: "overlay", name: "Over", index: 1 })
      ]
    );
    expect(
      (await run(s, { op: "duplicate_clip", target: "clip_v" })).error
    ).toMatch(/locked/);
    expect(
      (
        await run(s, {
          op: "add_group",
          name: "G",
          startMs: 0,
          durationMs: 1000,
          trackId: "track_o",
          children: ["clip_v"]
        })
      ).error
    ).toMatch(/locked/);
  });
});

describe("track fit (F6)", () => {
  it("refuses moving a video clip onto an audio track", async () => {
    const outcome = await run(state([video()]), {
      op: "set_clip_params",
      target: "clip_v",
      patch: { trackId: "track_a" }
    });
    expect(outcome.error).toMatch(/cannot go on audio track/);
  });

  it("refuses generating video onto an audio track", async () => {
    const outcome = await run(state([]), {
      op: "generate_clip",
      kind: "text-to-video",
      prompt: "x",
      trackId: "track_a"
    });
    expect(outcome.error).toMatch(/cannot go on audio track/);
  });
});

describe("duplicate_clip (F7, F9)", () => {
  it("copies a group with its children, remapping parents", async () => {
    const s = state(
      [
        makeClip({
          id: "group",
          trackId: "track_o",
          name: "G",
          startMs: 0,
          durationMs: 1000,
          mediaType: "group",
          sourceType: "imported"
        }),
        makeClip({
          id: "child",
          trackId: "track_o",
          name: "Title",
          startMs: 100,
          durationMs: 500,
          mediaType: "text",
          sourceType: "imported",
          parentId: "group"
        })
      ],
      [makeTrack({ id: "track_o", type: "overlay", name: "Over", index: 0 })]
    );
    const outcome = await run(s, { op: "duplicate_clip", target: "group" });
    expect(outcome.error).toBeUndefined();
    const copies = outcome.state.clips.slice(2);
    expect(copies).toHaveLength(2);
    const [group, child] = copies;
    expect(group).toMatchObject({ mediaType: "group", startMs: 1000 });
    expect(child).toMatchObject({ parentId: group!.id, startMs: 1100 });
  });

  it("refuses a gap that would place the copy before zero", async () => {
    const outcome = await run(state([video()]), {
      op: "duplicate_clip",
      target: "clip_v",
      gapMs: -5000
    });
    expect(outcome.error).toMatch(/before zero/);
  });
});

describe("short ids (F10)", () => {
  const TRACK_ID = "abcdef123456aaaaaaaaaaaaaaaaaaaa";
  const mediaTrack: MediaTrack = {
    id: TRACK_ID,
    clipId: "clip_v",
    sourceAssetId: "asset_v",
    name: "Subject",
    kind: "box",
    sourceStartMs: 0,
    sourceEndMs: 2000,
    samples: [{ timeMs: 0, box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
    status: "ready"
  } as MediaTrack;

  it("binds and deletes a media track named by its 12-character prefix", async () => {
    const s = state([video()], undefined, { mediaTracks: [mediaTrack] });
    const bound = await run(s, {
      op: "bind_to_track",
      target: "clip_v",
      trackId: TRACK_ID.slice(0, 12),
      mode: "position"
    });
    expect(bound.error).toBeUndefined();
    expect(bound.state.clips[0]?.trackBinding?.trackId).toBe(TRACK_ID);
    const deleted = await run(bound.state, {
      op: "delete_track_object",
      trackId: TRACK_ID.slice(0, 12)
    });
    expect(deleted.error).toBeUndefined();
    expect(deleted.state.mediaTracks).toEqual([]);
    expect(deleted.state.clips[0]?.trackBinding).toBeUndefined();
  });

  it("selects a take named by its 12-character prefix", async () => {
    const takeId = "fedcba987654bbbbbbbbbbbbbbbbbbbb";
    const s = state([
      video({
        versions: [
          {
            id: takeId,
            createdAt: "",
            workflowUpdatedAt: "",
            jobId: "",
            assetId: "asset_other",
            status: "success"
          }
        ]
      })
    ]);
    const outcome = await run(s, {
      op: "select_take",
      target: "clip_v",
      takeId: takeId.slice(0, 12)
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.state.clips[0]?.currentAssetId).toBe("asset_other");
  });

  it("stores the resolved asset id on a 3D clip", async () => {
    const full = "0123456789ab0000000000000000cccc";
    const outcome = await run(
      state([], [makeTrack({ id: "track_o", type: "overlay", index: 0 })]),
      { op: "add_model3d_clip", assetId: full.slice(0, 12) },
      context({
        resolveAsset: async (ref) =>
          full.startsWith(ref)
            ? { id: full, name: "m.glb", contentType: "model/gltf-binary" }
            : null
      })
    );
    expect(outcome.error).toBeUndefined();
    expect(outcome.state.clips[0]?.currentAssetId).toBe(full);
  });
});

describe("delete_track with clips (notes)", () => {
  it("unlinks a lone partner and drops the deleted clips' media tracks", async () => {
    const s = state(
      [
        video({ linkId: "link" }),
        makeClip({
          id: "clip_a",
          trackId: "track_a",
          name: "Sound",
          startMs: 0,
          durationMs: 2000,
          mediaType: "audio",
          sourceType: "imported",
          linkId: "link"
        })
      ],
      undefined,
      {
        mediaTracks: [
          {
            id: "mt",
            clipId: "clip_v",
            sourceAssetId: "asset_v",
            name: "S",
            kind: "box",
            sourceStartMs: 0,
            sourceEndMs: 2000,
            samples: [],
            status: "ready"
          } as MediaTrack
        ]
      }
    );
    const outcome = await run(s, {
      op: "delete_track",
      target: "track_v",
      deleteClips: true
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.state.clips).toHaveLength(1);
    expect(outcome.state.clips[0]?.linkId).toBeUndefined();
    expect(outcome.state.mediaTracks).toEqual([]);
  });
});

describe("move_clip on a group", () => {
  it("carries a child's linked audio and keeps its offset at zero", async () => {
    const s = state([
      makeClip({
        id: "group",
        trackId: "track_v",
        name: "G",
        startMs: 1000,
        durationMs: 2000,
        mediaType: "group",
        sourceType: "imported"
      }),
      video({ startMs: 1000, parentId: "group", linkId: "L" }),
      makeClip({
        id: "clip_a",
        trackId: "track_a",
        name: "Sound",
        startMs: 500,
        durationMs: 2500,
        mediaType: "audio",
        sourceType: "imported",
        linkId: "L"
      })
    ]);
    const outcome = await run(s, {
      op: "move_clip",
      target: "group",
      startMs: 0
    });
    expect(outcome.error).toBeUndefined();
    const at = (id: string) =>
      outcome.state.clips.find((c) => c.id === id)!.startMs;
    expect(at("clip_a")).toBe(0);
    expect(at("clip_v")).toBe(500);
    expect(at("group")).toBe(500);
  });
});
