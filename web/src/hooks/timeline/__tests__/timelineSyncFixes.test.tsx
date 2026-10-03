/**
 * Saving, autosave and external-sync fixes (audit F1, F7, F15, F16, F17, F49,
 * F61). Hooks are mounted together, as the editor does.
 */
import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import { act } from "react";

import { handleDocumentResourceChange } from "../../../stores/documentSync";
import { useConflictStore } from "../../../stores/ConflictStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { getTimelineTemporal } from "../../../stores/timeline/TimelineInstance";
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
import { useLoadTimelineIntoStore } from "../useLoadTimelineIntoStore";
import { persistTimelineDocument } from "../useTimelineSave";
import { useTimelineProjectSettings } from "../useTimelineProjectSettings";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";

const getQuery = trpcClient.timeline.get.query as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;
const updateMutate = trpcClient.timeline.update.mutate as jest.Mock<
  (...args: unknown[]) => Promise<unknown>
>;

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";
const T3 = "2026-01-01T00:00:03.000Z";

const clip = (id: string, durationMs = 1000): TimelineClip =>
  ({
    id,
    trackId: "T1",
    name: id,
    status: "generated",
    sourceType: "imported",
    startMs: 0,
    durationMs
  }) as unknown as TimelineClip;

const track = {
  id: "T1",
  type: "video",
  name: "V1",
  index: 0,
  visible: true,
  locked: false
};

const tempo = (bpm: number) => ({
  bpm,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
});

const seqDoc = (
  updatedAt: string,
  clips: TimelineClip[],
  extra: Record<string, unknown> = {}
): TimelineSequence =>
  ({
    id: "seq-1",
    projectId: "proj-1",
    name: "Seq",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 5000,
    tracks: [track],
    clips,
    markers: [],
    createdAt: T0,
    updatedAt,
    ...extra
  }) as unknown as TimelineSequence;

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useTimelineStore.getState().reset();
  useConflictStore.setState({ byKey: {} });
  getTimelineTemporal().resume();
  updateMutate.mockReset();
  getQuery.mockReset();
  updateMutate.mockResolvedValue({ updatedAt: T1 });
  (trpc.useUtils as unknown as jest.Mock).mockReturnValue({
    timeline: { get: { setData: jest.fn(), invalidate: jest.fn() } }
  });
});

describe("F1: closing the editor keeps unsaved edits", () => {
  const edit = () =>
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });

  it("flushes before the load hook resets the store (editor hook order)", async () => {
    const sequence = seqDoc(T0, [clip("C1")]) as never;
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useLoadTimelineIntoStore(sequence);
    });
    await settle();
    expect(useTimelineStore.getState().sequenceId).toBe("seq-1");
    edit();
    rendered.unmount();
    await settle();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const sent = updateMutate.mock.calls[0]?.[0] as {
      document: { clips: TimelineClip[] };
    };
    expect(sent.document.clips[0]?.durationMs).toBe(400);
  });

  it("still saves when the reset cleanup happens to run first", async () => {
    const sequence = seqDoc(T0, [clip("C1")]) as never;
    const rendered = renderHook(() => {
      useLoadTimelineIntoStore(sequence);
      useTimelineAutosave({ debounceMs: 60_000 });
    });
    await settle();
    edit();
    rendered.unmount();
    await settle();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const sent = updateMutate.mock.calls[0]?.[0] as {
      id: string;
      document: { clips: TimelineClip[] };
    };
    expect(sent.id).toBe("seq-1");
    expect(sent.document.clips[0]?.durationMs).toBe(400);
  });

  it("registers dirty state for the tab while edits are unsaved", async () => {
    const sequence = seqDoc(T0, [clip("C1")]) as never;
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useLoadTimelineIntoStore(sequence);
    });
    await settle();
    edit();
    expect(useDocumentDraftStore.getState().dirtyTabs["timeline:seq-1"]).toBe(
      true
    );
    rendered.unmount();
    await settle();
    expect(useDocumentDraftStore.getState().dirtyTabs["timeline:seq-1"]).toBe(
      false
    );
  });
});

describe("F15: a clean reload is the new saved state", () => {
  it("does not echo a replaced server copy back", async () => {
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 20 });
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1")]));
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T2, [clip("C1", 700)]));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(updateMutate).not.toHaveBeenCalled();
    rendered.unmount();
  });
});

