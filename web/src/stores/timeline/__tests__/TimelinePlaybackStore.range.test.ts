/**
 * @jest-environment node
 */

import { createTimelinePlaybackStore } from "../TimelinePlaybackStore";

describe("TimelinePlaybackStore — in/out range", () => {
  it("starts with no range", () => {
    const store = createTimelinePlaybackStore();
    expect(store.getState().rangeInMs).toBeNull();
    expect(store.getState().rangeOutMs).toBeNull();
  });

  it("sets in and out and clears both", () => {
    const store = createTimelinePlaybackStore();
    store.getState().setRangeIn(1000);
    store.getState().setRangeOut(4000);
    expect(store.getState().rangeInMs).toBe(1000);
    expect(store.getState().rangeOutMs).toBe(4000);
    store.getState().clearRange();
    expect(store.getState().rangeInMs).toBeNull();
    expect(store.getState().rangeOutMs).toBeNull();
  });

  it("an in point at or past the out point drops the out point, and vice versa", () => {
    const store = createTimelinePlaybackStore();
    store.getState().setRangeIn(1000);
    store.getState().setRangeOut(4000);
    store.getState().setRangeIn(4000);
    expect(store.getState().rangeOutMs).toBeNull();
    store.getState().setRangeOut(500);
    expect(store.getState().rangeInMs).toBeNull();
    expect(store.getState().rangeOutMs).toBe(500);
  });

  it("clamps a negative in point to zero", () => {
    const store = createTimelinePlaybackStore();
    store.getState().setRangeIn(-50);
    expect(store.getState().rangeInMs).toBe(0);
  });

  it("playSpan plays a bounded span from its start, and pause or Play In To Out ends it", () => {
    const store = createTimelinePlaybackStore();
    store.getState().playSpan(-500, 4000, 1000);
    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().getTimeMs()).toBe(0);
    expect(store.getState().playingSpan).toEqual({ endMs: 4000, returnToMs: 1000 });
    store.getState().pause();
    expect(store.getState().playingSpan).toBeNull();
    store.getState().playSpan(0, 2000);
    expect(store.getState().playingSpan).toEqual({ endMs: 2000, returnToMs: null });
    store.getState().playInToOut();
    expect(store.getState().playingSpan).toBeNull();
    expect(store.getState().playingInToOut).toBe(true);
  });
});
