/**
 * applyFades: the "fade in and out" command behind Alt+T and the clip menu.
 * Half a second at each end, what fits on a short clip, and nothing at all on
 * a clip the mixer never sounds.
 */

import { describe, it, expect } from "@jest/globals";
import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { makeClip, makeTrack, DEFAULT_CLIP_FADE_MS } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

function seed(clips: Partial<TimelineClip>[]) {
  const store = createTimelineStore();
  const track = makeTrack({ type: "audio", name: "A1" });
  store.setState({
    tracks: [track],
    clips: clips.map((overrides, i) =>
      makeClip({
        trackId: track.id,
        name: `clip-${i}`,
        startMs: 0,
        durationMs: 4000,
        mediaType: "audio",
        ...overrides
      })
    )
  });
  return store;
}

describe("applyFades", () => {
  it("ramps both ends of every clip named", () => {
    const store = seed([{}, {}]);
    const [a, b] = store.getState().clips;

    store.getState().applyFades(new Set([a.id]));

    expect(store.getState().clips[0].fadeInMs).toBe(DEFAULT_CLIP_FADE_MS);
    expect(store.getState().clips[0].fadeOutMs).toBe(DEFAULT_CLIP_FADE_MS);
    expect(store.getState().clips[1].fadeInMs).toBeUndefined();
    expect(b.id).not.toBe(a.id);
  });

  it("gives a clip shorter than two fades what fits", () => {
    const store = seed([{ durationMs: 600 }]);
    store.getState().applyFades(new Set([store.getState().clips[0].id]));
    expect(store.getState().clips[0].fadeInMs).toBe(300);
    expect(store.getState().clips[0].fadeOutMs).toBe(300);
  });

  it("leaves media the mixer never sounds alone", () => {
    const store = seed([{ mediaType: "text" }]);
    store.getState().applyFades(new Set([store.getState().clips[0].id]));
    expect(store.getState().clips[0].fadeInMs).toBeUndefined();
  });

  it("takes a fade length from the caller", () => {
    const store = seed([{}]);
    store.getState().applyFades(new Set([store.getState().clips[0].id]), 250);
    expect(store.getState().clips[0].fadeInMs).toBe(250);
  });

  it("is one undo entry, and a no-op when the fades are already there", () => {
    const store = seed([{}]);
    const id = store.getState().clips[0].id;

    store.getState().applyFades(new Set([id]));
    const afterFirst = store.getState().clips;
    store.getState().applyFades(new Set([id]));
    expect(store.getState().clips).toBe(afterFirst);

    timelineTemporalOf(store).undo();
    expect(store.getState().clips[0].fadeInMs).toBeUndefined();
  });
});
