import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { asMock } from "../../../test-utils/doubles";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  createMediaEditRequest,
  makeClip,
  makeTrack,
  type TimelineSequence
} from "@nodetool-ai/timeline";

import {
  useTimelineStore,
  getTimelineTemporal
} from "../../../stores/timeline/TimelineStore";
import {
  useTimelineAutosave,
  markTimelineLoadMigrated
} from "../useTimelineAutosave";
import { trpcClient } from "../../../__mocks__/trpcClientMock";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useConflictStore } from "../../../stores/ConflictStore";
import { useDirectGenPendingStore } from "../directGenPending";
import { landMediaEdit } from "../useTimelineDirectGenJob";

const updateMutate = asMock(trpcClient.timeline.update.mutate);
const getQuery = asMock(trpcClient.timeline.get.query);

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
    getQuery.mockReset();
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
    useDirectGenPendingStore.setState({
      pending: {},
      durationSamples: {},
      editSettlements: {}
    });
    useNotificationStore.setState({ notifications: [] });
    useConflictStore.setState({ byKey: {} });
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

  it("acknowledges a native edit only after its candidate is saved", async () => {
    seedSequence();
    const clip = makeClip({
      id: "clip-1",
      trackId: "track-1",
      mediaType: "video",
      sourceType: "imported",
      currentAssetId: "asset-source",
      durationMs: 4_000
    });
    useTimelineStore.setState({ clips: [clip] });
    const request = createMediaEditRequest({
      sourceContext: {
        sequenceId: "seq-1",
        clipId: "clip-1",
        sourceAssetId: "asset-source",
        sourceStartMs: 0,
        sourceEndMs: 4_000,
        timelineStartMs: 0,
        timelineDurationMs: 4_000,
        speedMultiplier: 1
      },
      instruction: "remove the crowd",
      provider: "nodetool",
      model: "edit-model"
    });
    const requestId = "req-autosave-ack";
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "clip-1",
      requestId,
      startedAt: Date.now() - 1_000,
      bucket: "video_edit:edit-model",
      mediaEdit: request
    });
    landMediaEdit(useTimelineStore, "clip-1", requestId, "seq-1", request, {
      assetIds: ["asset-candidate"],
      errored: false
    });
    expect(
      useDirectGenPendingStore.getState().editSettlements[requestId]
        ?.acknowledgedAt
    ).toBeUndefined();

    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));
    act(() => {
      useTimelineStore.getState().addTrack("video");
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    expect(
      useDirectGenPendingStore.getState().editSettlements[requestId]
        ?.acknowledgedAt
    ).toBeDefined();
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

  // The guided flow's controls write nothing but `setup`. The subscriber used
  // to compare every other slice and return early, so removing a beat or
  // switching voiceover off never reached the debounce and came back on reload.
  it("PATCHes a setup-only edit", async () => {
    seedSequence();
    act(() => {
      useTimelineStore.getState().setSetup({
        stage: "review",
        brief: "A lamp spot",
        voiceover: true,
        beats: [
          { id: "b1", prompt: "Open on the lamp", duration_ms: 2000 },
          { id: "b2", prompt: "Cut to the desk", duration_ms: 2000 }
        ]
      });
    });
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      useTimelineStore.getState().removeBeat("b2");
      useTimelineStore.getState().setSetup({ voiceover: false });
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const arg = updateMutate.mock.calls[0][0] as {
      document: { setup?: { voiceover?: boolean; beats?: { id: string }[] } };
    };
    expect(arg.document.setup?.voiceover).toBe(false);
    expect(arg.document.setup?.beats?.map((beat) => beat.id)).toEqual(["b1"]);
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
    let resolveFirst: (v: Partial<TimelineSequence>) => void = () => {};
    (updateMutate as any).mockImplementationOnce(
      () =>
        new Promise((resolve: (v: Partial<TimelineSequence>) => void) => {
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
    let resolveFirst: (v: Partial<TimelineSequence>) => void = () => {};
    (updateMutate as any).mockImplementationOnce(
      () =>
        new Promise((resolve: (v: Partial<TimelineSequence>) => void) => {
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

  it("sends the freshest baseUpdatedAt for a save queued behind an in-flight one", async () => {
    seedSequence();
    let resolveFirst: (v: Partial<TimelineSequence>) => void = () => {};
    (updateMutate as any).mockImplementationOnce(
      () =>
        new Promise((resolve: (v: Partial<TimelineSequence>) => void) => {
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

    // An edit captured while the first save is still in flight snapshots the
    // PRE-response token — the follow-up save must not send it.
    act(() => {
      useTimelineStore.getState().addTrack("audio");
    });
    await act(async () => {
      resolveFirst({
        id: "seq-1",
        updatedAt: "2026-01-01T00:10:00Z"
      });
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(2));

    expect(
      (updateMutate.mock.calls[1][0] as { baseUpdatedAt?: string })
        .baseUpdatedAt
    ).toBe("2026-01-01T00:10:00Z");
  });

  it("retries a failed save on the unmount flush", async () => {
    seedSequence();
    (updateMutate as any).mockRejectedValueOnce(new Error("boom"));
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
    // Wait for the failure handler to restore the snapshot.
    await waitFor(() => {
      const notifications = useNotificationStore.getState().notifications;
      expect(notifications.some((n) => n.content.includes("autosave"))).toBe(
        true
      );
    });

    // No hot retry loop while idle.
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);

    // The unmount flush retries the restored snapshot.
    unmount();
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(2));
    const retryArg = updateMutate.mock.calls[1][0] as {
      document: { tracks: unknown[] };
    };
    expect(retryArg.document.tracks).toHaveLength(1);
  });

  it("does not schedule a save when a sequence is loaded after mount", async () => {
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      seedSequence();
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(updateMutate).not.toHaveBeenCalled();

    // A real edit after the load still saves.
    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
  });

  it("persists a load that migrated a legacy transcript exactly once", async () => {
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      markTimelineLoadMigrated("seq-1");
      seedSequence();
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);
  });

  it("skips a redundant save when an edit reverts to the last-saved document", async () => {
    seedSequence();
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    // Edit + save: tracks become [video].
    act(() => {
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    const saved = useTimelineStore.getState();
    const savedTracks = saved.tracks;
    const savedClips = saved.clips;

    // An edit (new tracks ref) followed, before the debounce fires, by a revert
    // to the exact saved document references must NOT produce a second PATCH:
    // the debounced flush sees the pending snapshot equals the last-saved one.
    act(() => {
      useTimelineStore.setState({
        tracks: [...savedTracks, makeTrack({ type: "audio" })]
      });
    });
    act(() => {
      useTimelineStore.setState({ tracks: savedTracks, clips: savedClips });
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);
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
      expect(notifications.some((n) => n.content.includes("autosave"))).toBe(
        true
      );
    });
  });

  it("merges an external clip before retrying a CAS-conflicted local trim", async () => {
    const baseClip = makeClip({
      id: "clip-local",
      trackId: "track-1",
      mediaType: "video",
      sourceType: "imported",
      durationMs: 4_000
    });
    const externalClip = makeClip({
      id: "clip-external",
      trackId: "track-1",
      mediaType: "text",
      sourceType: "generated",
      startMs: 4_000,
      durationMs: 1_000
    });
    const sequence = {
      id: "seq-1",
      projectId: "proj-1",
      name: "Seq",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 4_000,
      tracks: [makeTrack({ id: "track-1", type: "video" })],
      clips: [baseClip],
      markers: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    } satisfies TimelineSequence;
    useTimelineStore.getState().loadSequence(sequence);
    updateMutate
      .mockRejectedValueOnce(new Error("Timeline was modified since last read"))
      .mockResolvedValueOnce({ updatedAt: "2026-01-01T00:00:02Z" });
    getQuery.mockResolvedValue({
      ...sequence,
      clips: [baseClip, externalClip],
      durationMs: 5_000,
      updatedAt: "2026-01-01T00:00:01Z"
    });
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      useTimelineStore
        .getState()
        .patchClip("clip-local", { durationMs: 2_000 });
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(useTimelineStore.getState().clips.map((clip) => clip.id)).toEqual([
        "clip-local",
        "clip-external"
      ])
    );

    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(2));

    const retry = updateMutate.mock.calls[1][0] as {
      baseUpdatedAt?: string;
      document: { clips: TimelineSequence["clips"] };
    };
    expect(retry.baseUpdatedAt).toBe("2026-01-01T00:00:01Z");
    expect(retry.document.clips.map((clip) => clip.id)).toEqual([
      "clip-local",
      "clip-external"
    ]);
    expect(
      retry.document.clips.find((clip) => clip.id === "clip-local")?.durationMs
    ).toBe(2_000);

    act(() => {
      getTimelineTemporal().undo();
    });
    expect(useTimelineStore.getState().clips.map((clip) => clip.id)).toEqual([
      "clip-local",
      "clip-external"
    ]);
    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === "clip-local")
        ?.durationMs
    ).toBe(4_000);
  });

  it("offers a same-clip CAS conflict for explicit resolution", async () => {
    const track = makeTrack({ id: "track-1", type: "video" });
    const baseClip = makeClip({
      id: "clip-1",
      trackId: track.id,
      mediaType: "video",
      sourceType: "imported",
      currentAssetId: "asset-base",
      durationMs: 4_000
    });
    const sequence = {
      id: "seq-1",
      projectId: "proj-1",
      name: "Seq",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 4_000,
      tracks: [track],
      clips: [baseClip],
      markers: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    } satisfies TimelineSequence;
    useTimelineStore.getState().loadSequence(sequence);
    updateMutate.mockRejectedValueOnce(
      new Error("Timeline was modified since last read")
    );
    getQuery.mockResolvedValue({
      ...sequence,
      clips: [{ ...baseClip, currentAssetId: "asset-external" }],
      updatedAt: "2026-01-01T00:00:01Z"
    });
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    act(() => {
      useTimelineStore.getState().patchClip(baseClip.id, { durationMs: 2_000 });
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const conflicts =
        useConflictStore.getState().byKey["timelinesequence:seq-1"]
          ?.conflicts ?? [];
      expect(conflicts.map((conflict) => conflict.unit.id)).toEqual([
        baseClip.id
      ]);
    });

    expect(useTimelineStore.getState().clips[0]?.currentAssetId).toBe(
      "asset-base"
    );
    act(() => {
      useConflictStore.getState().accept("timelinesequence:seq-1", baseClip.id);
    });
    expect(useTimelineStore.getState().clips[0]?.currentAssetId).toBe(
      "asset-external"
    );
  });

  it("defers the flush while a gesture batch is open, then saves once it ends", async () => {
    seedSequence();
    renderHook(() => useTimelineAutosave({ debounceMs: 50 }));

    // Simulate a drag/trim/slider gesture: useTimelineHistoryBatch pauses the
    // temporal store for its duration.
    act(() => {
      getTimelineTemporal().pause();
      useTimelineStore.getState().addTrack("video");
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    // The debounce elapsed, but the gesture is still open: the flush must
    // re-arm instead of PATCHing the mid-gesture state.
    expect(updateMutate).not.toHaveBeenCalled();

    // Gesture ends (pointerup resumes tracking) with no further store write.
    act(() => {
      getTimelineTemporal().resume();
    });
    act(() => {
      jest.advanceTimersByTime(60);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const arg = updateMutate.mock.calls[0][0] as {
      document: { tracks: unknown[] };
    };
    expect(arg.document.tracks).toHaveLength(1);
  });
  it("does not roll the base token back over a newer merge-adopted token", async () => {
    seedSequence();
    let answer: (response: unknown) => void = () => {};
    updateMutate.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
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

    // An external merge lands while the save is in flight: it adopts the
    // server copy and the token that goes with it.
    const serverDocument = {
      tracks: [],
      trackFolders: [],
      clips: [],
      markers: [],
      mediaTracks: [],
      transcript: [],
      scriptEnabled: false,
      fps: 30,
      width: 1920,
      height: 1080
    };
    act(() => {
      useTimelineStore
        .getState()
        .setBaseUpdatedAt("2026-01-01T00:00:09Z", serverDocument);
    });

    // The save answers with the older token it earned before the merge.
    await act(async () => {
      answer({ updatedAt: "2026-01-01T00:00:01Z" });
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useTimelineStore.getState();
    expect(state.baseUpdatedAt).toBe("2026-01-01T00:00:09Z");
    expect(state.syncedDocument).toBe(serverDocument);
  });
});
