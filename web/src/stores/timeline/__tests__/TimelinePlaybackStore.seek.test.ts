/**
 * @jest-environment node
 */
import { createTimelinePlaybackStore } from "../TimelinePlaybackStore";

describe("TimelinePlaybackStore — seek", () => {
  it("sets currentTimeMs and increments seekNonce", () => {
    const store = createTimelinePlaybackStore();
    const initialNonce = store.getState().seekNonce;

    store.getState().seek(5000);

    expect(store.getState().currentTimeMs).toBe(5000);
    expect(store.getState().seekNonce).toBe(initialNonce + 1);
  });

  it("increments seekNonce on every call", () => {
    const store = createTimelinePlaybackStore();
    const nonce0 = store.getState().seekNonce;

    store.getState().seek(1000);
    expect(store.getState().seekNonce).toBe(nonce0 + 1);

    store.getState().seek(2000);
    expect(store.getState().seekNonce).toBe(nonce0 + 2);

    store.getState().seek(3000);
    expect(store.getState().seekNonce).toBe(nonce0 + 3);
  });

  it("clamps negative values to 0", () => {
    const store = createTimelinePlaybackStore();

    store.getState().seek(-500);

    expect(store.getState().currentTimeMs).toBe(0);
  });

  it("does not bump seekNonce on plain setCurrentTimeMs", () => {
    const store = createTimelinePlaybackStore();
    const initialNonce = store.getState().seekNonce;

    store.getState().setCurrentTimeMs(9999);

    expect(store.getState().currentTimeMs).toBe(9999);
    expect(store.getState().seekNonce).toBe(initialNonce);
  });

  it("seek works independently of play/pause state", () => {
    const store = createTimelinePlaybackStore();

    store.getState().play();
    store.getState().seek(3000);

    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().currentTimeMs).toBe(3000);
  });

  it("stop resets time but does not affect seekNonce", () => {
    const store = createTimelinePlaybackStore();
    store.getState().seek(5000);
    const nonceAfterSeek = store.getState().seekNonce;

    store.getState().stop();

    expect(store.getState().currentTimeMs).toBe(0);
    expect(store.getState().seekNonce).toBe(nonceAfterSeek);
  });
});
