import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { applyTimelineTrackOp } from "../src/ops/apply.js";
import type { TimelineOpState } from "../src/ops/types.js";

const seed = (): TimelineOpState => ({
  fps: 30,
  width: 1920,
  height: 1080,
  playheadMs: 0,
  selectedClipIds: ["parent"],
  markers: [],
  tracks: [
    makeTrack({
      id: "123456789abc00000000000000000000",
      name: "Pictures",
      index: 0
    }),
    makeTrack({ id: "second", index: 1 })
  ],
  clips: [
    makeClip({ id: "parent", trackId: "123456789abc00000000000000000000" }),
    makeClip({ id: "child", trackId: "second", parentId: "parent" })
  ]
});
const ctx = { newId: () => "new-track" };

describe("track operations", () => {
  it("keeps the input and selection intact on populated deletion failure", () => {
    const state = seed();
    const before = structuredClone(state);
    const result = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: "pictures" },
      ctx
    );
    expect(result.error).toContain("still holds");
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });
  it("cleans parent links and selection, and closes the z-order gap", () => {
    const state = seed();
    const result = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: "123456789abc", deleteClips: true },
      ctx
    );
    expect(result.error).toBeUndefined();
    expect(result.state.clips[0]?.parentId).toBeUndefined();
    expect(result.state.selectedClipIds).toEqual([]);
    expect(result.state.tracks[0]?.index).toBe(0);
    expect(state.clips[1]?.parentId).toBe("parent");
  });
  it("rejects ambiguous compact IDs before mutating", () => {
    const state = seed();
    state.tracks.push(makeTrack({ id: "123456789abc11111111111111111111" }));
    const result = applyTimelineTrackOp(
      state,
      { op: "move_track", target: "123456789abc", toIndex: 1 },
      ctx
    );
    expect(result.error).toContain("more than one track");
    expect(result.state).toBe(state);
  });
  it("moves a large track stack without changing clips", () => {
    const state = seed();
    state.tracks = Array.from({ length: 2000 }, (_, index) => makeTrack({ id: `track-${index}`, index }));
    state.clips = Array.from({ length: 6000 }, (_, index) => makeClip({ id: `clip-${index}`, trackId: `track-${index % 2000}` }));
    const result = applyTimelineTrackOp(state, { op: "move_track", target: "track-0", toIndex: 1999 }, ctx);
    expect(result.error).toBeUndefined();
    expect(result.state.tracks.at(-1)?.id).toBe("track-0");
    expect(result.state.clips).toEqual(state.clips);
    expect(result.result.tracks).toHaveLength(2000);
  });
});

it("keeps materialization ownership after deleting an owned track", () => {
  const state = seed();
  state.storyboardMaterializations = [{ boardId: "board", elementKeys: ["shot/product"] }];
  const result = applyTimelineTrackOp(state, { op: "delete_track", target: "123456789abc", deleteClips: true }, ctx);
  expect(result.error).toBeUndefined();
  expect(result.state.storyboardMaterializations).toEqual(state.storyboardMaterializations);
  expect(result.state.storyboardMaterializations).not.toBe(state.storyboardMaterializations);
});

describe("delete_track side effects on surviving clips", () => {
  const owned = "123456789abc00000000000000000000";

  it("unlinks a clip left alone and keeps a link that still has two members", () => {
    const state = seed();
    state.clips = [
      makeClip({ id: "gone", trackId: owned, linkId: "solo" }),
      makeClip({ id: "lonely", trackId: "second", linkId: "solo" }),
      makeClip({ id: "gone2", trackId: owned, linkId: "pair" }),
      makeClip({ id: "kept1", trackId: "second", linkId: "pair" }),
      makeClip({ id: "kept2", trackId: "second", linkId: "pair" })
    ];
    const result = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: owned, deleteClips: true },
      ctx
    );
    expect(result.error).toBeUndefined();
    const byId = new Map(result.state.clips.map((c) => [c.id, c]));
    expect(byId.get("lonely")?.linkId).toBeUndefined();
    expect(byId.get("kept1")?.linkId).toBe("pair");
    expect(byId.get("kept2")?.linkId).toBe("pair");
    expect([...result.changedClipIds].sort()).toEqual(
      ["gone", "gone2", "lonely"].sort()
    );
  });

  it("drops media tracks of deleted clips and releases clips bound to them", () => {
    const state = seed();
    state.clips = [
      makeClip({ id: "gone", trackId: owned }),
      makeClip({
        id: "bound",
        trackId: "second",
        trackBinding: { trackId: "mt-gone", mode: "position" }
      }),
      makeClip({
        id: "other",
        trackId: "second",
        trackBinding: { trackId: "mt-kept", mode: "position" }
      })
    ];
    const mediaTrack = (id: string, clipId: string) => ({
      id,
      clipId,
      sourceAssetId: "a",
      name: id,
      kind: "point" as const,
      sourceStartMs: 0,
      sourceEndMs: 1,
      samples: [],
      status: "ready" as const
    });
    state.mediaTracks = [
      mediaTrack("mt-gone", "gone"),
      mediaTrack("mt-kept", "other")
    ];
    const result = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: owned, deleteClips: true },
      ctx
    );
    expect(result.error).toBeUndefined();
    expect(result.state.mediaTracks?.map((t) => t.id)).toEqual(["mt-kept"]);
    const byId = new Map(result.state.clips.map((c) => [c.id, c]));
    expect(byId.get("bound")?.trackBinding).toBeUndefined();
    expect(byId.get("other")?.trackBinding?.trackId).toBe("mt-kept");
    expect(result.changedClipIds).toContain("bound");
    expect(result.changedClipIds).not.toContain("other");
  });

  it("refuses a populated track unless deleteClips is set, and a locked track always", () => {
    const state = seed();
    const refused = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: owned },
      ctx
    );
    expect(refused.error).toContain("deleteClips: true");
    const emptied = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: "second" },
      ctx
    );
    expect(emptied.error).toContain("still holds 1 clip(s): child");
    state.tracks[0]!.locked = true;
    const locked = applyTimelineTrackOp(
      state,
      { op: "delete_track", target: owned, deleteClips: true },
      ctx
    );
    expect(locked.error).toBeTruthy();
  });
});
