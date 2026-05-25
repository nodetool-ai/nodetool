import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineAutosave } from "../useTimelineAutosave";
import { trpcClient } from "../../../__mocks__/trpcClientMock";
import { useNotificationStore } from "../../../stores/NotificationStore";

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
    updateMutate.mockReset();
    (updateMutate as any).mockResolvedValue({
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
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:01Z"
    });
    useTimelineStore.getState().reset();
    useNotificationStore.setState({ notifications: [] });
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

  it("does not start a second save while one is in flight", async () => {
    seedSequence();
    let resolveFirst: (v: unknown) => void = () => {};
    (updateMutate as any).mockImplementationOnce(
      () =>
        new Promise((resolve: (v: unknown) => void) => {
          resolveFirst = resolve;
        })
    );

    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    // Mutate again while the first save is still pending.
    act(() => {
      useTimelineStore.getState().addTrack("audio");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);

    // Resolve the first save → second save fires with the latest state.
    await act(async () => {
      resolveFirst({
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
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:02Z"
      });
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(2));
    const secondArg = updateMutate.mock.calls[1][0] as {
      document: { tracks: unknown[] };
    };
    expect(secondArg.document.tracks).toHaveLength(2);
  });

  it("passes baseUpdatedAt and rolls it forward after each successful save", async () => {
    seedSequence();
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(
      (updateMutate.mock.calls[0][0] as { baseUpdatedAt?: string })
        .baseUpdatedAt
    ).toBe("2026-01-01T00:00:00Z");

    (updateMutate as any).mockResolvedValueOnce({
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
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:05:00Z"
    });
    act(() => {
      useTimelineStore.getState().addTrack("audio");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(2));
    expect(
      (updateMutate.mock.calls[1][0] as { baseUpdatedAt?: string })
        .baseUpdatedAt
    ).toBe("2026-01-01T00:00:01Z");
  });

  it("flushes immediately (no debounce) when unmounted with a save in flight", async () => {
    seedSequence();
    let resolveFirst: (v: unknown) => void = () => {};
    (updateMutate as any).mockImplementationOnce(
      () =>
        new Promise((resolve: (v: unknown) => void) => {
          resolveFirst = resolve;
        })
    );

    const { unmount } = renderHook(() =>
      useTimelineAutosave({ debounceMs: 50 })
    );

    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    // Queue another mutation while the first save is still pending, then
    // unmount — the post-completion handler should bypass the debounce.
    act(() => {
      useTimelineStore.getState().addTrack("audio");
    });
    unmount();

    await act(async () => {
      resolveFirst({
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
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:02Z"
      });
    });

    // The second save fires without waiting for the debounce timer.
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(2));
  });

  it("notifies on save failure", async () => {
    seedSequence();
    (updateMutate as any).mockRejectedValueOnce(new Error("boom"));
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });

    await waitFor(() => {
      const notifications = useNotificationStore.getState().notifications;
      expect(
        notifications.some((n) => n.content.includes("autosave"))
      ).toBe(true);
    });
  });
});
