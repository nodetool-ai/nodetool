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
