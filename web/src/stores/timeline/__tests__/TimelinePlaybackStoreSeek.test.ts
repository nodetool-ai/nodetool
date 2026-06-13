import { describe, expect, it, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { createTimelinePlaybackStore } from "../TimelinePlaybackStore";
import type { TimelinePlaybackStoreApi } from "../TimelinePlaybackStore";

let store: TimelinePlaybackStoreApi;

beforeEach(() => {
  store = createTimelinePlaybackStore();
});

describe("TimelinePlaybackStore — seek", () => {
  it("sets currentTimeMs to the given value", () => {
    act(() => store.getState().seek(5000));
    expect(store.getState().currentTimeMs).toBe(5000);
  });

  it("clamps negative values to 0", () => {
    act(() => store.getState().seek(-100));
    expect(store.getState().currentTimeMs).toBe(0);
  });

  it("increments seekNonce on each call", () => {
    const nonce0 = store.getState().seekNonce;
    act(() => store.getState().seek(1000));
    expect(store.getState().seekNonce).toBe(nonce0 + 1);
    act(() => store.getState().seek(2000));
    expect(store.getState().seekNonce).toBe(nonce0 + 2);
  });

  it("does not increment seekNonce on setCurrentTimeMs", () => {
    const nonce0 = store.getState().seekNonce;
    act(() => store.getState().setCurrentTimeMs(3000));
    expect(store.getState().seekNonce).toBe(nonce0);
  });

  it("allows seeking to 0", () => {
    act(() => store.getState().seek(5000));
    act(() => store.getState().seek(0));
    expect(store.getState().currentTimeMs).toBe(0);
    expect(store.getState().seekNonce).toBe(2);
  });
});
