import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { clipEnabledPatch, isClipDisabled } from "../../../components/timeline/Tracks/clipEnabled";
import { createTimelineStore } from "../TimelineStore";
import { runAsOneUndoEntry } from "../useTimelineHistoryBatch";

function seed(count = 150) {
  const store = createTimelineStore();
  const clips = Array.from({ length: count }, (_, i) =>
    makeClip({
      id: `clip-${i}`, trackId: "video", mediaType: "video",
      startMs: i * 1000, durationMs: 1000
    })
  );
  store.setState({ tracks: [makeTrack({ id: "video", type: "video" })], clips });
  store.temporal.getState().clear();
  return store;
}

function disableSelection(store: ReturnType<typeof seed>): void {
  const doc = store.getState();
  for (const clip of doc.clips) {
    doc.patchClip(clip.id, clipEnabledPatch(clip, false));
  }
}

describe("runAsOneUndoEntry", () => {
  it.each([100, 101, 150])("undoes and redoes disabling %s selected clips as one action", (count) => {
    const store = seed(count);
    const before = store.getState().clips;
    const result = runAsOneUndoEntry(store, () => {
      disableSelection(store);
      return "done";
    });
    expect(result).toBe("done");
    expect(store.getState().clips.every(isClipDisabled)).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().clips.filter(isClipDisabled)).toHaveLength(0);
    expect(store.getState().clips).toEqual(before);
    store.temporal.getState().redo();
    expect(store.getState().clips.every(isClipDisabled)).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("keeps older actions when batching more mutations than a full history can hold", () => {
    const store = seed();
    for (let i = 0; i < 100; i++) {
      store.getState().patchClip("clip-0", { name: `edit-${i}` });
    }
    const older = store.temporal.getState().pastStates;
    const before = store.getState().clips;
    expect(older).toHaveLength(100);
    runAsOneUndoEntry(store, () => disableSelection(store));
    expect(store.temporal.getState().pastStates).toHaveLength(100);
    expect(store.temporal.getState().pastStates.slice(0, -1)).toEqual(older.slice(1));
    store.temporal.getState().undo();
    expect(store.getState().clips).toEqual(before);
    store.temporal.getState().undo();
    expect(store.getState().clips[0].name).toBe("edit-98");
  });

  it("keeps a full history for a no-op callback", () => {
    const store = seed();
    for (let i = 0; i < 100; i++) {
      store.getState().patchClip("clip-0", { name: `edit-${i}` });
    }
    const before = store.temporal.getState().pastStates;
    runAsOneUndoEntry(store, () => store.getState().patchClip("missing", { hidden: true }));
    expect(store.temporal.getState().pastStates).toEqual(before);
    expect(store.temporal.getState().isTracking).toBe(true);
  });

  it("preserves redo for a no-op callback", () => {
    const store = seed();
    store.getState().patchClip("clip-0", { name: "later" });
    store.temporal.getState().undo();
    const before = store.temporal.getState();
    runAsOneUndoEntry(store, () => undefined);
    expect(store.temporal.getState().pastStates).toEqual(before.pastStates);
    expect(store.temporal.getState().futureStates).toEqual(before.futureStates);
    store.temporal.getState().redo();
    expect(store.getState().clips[0].name).toBe("later");
  });

  it("nests within another batch without resuming its tracking", () => {
    const store = seed();
    const before = store.getState().clips;
    runAsOneUndoEntry(store, () => {
      runAsOneUndoEntry(store, () => disableSelection(store));
      expect(store.temporal.getState().isTracking).toBe(false);
      store.getState().patchClip("clip-0", { name: "nested" });
    });
    expect(store.temporal.getState().isTracking).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().clips).toEqual(before);
  });

  it("leaves an existing temporal group open", () => {
    const store = seed();
    const before = store.getState().clips;
    store.temporal.getState().beginGroup();
    runAsOneUndoEntry(store, () => disableSelection(store));
    expect(store.temporal.getState().isTracking).toBe(false);
    store.getState().patchClip("clip-0", { name: "outer" });
    store.temporal.getState().endGroup();
    store.temporal.getState().undo();
    expect(store.getState().clips).toEqual(before);
  });

  it("leaves explicitly paused history paused", () => {
    const store = seed();
    store.temporal.getState().pause();
    runAsOneUndoEntry(store, () => disableSelection(store));
    expect(store.temporal.getState().isTracking).toBe(false);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    store.temporal.getState().resume();
    store.getState().patchClip("clip-0", { name: "later" });
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("closes a throwing batch and keeps its partial edits undoable", () => {
    const store = seed();
    const before = store.getState().clips;
    const error = new Error("batch failed");
    expect(() => runAsOneUndoEntry(store, () => {
      disableSelection(store);
      throw error;
    })).toThrow(error);
    expect(store.temporal.getState().isTracking).toBe(true);
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.getState().patchClip("clip-0", { name: "later" });
    expect(store.temporal.getState().pastStates).toHaveLength(2);
    store.temporal.getState().undo();
    expect(store.getState().clips.every(isClipDisabled)).toBe(true);
    store.temporal.getState().undo();
    expect(store.getState().clips).toEqual(before);
  });
});