describe("F7: tempo and setup merge like other scalars", () => {
  it("takes an agent's tempo while the user has unsaved clip edits", async () => {
    getQuery.mockResolvedValue(seqDoc(T0, [clip("C1")], { tempo: tempo(120) }));
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await settle();
    act(() => {
      useTimelineStore
        .getState()
        .loadSequence(seqDoc(T0, [clip("C1")], { tempo: tempo(120) }));
    });
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });
    getQuery.mockResolvedValue(
      seqDoc(T2, [clip("C1"), clip("C2")], { tempo: tempo(90) })
    );
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: T2,
        ops: [
          {
            tool: "ui_timeline_set_tempo",
            input: { bpm: 90 }
          }
        ]
      });
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    const state = useTimelineStore.getState();
    expect(state.tempo?.bpm).toBe(90);
    expect(state.clips.find((c) => c.id === "C1")?.durationMs).toBe(400);
    expect(state.syncedDocument?.tempo?.bpm).toBe(90);
    rendered.unmount();
  });
});

describe("F17: an external merge keeps a gesture's paused history", () => {
  it("leaves tracking off when the merge lands mid-gesture", async () => {
    getQuery.mockResolvedValue(seqDoc(T0, [clip("C1")]));
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await settle();
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1")]));
    });
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });
    // A gesture opened its batch.
    getTimelineTemporal().pause();
    getQuery.mockResolvedValue(seqDoc(T2, [clip("C1"), clip("C2")]));
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: T2,
        ops: [{ tool: "ui_timeline_add_text_clip", input: { track_id: "T1" } }]
      });
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(useTimelineStore.getState().clips.map((c) => c.id)).toEqual([
      "C1",
      "C2"
    ]);
    expect(getTimelineTemporal().isTracking).toBe(false);
    rendered.unmount();
  });
});

describe("F49: a stale fetch is not adopted", () => {
  it("skips a reload copy older than the token already held", async () => {
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      useTimelineExternalSync("seq-1");
    });
    await settle();
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T3, [clip("C1", 900)]));
    });
    getQuery.mockResolvedValue(seqDoc(T1, [clip("C1", 100)]));
    await act(async () => {
      handleDocumentResourceChange("timelinesequence", {
        event: "updated",
        id: "seq-1",
        updatedAt: T2
      });
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(getQuery).toHaveBeenCalled();
    expect(useTimelineStore.getState().baseUpdatedAt).toBe(T3);
    expect(useTimelineStore.getState().clips[0]?.durationMs).toBe(900);
    rendered.unmount();
  });
});

describe("F16: writes go through the autosave controller", () => {
  it("persistTimelineDocument queues on the controller and syncs the merge base", async () => {
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
    });
    act(() => {
      useTimelineStore
        .getState()
        .loadSequence(seqDoc(T0, [clip("C1")], { tempo: tempo(120) }));
    });
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });
    await act(async () => {
      await persistTimelineDocument(useTimelineStore as never);
    });
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const state = useTimelineStore.getState();
    expect(state.baseUpdatedAt).toBe(T1);
    expect(state.syncedDocument?.clips[0]?.durationMs).toBe(400);
    expect(state.syncedDocument?.tempo?.bpm).toBe(120);
    rendered.unmount();
  });

  it("the direct fallback records the sent document as the base", async () => {
    act(() => {
      useTimelineStore
        .getState()
        .loadSequence(seqDoc(T0, [clip("C1")], { tempo: tempo(120) }));
    });
    await act(async () => {
      await persistTimelineDocument(useTimelineStore as never);
    });
    expect(useTimelineStore.getState().syncedDocument?.tempo?.bpm).toBe(120);
  });

  it("project settings write through the controller and revert on failure (F61)", async () => {
    const rendered = renderHook(() => {
      useTimelineAutosave({ debounceMs: 60_000 });
      return useTimelineProjectSettings();
    });
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1")]));
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await rendered.result.current.save({ fps: 24 });
    });
    expect(ok).toBe(true);
    const sent = updateMutate.mock.calls[0]?.[0] as { fps?: number };
    expect(sent.fps).toBe(24);

    updateMutate.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      ok = await rendered.result.current.save({ fps: 60 });
    });
    expect(ok).toBe(false);
    expect(useTimelineStore.getState().fps).toBe(24);
    rendered.unmount();
  });

  it("direct project-settings fallback reverts on failure and moves only the canvas in the base (F16, F61)", async () => {
    act(() => {
      useTimelineStore.getState().loadSequence(seqDoc(T0, [clip("C1")]));
    });
    const rendered = renderHook(() => useTimelineProjectSettings());
    act(() => {
      useTimelineStore
        .getState()
        .patchClip("C1", { durationMs: 400 } as Partial<TimelineClip>);
    });
    let ok: boolean | undefined;
    await act(async () => {
      ok = await rendered.result.current.save({ width: 1280, height: 720 });
    });
    expect(ok).toBe(true);
    const base = useTimelineStore.getState().syncedDocument;
    expect(base?.width).toBe(1280);
    // The unsaved trim was not part of this write.
    expect(base?.clips[0]?.durationMs).toBe(1000);

    updateMutate.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      ok = await rendered.result.current.save({ width: 640 });
    });
    expect(ok).toBe(false);
    expect(useTimelineStore.getState().width).toBe(1280);
  });
});
