import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: {
      update: { mutate: jest.fn() }
    }
  }
}));

import { trpcClient } from "../../../trpc/client";
import { useTimelineSave } from "../useTimelineSave";

const updateMutate = trpcClient.timeline.update.mutate as jest.Mock;

const clip = (durationMs: number): TimelineClip =>
  ({
    id: "C1",
    trackId: "T1",
    name: "Clip",
    status: "generated",
    sourceType: "imported",
    startMs: 0,
    durationMs
  }) as unknown as TimelineClip;

const sequence = (clips: TimelineClip[]): TimelineSequence =>
  ({
    id: "seq-1",
    projectId: "proj-1",
    name: "Sequence",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 1000,
    tracks: [
      {
        id: "T1",
        type: "video",
        name: "Video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips,
    markers: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  }) as unknown as TimelineSequence;

describe("useTimelineSave", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTimelineStore.getState().reset();
  });

  it("uses the submitted snapshot as the merge base", async () => {
    useTimelineStore.getState().loadSequence(sequence([clip(1000)]));
    let finish!: (value: unknown) => void;
    updateMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );

    const rendered = renderHook(() => useTimelineSave());
    let saving!: Promise<void>;
    act(() => {
      useTimelineStore.getState().patchClip("C1", { durationMs: 800 });
      saving = rendered.result.current.save();
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    act(() => {
      useTimelineStore.getState().patchClip("C1", { durationMs: 400 });
    });
    await act(async () => {
      finish({ updatedAt: "2026-01-01T00:00:01Z" });
      await saving;
    });

    expect(useTimelineStore.getState().clips[0]?.durationMs).toBe(400);
    expect(
      useTimelineStore.getState().syncedDocument?.clips[0]?.durationMs
    ).toBe(800);
    rendered.unmount();
  });

  it("does not replace a newer merge base when a save response arrives late", async () => {
    useTimelineStore.getState().loadSequence(sequence([clip(1000)]));
    let finish!: (value: unknown) => void;
    updateMutate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const rendered = renderHook(() => useTimelineSave());
    let saving!: Promise<void>;
    act(() => {
      saving = rendered.result.current.save();
    });
    act(() => {
      useTimelineStore.getState().applyExternalMerge({ clips: [clip(400)] });
      useTimelineStore.getState().setBaseUpdatedAt("2026-01-01T00:00:02Z");
    });
    await act(async () => {
      finish({ updatedAt: "2026-01-01T00:00:01Z" });
      await saving;
    });
    expect(useTimelineStore.getState().baseUpdatedAt).toBe(
      "2026-01-01T00:00:02Z"
    );
    expect(
      useTimelineStore.getState().syncedDocument?.clips[0]?.durationMs
    ).toBe(400);
    rendered.unmount();
  });
});
