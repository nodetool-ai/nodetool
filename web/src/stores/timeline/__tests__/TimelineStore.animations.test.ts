/**
 * TimelineStore animation actions: setClipAnimations (undo/redo), split role
 * partitioning, and duplicate id regeneration.
 */

import { describe, it, expect } from "@jest/globals";
import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { ClipAnimation } from "@nodetool-ai/timeline";

function mkStore() {
  return createTimelineStore();
}

function seedClip(store: ReturnType<typeof mkStore>, animations?: ClipAnimation[]) {
  const track = makeTrack({ type: "video", name: "V1" });
  const clip = makeClip({
    trackId: track.id,
    name: "clip-1",
    startMs: 0,
    durationMs: 3000,
    animations
  });
  store.setState({ tracks: [track], clips: [clip] });
  return clip;
}

const fadeIn: ClipAnimation = {
  id: "in-1",
  role: "in",
  preset: "fade",
  durationMs: 500
};

describe("setClipAnimations", () => {
  it("sets animations and supports undo / redo", () => {
    const store = mkStore();
    const clip = seedClip(store);

    store.getState().setClipAnimations(clip.id, [fadeIn]);
    expect(store.getState().clips[0].animations).toEqual([fadeIn]);

    timelineTemporalOf(store).undo();
    expect(store.getState().clips[0].animations).toBeUndefined();

    timelineTemporalOf(store).redo();
    expect(store.getState().clips[0].animations).toEqual([fadeIn]);
  });

  it("records exactly one undo entry per change", () => {
    const store = mkStore();
    const clip = seedClip(store);
    const before = timelineTemporalOf(store).pastStates.length;
    store.getState().setClipAnimations(clip.id, [fadeIn]);
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);
  });
});

describe("splitClipAtTime with animations", () => {
  it("keeps in on the left, out on the right, copies emphasis/loop to both", () => {
    const store = mkStore();
    const clip = seedClip(store, [
      { id: "in-1", role: "in", preset: "fade", durationMs: 300 },
      { id: "out-1", role: "out", preset: "fade", durationMs: 300 },
      { id: "emph-1", role: "emphasis", preset: "pulse", durationMs: 400 },
      { id: "loop-1", role: "loop", preset: "float", durationMs: 1000 }
    ]);

    store.getState().splitClipAtTime(clip.id, 1500);
    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    const [left, right] = [...clips].sort((a, b) => a.startMs - b.startMs);
    expect((left.animations ?? []).map((a) => a.role).sort()).toEqual([
      "emphasis",
      "in",
      "loop"
    ]);
    expect((right.animations ?? []).map((a) => a.role).sort()).toEqual([
      "emphasis",
      "loop",
      "out"
    ]);
  });
});

describe("duplicateClip with animations", () => {
  it("copies animations with fresh ids", async () => {
    const store = mkStore();
    const clip = seedClip(store, [
      { id: "loop-1", role: "loop", preset: "float", durationMs: 1000 }
    ]);

    const newId = await store.getState().duplicateClip(clip.id);
    const dup = store.getState().clips.find((c) => c.id === newId);
    expect(dup?.animations).toHaveLength(1);
    expect(dup?.animations?.[0].preset).toBe("float");
    expect(dup?.animations?.[0].id).not.toBe("loop-1");
  });
});
