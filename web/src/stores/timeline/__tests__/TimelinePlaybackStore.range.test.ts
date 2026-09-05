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
});
