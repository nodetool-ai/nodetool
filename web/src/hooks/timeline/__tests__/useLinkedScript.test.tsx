/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import type { ScriptTake } from "../../../stores/script/ScriptStore";

jest.mock("../../script/useScriptServerSync", () => ({
  useScriptServerSync: () => "ready"
}));
jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: {
      list: { useQuery: () => ({ data: undefined }) }
    }
  },
  trpcClient: {}
}));

import { useScriptStore } from "../../../stores/script/ScriptStore";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../stores/timeline/TimelineStore";
import { isTimelineReconciledLive } from "../../../stores/script/liveTimelineLinks";
import { useLinkedScriptId, useLinkedScriptSync } from "../useLinkedScript";

const take = (id: string, durationMs: number, text: string): ScriptTake => ({
  id,
  assetId: `asset-${id}`,
  durationMs,
  words: [],
  textSnapshot: text,
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const seedScript = (lines: { id: string; text: string; take?: ScriptTake }[]) =>
  act(() => {
    useScriptStore.getState().loadScript("script-1", {
      title: "Promo",
      cast: [],
      timelineId: "seq-1",
      storyboardId: null,
      sections: [
        {
          id: "sec",
          lines: lines.map((line) => ({
            id: line.id,
            text: line.text,
            takes: line.take ? [line.take] : [],
            currentTakeId: line.take?.id ?? null
          }))
        }
      ]
    });
  });

const setup = () => {
  const instance = createTimelineInstance();
  act(() => {
    instance.doc.setState({ sequenceId: "seq-1", tracks: [], clips: [] });
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TimelineProvider instance={instance}>{children}</TimelineProvider>
  );
  return { instance, wrapper };
};

const clipOf = (
  instance: ReturnType<typeof createTimelineInstance>,
  lineId: string
) => instance.doc.getState().clips.find((c) => c.scriptLineId === lineId);

beforeEach(() => {
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {}
  });
});

describe("useLinkedScriptSync", () => {
  it("lays voiced lines on a voiceover track and follows script edits live", () => {
    seedScript([
      { id: "a", text: "One.", take: take("t1", 1000, "One.") },
      { id: "b", text: "Two." }
    ]);
    const { instance, wrapper } = setup();
    const { unmount } = renderHook(() => useLinkedScriptSync("script-1"), {
      wrapper
    });

    expect(instance.doc.getState().tracks).toHaveLength(1);
    expect(clipOf(instance, "a")).toMatchObject({ startMs: 0, durationMs: 1000 });
    expect(clipOf(instance, "b")).toBeUndefined();
    expect(isTimelineReconciledLive("seq-1")).toBe(true);

    // The user moves the first clip; voicing the second line places it after
    // the first one's new position, and editing text moves nothing.
    act(() => instance.doc.getState().moveClip(clipOf(instance, "a")!.id, 4000));
    act(() =>
      useScriptStore.getState().appendTake("script-1", "b", take("t2", 500, "Two."))
    );
    act(() => useScriptStore.getState().setCurrentTake("script-1", "b", "t2"));
    act(() => useScriptStore.getState().patchLine("script-1", "a", { text: "One!" }));

    expect(clipOf(instance, "a")).toMatchObject({ startMs: 4000, prompt: "One!" });
    expect(clipOf(instance, "b")?.startMs).toBe(5000);

    unmount();
    expect(isTimelineReconciledLive("seq-1")).toBe(false);
  });

  it("records no timeline undo entry for a script-driven change", () => {
    seedScript([{ id: "a", text: "One.", take: take("t1", 1000, "One.") }]);
    const { instance, wrapper } = setup();
    const before = timelineTemporalOf(instance.doc).pastStates.length;

    renderHook(() => useLinkedScriptSync("script-1"), { wrapper });
    act(() => useScriptStore.getState().removeLine("script-1", "a"));

    expect(instance.doc.getState().clips).toEqual([]);
    expect(timelineTemporalOf(instance.doc).pastStates.length).toBe(before);
  });

  it("keeps the current take on a clip after a timeline undo and redo", () => {
    seedScript([{ id: "a", text: "One.", take: take("t1", 1000, "One.") }]);
    const { instance, wrapper } = setup();
    renderHook(() => useLinkedScriptSync("script-1"), { wrapper });

    act(() => instance.doc.getState().moveClip(clipOf(instance, "a")!.id, 4000));
    act(() =>
      useScriptStore.getState().appendTake("script-1", "a", take("t2", 1000, "One."))
    );
    act(() => useScriptStore.getState().setCurrentTake("script-1", "a", "t2"));
    expect(clipOf(instance, "a")?.currentAssetId).toBe("asset-t2");

    act(() => timelineTemporalOf(instance.doc).undo());
    expect(clipOf(instance, "a")).toMatchObject({
      startMs: 0,
      currentAssetId: "asset-t2"
    });
    // The correction records nothing, so redo still has the move.
    act(() => timelineTemporalOf(instance.doc).redo());
    expect(clipOf(instance, "a")).toMatchObject({
      startMs: 4000,
      currentAssetId: "asset-t2"
    });
  });

  it("does not bring back a deleted line's clip on timeline undo", () => {
    seedScript([
      { id: "a", text: "One.", take: take("t1", 1000, "One.") },
      { id: "b", text: "Two.", take: take("t2", 1000, "Two.") }
    ]);
    const { instance, wrapper } = setup();
    renderHook(() => useLinkedScriptSync("script-1"), { wrapper });

    act(() => instance.doc.getState().moveClip(clipOf(instance, "a")!.id, 4000));
    act(() => useScriptStore.getState().removeLine("script-1", "b"));
    expect(clipOf(instance, "b")).toBeUndefined();

    act(() => timelineTemporalOf(instance.doc).undo());
    expect(clipOf(instance, "a")?.startMs).toBe(0);
    expect(clipOf(instance, "b")).toBeUndefined();
  });

  it("deletes a line from the script when its clip is deleted, and undo brings both back", () => {
    seedScript([
      { id: "a", text: "One.", take: take("t1", 1000, "One.") },
      { id: "b", text: "Two.", take: take("t2", 500, "Two.") }
    ]);
    const { instance, wrapper } = setup();
    renderHook(() => useLinkedScriptSync("script-1"), { wrapper });
    const lineIds = () =>
      useScriptStore
        .getState()
        .scripts["script-1"].sections.flatMap((s) => s.lines)
        .map((l) => l.id);

    act(() => instance.doc.getState().moveClip(clipOf(instance, "b")!.id, 3000));
    const moved = clipOf(instance, "b")!;
    act(() => instance.doc.getState().deleteClip(moved.id));
    expect(lineIds()).toEqual(["a"]);
    expect(clipOf(instance, "b")).toBeUndefined();

    // Undo restores the clip where it was and the line with its take.
    act(() => timelineTemporalOf(instance.doc).undo());
    expect(lineIds()).toEqual(["a", "b"]);
    expect(clipOf(instance, "b")).toMatchObject({
      id: moved.id,
      startMs: moved.startMs,
      currentAssetId: "asset-t2"
    });

    act(() => timelineTemporalOf(instance.doc).redo());
    expect(lineIds()).toEqual(["a"]);
    expect(clipOf(instance, "b")).toBeUndefined();
  });

  it("does not delete a line when a script change removes its clip", () => {
    seedScript([{ id: "a", text: "One.", take: take("t1", 1000, "One.") }]);
    const { instance, wrapper } = setup();
    renderHook(() => useLinkedScriptSync("script-1"), { wrapper });

    // Clearing the current take removes the clip; the line must stay.
    act(() => useScriptStore.getState().setCurrentTake("script-1", "a", null));
    expect(clipOf(instance, "a")).toBeUndefined();
    expect(
      useScriptStore.getState().scripts["script-1"].sections[0].lines.map((l) => l.id)
    ).toEqual(["a"]);
  });
});

describe("useLinkedScriptId", () => {
  it("finds a script linked in this browser before the server list knows it", () => {
    seedScript([]);
    const { result } = renderHook(() => useLinkedScriptId("seq-1"));
    expect(result.current).toBe("script-1");
    act(() => useScriptStore.getState().setTimelineLink("script-1", null));
    expect(result.current).toBeNull();
  });
});
