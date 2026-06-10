import { describe, expect, it, beforeEach } from "@jest/globals";
import { renderHook } from "@testing-library/react";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useLoadTimelineIntoStore } from "../useLoadTimelineIntoStore";

import type { TimelineSequence } from "@nodetool-ai/timeline";

const makeSeq = (overrides: Partial<TimelineSequence> = {}): TimelineSequence => ({
  id: "seq-1",
  projectId: "proj-1",
  name: "Test Sequence",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 5000,
  tracks: [],
  clips: [],
  markers: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides
});

describe("useLoadTimelineIntoStore", () => {
  beforeEach(() => {
    useTimelineStore.getState().reset();
  });

  it("does nothing while sequence is undefined", () => {
    renderHook(() => useLoadTimelineIntoStore(undefined));
    expect(useTimelineStore.getState().sequenceId).toBeNull();
  });

  it("loads sequence into the store when it arrives", () => {
    const seq = makeSeq();
    renderHook(() => useLoadTimelineIntoStore(seq));
    const state = useTimelineStore.getState();
    expect(state.sequenceId).toBe("seq-1");
    expect(state.fps).toBe(30);
    expect(state.width).toBe(1920);
    expect(state.height).toBe(1080);
    expect(state.durationMs).toBe(5000);
  });

  it("does NOT reload on a same-id refetch (preserves local edits)", () => {
    const seq = makeSeq();
    const { rerender } = renderHook(
      ({ s }: { s: TimelineSequence | undefined }) =>
        useLoadTimelineIntoStore(s),
      { initialProps: { s: seq as TimelineSequence | undefined } }
    );
    expect(useTimelineStore.getState().sequenceId).toBe("seq-1");

    // Local edit after load.
    useTimelineStore.getState().addTrack("video");
    expect(useTimelineStore.getState().tracks).toHaveLength(1);

    // Background refetch: a fresh object for the same sequence id.
    rerender({ s: makeSeq() });

    // The local edit survives — the store was not reloaded.
    expect(useTimelineStore.getState().tracks).toHaveLength(1);
  });

  it("reloads when the sequence id changes", () => {
    const a = makeSeq({ id: "a", durationMs: 1000 });
    const b = makeSeq({ id: "b", durationMs: 2000 });
    const { rerender } = renderHook(
      ({ seq }: { seq: TimelineSequence | undefined }) =>
        useLoadTimelineIntoStore(seq),
      { initialProps: { seq: a as TimelineSequence | undefined } }
    );
    expect(useTimelineStore.getState().sequenceId).toBe("a");
    rerender({ seq: b });
    expect(useTimelineStore.getState().sequenceId).toBe("b");
    expect(useTimelineStore.getState().durationMs).toBe(2000);
  });

  it("resets the store on unmount", () => {
    const seq = makeSeq();
    const { unmount } = renderHook(() => useLoadTimelineIntoStore(seq));
    expect(useTimelineStore.getState().sequenceId).toBe("seq-1");
    unmount();
    expect(useTimelineStore.getState().sequenceId).toBeNull();
    expect(useTimelineStore.getState().clips).toEqual([]);
  });
});
