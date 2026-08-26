/**
 * Tests for useTimelineExternalSync — external changes merge into a dirty
 * timeline draft per merge unit (ADR 0001).
 */
import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { act } from "react";

import { handleDocumentResourceChange } from "../../../stores/documentSync";
import { useConflictStore } from "../../../stores/ConflictStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";

jest.mock("../../../trpc/client", () => ({
  trpc: { useUtils: jest.fn() },
  trpcClient: {
    timeline: {
      get: { query: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

import { trpc, trpcClient } from "../../../trpc/client";
import { useTimelineExternalSync } from "../useTimelineExternalSync";
import { useTimelineAutosave } from "../useTimelineAutosave";
import { getTimelineTemporal } from "../../../stores/timeline/TimelineInstance";

const getQuery = trpcClient.timeline.get.query as jest.Mock;
const updateMutate = trpcClient.timeline.update.mutate as jest.Mock;

const clip = (
  id: string,
  trackId: string,
  overrides: Partial<TimelineClip> = {}
): TimelineClip =>
  ({
    id,
    trackId,
    name: id,
    status: "generated",
    sourceType: "imported",
    startMs: 0,
    durationMs: 1000,
    ...overrides
  }) as unknown as TimelineClip;

const track = {
  id: "T1",
  type: "video",
  name: "V1",
  index: 0,
  visible: true,
  locked: false
};

const seqDoc = (
  updatedAt: string,
  clips: TimelineClip[],
  tracks: TimelineSequence["tracks"] = [track] as TimelineSequence["tracks"]
): TimelineSequence =>
  ({
    id: "seq-1",
    projectId: "proj-1",
    name: "Seq",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 5000,
    tracks,
    clips,
    markers: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt
  }) as unknown as TimelineSequence;

describe("useTimelineExternalSync merge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConflictStore.setState({ byKey: {} });
    (updateMutate as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ updatedAt: "rev-x" });
    (trpc.useUtils as unknown as jest.Mock).mockReturnValue({
      timeline: { get: { setData: jest.fn(), invalidate: jest.fn() } }
    });
  });

  it("keeps a dirty clip trim and takes an external text clip — no conflict", async () => {
    (getQuery as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(seqDoc("rev-1", [clip("C1", "T1")]));

    const rendered = renderHook(() => {
      // Mounted together, as in production: autosave owns the dirtiness probe.
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc("rev-1", [clip("C1", "T1")]));
    });
    expect(useTimelineStore.getState().syncedDocument).not.toBeNull();

    // The user trims C1; the draft is dirty.
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });
    const undoCountBefore = getTimelineTemporal().pastStates.length;

    // An agent adds a text clip to the same track.
    (getQuery as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      seqDoc("rev-2", [
        clip("C1", "T1"),
        clip("C2", "T1", { name: "Title" })
      ])
    );
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: "rev-2",
        ops: [
          {
            tool: "ui_timeline_add_text_clip",
            input: { track_id: "T1", text: "Title" }
          }
        ]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useTimelineStore.getState();
    expect(state.clips.map((c) => c.id)).toEqual(["C1", "C2"]);
    expect(state.clips.find((c) => c.id === "C1")?.durationMs).toBe(400);
    expect(state.baseUpdatedAt).toBe("rev-2");
    expect(
      useConflictStore.getState().byKey["timelinesequence:seq-1"]
    ).toBeUndefined();
    // No undo entry for the external change: only the user's own trim is on
    // the stack.
    expect(getTimelineTemporal().pastStates.length).toBe(undoCountBefore);

    rendered.unmount();
    useConflictStore.getState().clear("timelinesequence:seq-1");
  });

  it("drops a clip left dangling by an external track deletion and lists it", async () => {
    (getQuery as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(seqDoc("rev-1", [clip("C1", "T1")]));

    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc("rev-1", [clip("C1", "T1")]));
    });
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 250 } as Partial<TimelineClip>);
    });

    // Externally the whole track was removed.
    (getQuery as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      seqDoc("rev-2", [], [] as TimelineSequence["tracks"])
    );
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: "rev-2",
        ops: [{ tool: "ui_timeline_remove_track", input: { id: "T1" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The draft edit survived the merge, but its track did not: the clip is
    // dropped and offered rather than saved unrenderable.
    expect(useTimelineStore.getState().clips).toHaveLength(0);
    // The sequence shortens with its clips instead of keeping an empty tail.
    expect(useTimelineStore.getState().durationMs).toBe(0);
    const conflicts =
      useConflictStore.getState().byKey["timelinesequence:seq-1"]?.conflicts ?? [];
    expect(conflicts.map((c) => `${c.unit.kind}:${c.reason}`)).toEqual([
      "clip:dangling"
    ]);

    // Neither resolution puts the clip back on a track the document lacks:
    // accept has nothing to take and discard keeps the draft as merged. Both
    // only unlist the offer.
    act(() => {
      useConflictStore.getState().discard("timelinesequence:seq-1", "C1");
    });
    expect(useTimelineStore.getState().clips).toHaveLength(0);
    expect(
      useConflictStore.getState().byKey["timelinesequence:seq-1"]
    ).toBeUndefined();

    rendered.unmount();
    useConflictStore.getState().clear("timelinesequence:seq-1");
  });
});

