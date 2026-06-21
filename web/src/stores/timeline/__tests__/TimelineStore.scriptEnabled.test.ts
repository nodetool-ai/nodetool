/**
 * TimelineStore scriptEnabled tests.
 *
 * The script feature (transcript lane + transcript panel) is optional, gated by
 * a persisted sequence-level `scriptEnabled` boolean. State is always a definite
 * boolean: new stores default to false, and the back-compat fallback
 * ("existing timelines with transcript clips count as enabled") is applied once
 * during loadSequence normalization.
 */

import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";

function makeSequence(
  overrides: Partial<TimelineSequence> = {}
): TimelineSequence {
  return {
    id: "seq-1",
    projectId: "proj-1",
    name: "Seq",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 0,
    tracks: [],
    clips: [],
    markers: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides
  };
}

/** A clip that counts as a transcript clip (carries a caption). */
function transcriptClip(trackId: string): TimelineClip {
  return makeClip({
    trackId,
    name: "vo",
    startMs: 0,
    durationMs: 3000,
    mediaType: "audio",
    caption: { words: [] }
  });
}

describe("TimelineStore — scriptEnabled", () => {
  it("defaults scriptEnabled to false on a fresh store", () => {
    const store = createTimelineStore();
    expect(store.getState().scriptEnabled).toBe(false);
  });

  it("setScriptEnabled flips the flag both ways", () => {
    const store = createTimelineStore();
    store.getState().setScriptEnabled(true);
    expect(store.getState().scriptEnabled).toBe(true);
    store.getState().setScriptEnabled(false);
    expect(store.getState().scriptEnabled).toBe(false);
  });

  it("loadSequence: undefined flag + transcript clip → enabled (back-compat)", () => {
    const store = createTimelineStore();
    const track = makeTrack({ type: "audio", name: "VO" });
    store
      .getState()
      .loadSequence(
        makeSequence({ tracks: [track], clips: [transcriptClip(track.id)] })
      );
    expect(store.getState().scriptEnabled).toBe(true);
  });

  it("loadSequence: undefined flag + no transcript clips → disabled", () => {
    const store = createTimelineStore();
    const track = makeTrack({ type: "video", name: "V1" });
    const plain = makeClip({
      trackId: track.id,
      name: "broll",
      startMs: 0,
      durationMs: 1000
    });
    store
      .getState()
      .loadSequence(makeSequence({ tracks: [track], clips: [plain] }));
    expect(store.getState().scriptEnabled).toBe(false);
  });

  it("loadSequence: explicit false wins over present transcript clips", () => {
    const store = createTimelineStore();
    const track = makeTrack({ type: "audio", name: "VO" });
    store.getState().loadSequence(
      makeSequence({
        tracks: [track],
        clips: [transcriptClip(track.id)],
        scriptEnabled: false
      })
    );
    expect(store.getState().scriptEnabled).toBe(false);
  });
});
