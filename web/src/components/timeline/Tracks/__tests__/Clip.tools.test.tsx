/**
 * The Premiere-style pointer tools: ripple, roll, rate stretch, slip and
 * track select, driven through the real TrackLane/Clip tree.
 */

import { act, createEvent, screen, fireEvent } from "@testing-library/react";

jest.mock("../useClipThumbnails", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .clipThumbnailsMock()
);
jest.mock("../useAudioPeaks", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .audioPeaksMock()
);
jest.mock("../useAssetUrl", () => ({
  useAssetUrl: () => undefined
}));
jest.mock("../../../../stores/AssetStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .assetStoreMock()
);
jest.mock("../../../../stores/WorkflowRunsStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .workflowRunsStoreMock()
);
jest.mock("../../../../stores/ErrorStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .errorStoreMock()
);
jest.mock("../../../../stores/timeline/TimelineGenerationStore", () =>
  jest
    .requireActual("../../../../test-utils/timelineClipMocks")
    .timelineGenerationStoreMock()
);

import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  installPointerEvent,
  makeTrack,
  makeClip,
  seedTimeline,
  renderLanes,
  dragHandle
} from "../../../../test-utils/timelineClipHarness";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import type { TimelineTool } from "../../../../stores/timeline/TimelineUIStore";

beforeAll(installPointerEvent);

const DRAG_PX = 30;
const DRAG_MS = DRAG_PX * 10;

const clip = (id: string): TimelineClip => {
  const found = useTimelineStore.getState().clips.find((c) => c.id === id);
  if (!found) throw new Error(`clip ${id} missing`);
  return found;
};

const seed = (activeTool: TimelineTool) => {
  seedTimeline(
    [makeTrack("t1", 0), makeTrack("t2", 1)],
    [
      makeClip("a1", "t1", 2000, 1000, { outPointMs: 5000 }),
      makeClip("a2", "t1", 3000, 1000, { inPointMs: 1000, outPointMs: 2000 }),
      makeClip("a3", "t1", 6000, 1000),
      makeClip("b1", "t2", 2000, 1000)
    ]
  );
  useTimelineStore.setState({ linkedSelection: true });
  useTimelineUIStore.setState({
    activeTool,
    rippleMode: false,
    snapEnabled: false
  });
};

const dragBody = (clipId: string, fromX: number, toX: number, shiftKey = false) => {
  const el = screen.getByTestId(`clip-${clipId}`);
  fireEvent.pointerDown(el, {
    button: 0,
    buttons: 1,
    clientX: fromX,
    clientY: 20,
    pointerId: 1,
    shiftKey
  });
  fireEvent.pointerMove(window, { buttons: 1, clientX: toX, clientY: 20, pointerId: 1 });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: toX, clientY: 20 });
  fireEvent.click(el, { shiftKey });
};

beforeEach(() => {
  document.elementsFromPoint = () => [];
});

describe("Ripple edit tool", () => {
  it("pulls later clips along when an end edge is trimmed", () => {
    seed("ripple");
    renderLanes();
    dragHandle("a2", "end", 400, 400 - DRAG_PX);
    expect(clip("a2").durationMs).toBe(1000 - DRAG_MS);
    expect(clip("a3").startMs).toBe(6000 - DRAG_MS);
  });
});

describe("Rolling edit tool", () => {
  it("moves the cut between two neighbours without changing the sequence", () => {
    seed("roll");
    renderLanes();
    dragHandle("a1", "end", 300, 300 + DRAG_PX);
    expect(clip("a1").durationMs).toBe(1000 + DRAG_MS);
    expect(clip("a2").startMs).toBe(3000 + DRAG_MS);
    expect(clip("a2").durationMs).toBe(1000 - DRAG_MS);
    expect(clip("a3").startMs).toBe(6000);
  });
});

describe("Rate stretch tool", () => {
  it("changes the speed so the same source fills the new length", () => {
    seed("rateStretch");
    renderLanes();
    dragHandle("a3", "end", 700, 700 + DRAG_PX);
    const stretched = clip("a3");
    expect(stretched.startMs).toBe(6000);
    expect(stretched.durationMs).toBeCloseTo(1000 + DRAG_MS);
    expect(stretched.speedMultiplier).toBeCloseTo(1000 / (1000 + DRAG_MS));
  });

  it("stops at the next clip on the track", () => {
    seed("rateStretch");
    renderLanes();
    dragHandle("a1", "end", 300, 300 + DRAG_PX);
    expect(clip("a1").durationMs).toBe(1000);
    expect(clip("a1").speedMultiplier).toBeUndefined();
  });

  it("keeps the end in place when the start edge is dragged", () => {
    seed("rateStretch");
    renderLanes();
    dragHandle("a3", "start", 600, 600 - DRAG_PX);
    const stretched = clip("a3");
    expect(stretched.startMs).toBeCloseTo(6000 - DRAG_MS);
    expect(stretched.startMs + stretched.durationMs).toBeCloseTo(7000);
  });
});

describe("Slip tool", () => {
  it("drags the source window under a clip that stays put", () => {
    seed("slip");
    renderLanes();
    // Left shows later source: the picture follows the pointer.
    dragBody("a1", 250, 250 - DRAG_PX);
    const slipped = clip("a1");
    expect(slipped.startMs).toBe(2000);
    expect(slipped.durationMs).toBe(1000);
    expect(slipped.inPointMs).toBe(DRAG_MS);
    expect(slipped.outPointMs).toBe(5000 + DRAG_MS);
  });
});

describe("Track select tool", () => {
  it("selects every clip from the click point on, on all tracks", () => {
    seed("trackSelect");
    renderLanes();
    // jsdom puts the clip at x 0, so x 50 is 500 ms into a1.
    dragBody("a1", 50, 50);
    expect([...useTimelineUIStore.getState().selectedClipIds].sort()).toEqual([
      "a1",
      "a2",
      "a3",
      "b1"
    ]);
  });

  it("with Shift keeps to the clicked track", () => {
    seed("trackSelect");
    renderLanes();
    dragBody("a2", 50, 50, true);
    expect([...useTimelineUIStore.getState().selectedClipIds].sort()).toEqual([
      "a2",
      "a3"
    ]);
  });

  it("moves the selected block together", () => {
    seed("trackSelect");
    renderLanes();
    dragBody("a2", 50, 50 + DRAG_PX);
    expect(clip("a2").startMs).toBe(3000 + DRAG_MS);
    expect(clip("a3").startMs).toBe(6000 + DRAG_MS);
    expect(clip("a1").startMs).toBe(2000);
  });
});