// `updated_at` tokens are ISO timestamps; these three cases turn on their
// ordering, so they use real ones rather than the opaque "rev-N" above.
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";
const T3 = "2026-01-01T00:00:03.000Z";

describe("useTimelineExternalSync merge — token ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConflictStore.setState({ byKey: {} });
    (
      updateMutate as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({ updatedAt: T2 });
    (trpc.useUtils as unknown as jest.Mock).mockReturnValue({
      timeline: { get: { setData: jest.fn(), invalidate: jest.fn() } }
    });
  });

  it("aborts the merge when the fetched copy predates the user's own save", async () => {
    (
      getQuery as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(seqDoc(T0, [clip("C1", "T1")]));
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1", "T1")]));
    });
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });

    // The merge's fetch hangs.
    let answer: (sequence: TimelineSequence) => void = () => {};
    const pending = new Promise<TimelineSequence>((resolve) => {
      answer = resolve;
    });
    (
      getQuery as unknown as { mockReturnValue: (v: unknown) => void }
    ).mockReturnValue(pending);

    act(() => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: T1,
        ops: [
          {
            tool: "ui_timeline_add_text_clip",
            input: { track_id: "T1", text: "Title" }
          }
        ]
      });
    });

    // The user's own autosave lands mid-fetch: the base token and the merge
    // base roll forward to the document that was just saved.
    act(() => {
      useTimelineStore.getState().setBaseUpdatedAt(T2);
    });

    // The fetch answers with the copy from before that save.
    await act(async () => {
      answer(seqDoc(T1, [clip("C1", "T1"), clip("C2", "T1", { name: "Title" })]));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useTimelineStore.getState();
    expect(state.clips.map((c) => c.id)).toEqual(["C1"]);
    expect(state.clips[0]?.durationMs).toBe(400);
    expect(state.baseUpdatedAt).toBe(T2);
    expect(
      useConflictStore.getState().byKey["timelinesequence:seq-1"]
    ).toBeUndefined();

    rendered.unmount();
  });

  it("merges a fetched copy that is newer than the base token", async () => {
    (
      getQuery as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(seqDoc(T0, [clip("C1", "T1")]));
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1", "T1")]));
    });
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });

    (
      getQuery as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(
      seqDoc(T1, [clip("C1", "T1"), clip("C2", "T1", { name: "Title" })])
    );
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: T1,
        ops: [
          {
            tool: "ui_timeline_add_text_clip",
            input: { track_id: "T1", text: "Title" }
          }
        ]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useTimelineStore.getState();
    expect(state.clips.map((c) => c.id)).toEqual(["C1", "C2"]);
    expect(state.clips.find((c) => c.id === "C1")?.durationMs).toBe(400);
    expect(state.baseUpdatedAt).toBe(T1);

    rendered.unmount();
  });

  it("reloads instead of merging when the editor goes clean during the fetch", async () => {
    (
      getQuery as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue(seqDoc(T0, [clip("C1", "T1")]));
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 1 });
      useTimelineExternalSync("seq-1");
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1", "T1")]));
    });

    let answer: (sequence: TimelineSequence) => void = () => {};
    const pending = new Promise<TimelineSequence>((resolve) => {
      answer = resolve;
    });
    (
      getQuery as unknown as { mockReturnValue: (v: unknown) => void }
    ).mockReturnValue(pending);

    // The user's edit is still unsaved when the external change arrives.
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });
    act(() => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: T3,
        ops: [{ tool: "ui_timeline_add_text_clip", input: { track_id: "T1" } }]
      });
    });

    // Autosave persists it while the fetch is still in flight: the editor is
    // clean by the time the copy arrives.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(updateMutate).toHaveBeenCalled();

    await act(async () => {
      answer(seqDoc(T3, [clip("C1", "T1"), clip("C3", "T1")]));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useTimelineStore.getState();
    expect(state.clips.map((c) => c.id)).toEqual(["C1", "C3"]);
    expect(state.baseUpdatedAt).toBe(T3);
    // A reload replaces the document and clears history; a merge would have
    // left the user's own trim on the undo stack.
    expect(getTimelineTemporal().pastStates.length).toBe(0);
    expect(
      useConflictStore.getState().byKey["timelinesequence:seq-1"]
    ).toBeUndefined();

    rendered.unmount();
  });
});

