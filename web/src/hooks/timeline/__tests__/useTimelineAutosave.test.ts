import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineAutosave } from "../useTimelineAutosave";
import { trpcClient } from "../../../__mocks__/trpcClientMock";

const updateMutate = trpcClient.timeline.update.mutate as unknown as jest.Mock;

const seedSequence = (id = "seq-1") => {
  useTimelineStore.getState().loadSequence({
    id,
    projectId: "proj-1",
    name: "Seq",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 0,
    tracks: [],
    clips: [],
    markers: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  });
};

describe("useTimelineAutosave", () => {
  beforeEach(() => {
    updateMutate.mockClear();
    useTimelineStore.getState().reset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not save on initial mount (no mutation yet)", () => {
    seedSequence();
    renderHook(() => useTimelineAutosave({ debounceMs: 100 }));
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("PATCHes the sequence document via trpc.timeline.update after a mutation", async () => {
    seedSequence();
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));
    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const arg = updateMutate.mock.calls[0][0] as {
      id: string;
      document: { tracks: unknown[]; clips: unknown[]; markers: unknown[] };
    };
    expect(arg.id).toBe("seq-1");
    expect(arg.document.tracks).toHaveLength(1);
    expect(arg.document.clips).toEqual([]);
    expect(arg.document.markers).toEqual([]);
  });

  it("debounces multiple mutations into a single PATCH", async () => {
    seedSequence();
    renderHook(() => useTimelineAutosave({ debounceMs: 100 }));
    act(() => {
      useTimelineStore.getState().addTrack("video");
      useTimelineStore.getState().addTrack("audio");
      useTimelineStore.getState().addTrack("overlay");
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const arg = updateMutate.mock.calls[0][0] as {
      document: { tracks: unknown[] };
    };
    expect(arg.document.tracks).toHaveLength(3);
  });

  it("does not save when sequenceId is null", () => {
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));
    act(() => {
      useTimelineStore.setState({ tracks: [] });
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("flushes pending changes on unmount", async () => {
    seedSequence();
    const { unmount } = renderHook(() =>
      useTimelineAutosave({ debounceMs: 1000 })
    );
    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    unmount();
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
  });
});
