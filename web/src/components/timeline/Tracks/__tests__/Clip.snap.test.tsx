/**
 * Snap feedback during clip gestures: a dragged clip's edges lock onto
 * neighbouring clip edges, Alt disables it, trim handles snap the moving edge,
 * and the snap guide / gesture readout in the UI store follow the gesture and
 * clear on pointerup.
 */

jest.mock("../useClipThumbnails", () => ({
  useClipThumbnails: () => null
}));
jest.mock("../useAudioPeaks", () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
}));
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(sel: (s: { get: () => Promise<null> }) => T) =>
    sel({ get: () => Promise.resolve(null) })
}));
jest.mock("../../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: <T,>(sel: (s: { focusedJob: Record<string, string> }) => T) =>
    sel({ focusedJob: {} })
}));
jest.mock("../../../../stores/ErrorStore", () => ({
  __esModule: true,
  default: <T,>(sel: (s: { errors: Record<string, unknown> }) => T) =>
    sel({ errors: {} }),
  hasNodeError: () => false,
  nodeErrorToDisplayString: () => ""
}));
jest.mock("../../../../stores/timeline/TimelineGenerationStore", () => ({
  useTimelineGenerationStore: <T,>(
    sel: (s: { clipJobs: Record<string, unknown> }) => T
  ) => sel({ clipJobs: {} })
}));

import {
  installPointerEvent,
  makeTrack,
  makeClip,
  seedTimeline,
  renderLanes,
  clipState,
  dragClip,
  dragHandle,
  pressClip,
  moveClipPointer,
  releaseClipPointer,
  pressHandle,
  moveHandle,
  releaseHandle
} from "../../../../test-utils/timelineClipHarness";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

beforeAll(installPointerEvent);

// a1 2000–3000, a4 4200–5200, a3 8500–9500 on one track; a gridline sits on
// every whole second, so the neighbours' edges are deliberately off-grid. a4
// starts 2 s into its source so its start edge has room to grow leftwards.
beforeEach(() => {
  seedTimeline(
    [makeTrack("t1", 0), makeTrack("t2", 1)],
    [
      makeClip("a1", "t1", 2000, 1000),
      makeClip("a4", "t1", 4200, 1000, { inPointMs: 2000 }),
      makeClip("a3", "t1", 8500, 1000),
      makeClip("b1", "t2", 2000, 1000)
    ]
  );
});

const ui = () => useTimelineUIStore.getState();

describe("drag snapping", () => {
  it("snaps the start edge onto a neighbour's end and shows the guide", () => {
    renderLanes();
    // 755 px = 7550 ms: raw start 9550, 50 ms (5 px) past a3's end at 9500.
    pressClip("a1", 100);
    moveClipPointer(100 + 755);
    expect(clipState("a1").startMs).toBe(9500);
    expect(ui().snapGuideMs).toBe(9500);
    releaseClipPointer();
  });

  it("snaps the end edge when it is the closer hit", () => {
    renderLanes();
    // raw start 3150 → end 4150, 50 ms short of a4's start at 4200; the start
    // edge is 150 ms from the 3000 gridline, outside the 80 ms threshold.
    pressClip("a1", 100);
    moveClipPointer(100 + 115);
    expect(clipState("a1").startMs).toBe(3200);
    expect(ui().snapGuideMs).toBe(4200);
    releaseClipPointer();
  });

  it("does not snap while Alt is held", () => {
    renderLanes();
    pressClip("a1", 100);
    moveClipPointer(100 + 755, { altKey: true });
    expect(clipState("a1").startMs).toBe(9550);
    expect(ui().snapGuideMs).toBeNull();
    releaseClipPointer();
  });

  it("clears the guide and the readout on pointerup", () => {
    renderLanes();
    dragClip("a1", 100, 100 + 755);
    expect(clipState("a1").startMs).toBe(9500);
    expect(ui().snapGuideMs).toBeNull();
    expect(ui().gestureReadout).toBeNull();
  });
});

describe("gesture readout", () => {
  it("publishes the live geometry of a moving clip", () => {
    renderLanes();
    pressClip("a1", 100);
    moveClipPointer(130);
    expect(ui().gestureReadout).toEqual({
      clipId: "a1",
      kind: "move",
      startMs: 2300,
      durationMs: 1000,
      inPointMs: 0
    });
    moveClipPointer(150);
    expect(ui().gestureReadout?.startMs).toBe(2500);
    releaseClipPointer();
  });

  it("publishes trim-end geometry and clears it on release", () => {
    renderLanes();
    const el = pressHandle("a1", "end", 200);
    moveHandle(el, 230);
    expect(ui().gestureReadout).toEqual({
      clipId: "a1",
      kind: "trim-end",
      startMs: 2000,
      durationMs: 1300,
      inPointMs: 0
    });
    releaseHandle(el);
    expect(ui().gestureReadout).toBeNull();
    expect(ui().snapGuideMs).toBeNull();
  });
});

describe("trim snapping", () => {
  it("trim-end snaps the end edge onto a neighbour's start", () => {
    renderLanes();
    // raw end 3000 + 1150 = 4150, 50 ms short of a4's start.
    const el = pressHandle("a1", "end", 200);
    moveHandle(el, 200 + 115);
    expect(clipState("a1")).toEqual({ trackId: "t1", startMs: 2000, durationMs: 2200 });
    expect(ui().snapGuideMs).toBe(4200);
    releaseHandle(el);
  });

  it("trim-end does not snap while Alt is held", () => {
    renderLanes();
    dragHandle("a1", "end", 200, 200 + 115, { altKey: true });
    expect(clipState("a1").durationMs).toBe(2150);
  });

  it("trim-start snaps the start edge onto a neighbour's end", () => {
    renderLanes();
    // a4's start edge dragged left: raw 4200 - 1150 = 3050, 50 ms past a1's
    // end at 3000 (the 3000 gridline coincides with it).
    dragHandle("a4", "start", 300, 300 - 115);
    expect(clipState("a4")).toEqual({ trackId: "t1", startMs: 3000, durationMs: 2200 });
  });

  it("targets the edge from the pointer, not from the last snapped position", () => {
    renderLanes();
    // Snap onto 4200, then keep dragging: the edge must leave the snap and
    // land where the pointer says (4500 → gridline-free at 4550).
    const el = pressHandle("a1", "end", 200);
    moveHandle(el, 200 + 115);
    expect(clipState("a1").durationMs).toBe(2200);
    moveHandle(el, 200 + 155);
    expect(clipState("a1").durationMs).toBe(2550);
    expect(ui().snapGuideMs).toBeNull();
    releaseHandle(el);
  });
});
