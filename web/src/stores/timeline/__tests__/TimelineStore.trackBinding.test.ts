/**
 * `bindToTrack`/`unbindTrack` (P0 AI Video, Phase 2): plain `set()` actions,
 * so each is one undo entry, mirroring `setGeneratedMatteKnobs`'s own tests.
 */

import { describe, it, expect } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";

const CLIP_ID = "text-1";

function seedStore(trackBinding?: TimelineClip["trackBinding"]) {
  const store = createTimelineStore();
  const track: TimelineTrack = makeTrack({ type: "overlay", name: "Overlay" });
  const clip: TimelineClip = makeClip({
    id: CLIP_ID,
    trackId: track.id,
    name: "Caption",
    mediaType: "text",
    startMs: 0,
    durationMs: 2000,
    trackBinding
  });
  store.setState({
    sequenceId: "tl-1",
    baseUpdatedAt: "2026-01-01T00:00:00.000Z",
    tracks: [track],
    clips: [clip]
  });
  timelineTemporalOf(store).clear();
  return { store, track, clip };
}

describe("bindToTrack", () => {
  it("sets trackBinding in position mode, one undo entry", () => {
    const { store } = seedStore();
    const before = timelineTemporalOf(store).pastStates.length;

    store.getState().bindToTrack(CLIP_ID, "track_1", "position");

    expect(store.getState().clips[0].trackBinding).toEqual({
      trackId: "track_1",
      mode: "position"
    });
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);
  });

  it("carries offset, scale, rotationOffset and smoothing", () => {
    const { store } = seedStore();

    store.getState().bindToTrack(CLIP_ID, "track_1", "position_scale", {
      offset: { x: 10, y: -5 },
      scale: 1.5,
      rotationOffset: 0.1,
      smoothing: 0.4
    });

    expect(store.getState().clips[0].trackBinding).toEqual({
      trackId: "track_1",
      mode: "position_scale",
      offset: { x: 10, y: -5 },
      scale: 1.5,
      rotationOffset: 0.1,
      smoothing: 0.4
    });
  });

  it("refuses a mode that is not live yet", () => {
    const { store } = seedStore();
    const before = timelineTemporalOf(store).pastStates.length;

    // @ts-expect-error — exercising the runtime guard against a non-live mode.
    store.getState().bindToTrack(CLIP_ID, "track_1", "mask");

    expect(store.getState().clips[0].trackBinding).toBeUndefined();
    expect(timelineTemporalOf(store).pastStates.length).toBe(before);
  });
});

describe("unbindTrack", () => {
  it("clears trackBinding", () => {
    const { store } = seedStore({ trackId: "track_1", mode: "position" });

    store.getState().unbindTrack(CLIP_ID);

    expect(store.getState().clips[0].trackBinding).toBeUndefined();
  });

  it("is a no-op on an already-unbound clip", () => {
    const { store } = seedStore();
    const clips = store.getState().clips;
    const before = timelineTemporalOf(store).pastStates.length;

    store.getState().unbindTrack(CLIP_ID);

    expect(store.getState().clips).toBe(clips);
    expect(timelineTemporalOf(store).pastStates.length).toBe(before);
  });
});