describe("useTimelineExternalSync conflict resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useConflictStore.setState({ byKey: {} });
    (updateMutate as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({ updatedAt: "rev-x" });
    (trpc.useUtils as unknown as jest.Mock).mockReturnValue({
      timeline: { get: { setData: jest.fn(), invalidate: jest.fn() } }
    });
  });

  it("puts an accepted track on the undo stack, and undo restores the draft", async () => {
    const t1 = { ...track, name: "V1" };
    (getQuery as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      seqDoc("rev-1", [clip("C1", "T1")], [t1] as TimelineSequence["tracks"])
    );
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      useTimelineStore
        .getState()
        .loadSequence(seqDoc("rev-1", [clip("C1", "T1")], [t1] as TimelineSequence["tracks"]));
    });

    // The user renames the track; the draft is dirty on T1.
    act(() => {
      useTimelineStore.getState().setTrackName("T1", "My video");
    });

    // An agent renames the same track to something else.
    (getQuery as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      seqDoc(
        "rev-2",
        [clip("C1", "T1")],
        [{ ...t1, name: "Agent video" }] as TimelineSequence["tracks"]
      )
    );
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: "rev-2",
        ops: [
          { tool: "ui_timeline_set_track_name", input: { id: "T1", name: "Agent video" } }
        ]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const entry = useConflictStore.getState().byKey["timelinesequence:seq-1"];
    expect(entry?.conflicts.map((c) => `${c.unit.kind}:${c.reason}`)).toEqual([
      "track:edited"
    ]);
    expect(useTimelineStore.getState().tracks[0]?.name).toBe("My video");

    const undoCountBefore = getTimelineTemporal().pastStates.length;
    act(() => {
      entry?.onAccept?.("T1");
    });
    expect(useTimelineStore.getState().tracks[0]?.name).toBe("Agent video");
    // Accepting is the user's own edit: it goes on the undo stack (ADR 0001).
    expect(getTimelineTemporal().pastStates.length).toBe(undoCountBefore + 1);

    act(() => {
      getTimelineTemporal().undo();
    });
    expect(useTimelineStore.getState().tracks[0]?.name).toBe("My video");

    rendered.unmount();
    useConflictStore.getState().clear("timelinesequence:seq-1");
  });
});
