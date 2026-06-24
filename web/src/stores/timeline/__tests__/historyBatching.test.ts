/**
 * Regression: undo batching for clip/track pointer gestures
 * (useTimelineHistoryBatch).
 *
 * A drag/trim/resize gesture must collapse into ONE undo entry whose single
 * Ctrl+Z restores the exact pre-gesture state — even when the gesture's
 * opening pointermoves are clamped no-ops (trimming past a boundary, dragging
 * a clip already at 0, resizing a track at its min/max height). The earlier
 * "pause right after the first mutation call" approach paused before any real
 * mutation checkpointed the pre-gesture state, so one undo over-reverted
 * (swallowing both the gesture and the action before it).
 */

import { renderHook } from "@testing-library/react";
import { useTimelineHistoryBatch } from "../useTimelineHistoryBatch";
import { useTimelineStore, getTimelineTemporal } from "../TimelineInstance";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

function seed() {
  const track = makeTrack({ id: "v", type: "video" });
  const clip = makeClip({
    id: "a",
    trackId: "v",
    mediaType: "video",
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000,
    currentAssetId: "asset-1"
  });
  useTimelineStore.setState({ tracks: [track], clips: [clip], markers: [] });
  getTimelineTemporal().clear();
  return clip.id;
}

/** Drive one trim-start gesture exactly the way Clip.tsx wires the hook. */
function runTrimStartGesture(
  history: ReturnType<typeof useTimelineHistoryBatch>,
  clipId: string,
  deltasMs: number[]
) {
  history.begin();
  for (const d of deltasMs) {
    // Clip.tsx calls trimClipStart(clip.id, -deltaMs) then history.mark().
    useTimelineStore.getState().trimClipStart(clipId, -d);
    history.mark();
  }
  history.end();
}

describe("useTimelineHistoryBatch", () => {
  it("a normal trim gesture collapses to one undo entry and reverts fully", () => {
    const clipId = seed();
    const { result } = renderHook(() => useTimelineHistoryBatch());

    // Prior committed edit = an undo checkpoint behind the gesture.
    useTimelineStore.getState().moveClip(clipId, 200);
    const startBefore = useTimelineStore.getState().clips[0].startMs; // 200
    const durBefore = useTimelineStore.getState().clips[0].durationMs; // 1000
    const pastBefore = getTimelineTemporal().pastStates.length;

    runTrimStartGesture(result.current, clipId, [10, 10, 10]);

    // Whole gesture = exactly one new undo entry.
    expect(getTimelineTemporal().pastStates.length).toBe(pastBefore + 1);
    expect(useTimelineStore.getState().clips[0].durationMs).toBeLessThan(
      durBefore
    );

    getTimelineTemporal().undo();
    expect(useTimelineStore.getState().clips[0].startMs).toBe(startBefore);
    expect(useTimelineStore.getState().clips[0].durationMs).toBe(durBefore);
  });

  it("reverts fully when the gesture's first move is a clamped no-op", () => {
    const clipId = seed();
    const { result } = renderHook(() => useTimelineHistoryBatch());

    useTimelineStore.getState().moveClip(clipId, 200);
    const startBefore = useTimelineStore.getState().clips[0].startMs; // 200
    const durBefore = useTimelineStore.getState().clips[0].durationMs; // 1000
    const pastBefore = getTimelineTemporal().pastStates.length;

    // First move tries to EXTEND the start edge left past source start
    // (inPointMs already 0 → trimClip throws → store no-ops), then valid
    // shrink moves follow.
    runTrimStartGesture(result.current, clipId, [-10, 10, 10, 10]);

    expect(getTimelineTemporal().pastStates.length).toBe(pastBefore + 1);
    expect(useTimelineStore.getState().clips[0].durationMs).toBeLessThan(
      durBefore
    );

    // One undo restores the exact pre-trim clip — the preceding move survives.
    getTimelineTemporal().undo();
    expect(useTimelineStore.getState().clips[0].startMs).toBe(startBefore);
    expect(useTimelineStore.getState().clips[0].durationMs).toBe(durBefore);
  });

  it("records no undo entry when the entire gesture is a no-op", () => {
    const clipId = seed();
    const { result } = renderHook(() => useTimelineHistoryBatch());

    useTimelineStore.getState().moveClip(clipId, 200);
    const pastBefore = getTimelineTemporal().pastStates.length;

    // Every move is an invalid extend-left → all clamped no-ops.
    runTrimStartGesture(result.current, clipId, [-5, -5, -5]);

    expect(getTimelineTemporal().pastStates.length).toBe(pastBefore);
  });
});
