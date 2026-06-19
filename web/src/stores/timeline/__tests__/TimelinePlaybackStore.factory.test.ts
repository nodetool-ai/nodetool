/**
 * @jest-environment node
 */

import { createTimelinePlaybackStore } from "../TimelinePlaybackStore";

describe("createTimelinePlaybackStore — factory isolation", () => {
  it("creates independent store instances", () => {
    const storeA = createTimelinePlaybackStore();
    const storeB = createTimelinePlaybackStore();

    storeA.getState().seek(5000);
    storeA.getState().play();

    expect(storeA.getState().currentTimeMs).toBe(5000);
    expect(storeA.getState().isPlaying).toBe(true);
    expect(storeB.getState().currentTimeMs).toBe(0);
    expect(storeB.getState().isPlaying).toBe(false);
  });

  it("each instance starts with default state", () => {
    const store = createTimelinePlaybackStore();
    expect(store.getState().currentTimeMs).toBe(0);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().rate).toBe(1);
    expect(store.getState().seekNonce).toBe(0);
  });

  it("seek on one instance does not affect another's seekNonce", () => {
    const storeA = createTimelinePlaybackStore();
    const storeB = createTimelinePlaybackStore();

    storeA.getState().seek(1000);
    storeA.getState().seek(2000);
    storeA.getState().seek(3000);

    expect(storeA.getState().seekNonce).toBe(3);
    expect(storeB.getState().seekNonce).toBe(0);
  });

  it("rate changes are independent between instances", () => {
    const storeA = createTimelinePlaybackStore();
    const storeB = createTimelinePlaybackStore();

    storeA.getState().setRate(2.5);
    storeB.getState().setRate(0.25);

    expect(storeA.getState().rate).toBe(2.5);
    expect(storeB.getState().rate).toBe(0.25);
  });

  it("stop on one instance does not reset another", () => {
    const storeA = createTimelinePlaybackStore();
    const storeB = createTimelinePlaybackStore();

    storeA.getState().setCurrentTimeMs(5000);
    storeA.getState().play();
    storeB.getState().setCurrentTimeMs(8000);
    storeB.getState().play();

    storeA.getState().stop();

    expect(storeA.getState().currentTimeMs).toBe(0);
    expect(storeA.getState().isPlaying).toBe(false);
    expect(storeB.getState().currentTimeMs).toBe(8000);
    expect(storeB.getState().isPlaying).toBe(true);
  });

  it("play then pause preserves position", () => {
    const store = createTimelinePlaybackStore();
    store.getState().setCurrentTimeMs(3500);
    store.getState().play();
    store.getState().pause();

    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTimeMs).toBe(3500);
  });

  it("seek clamps negative time to zero", () => {
    const store = createTimelinePlaybackStore();
    store.getState().seek(-100);

    expect(store.getState().currentTimeMs).toBe(0);
    expect(store.getState().seekNonce).toBe(1);
  });

  it("setCurrentTimeMs does not clamp negative values", () => {
    const store = createTimelinePlaybackStore();
    store.getState().setCurrentTimeMs(-50);

    expect(store.getState().currentTimeMs).toBe(-50);
  });

  it("setIsPlaying toggles without side effects", () => {
    const store = createTimelinePlaybackStore();
    store.getState().setCurrentTimeMs(1234);

    store.getState().setIsPlaying(true);
    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().currentTimeMs).toBe(1234);

    store.getState().setIsPlaying(false);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentTimeMs).toBe(1234);
  });
});
