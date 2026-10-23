/**
 * The Premiere pointer gestures added beside the basic drag: the Slide tool,
 * Alt+drag duplicate, and selecting a gap by clicking it. Driven through the
 * real TrackLane/Clip tree against the default timeline store instance.
 */

import { screen, fireEvent } from "@testing-library/react";

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

import {
  installPointerEvent,
  makeTrack,
  makeClip,
  seedTimeline,
  renderLanes
} from "../../../../test-utils/timelineClipHarness";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

beforeAll(installPointerEvent);

/** 10 ms per px, so 30 px of pointer travel is 300 ms — clear of the 8 px
 *  snap threshold around the 1 s gridlines and the other clips' edges. */
const DRAG_PX = 30;
const DRAG_MS = DRAG_PX * 10;

const seed = () => {
  seedTimeline(
    [makeTrack("t1", 0)],
    [
      makeClip("a", "t1", 0, 2000, { inPointMs: 0, outPointMs: 2000 }),
      makeClip("b", "t1", 2000, 2000, { inPointMs: 1000, outPointMs: 3000 }),
      makeClip("c", "t1", 4000, 2000, { inPointMs: 1000, outPointMs: 3000 }),
      makeClip("d", "t1", 9000, 1000)
    ]
  );
  useTimelineStore.setState({ linkedSelection: true });
  useTimelineUIStore.setState({ selectedGap: null, snapEnabled: false });
};

// Alt+drag duplicates at pointerdown, so the modifier rides on the press too.
const dragClip = (
  clipId: string,
  fromX: number,
  toX: number,
  mods: { altKey?: boolean } = {}
) => {
  fireEvent.pointerDown(screen.getByTestId(`clip-${clipId}`), {
    button: 0,
    buttons: 1,
    clientX: fromX,
    clientY: 20,
    pointerId: 1,
    ...mods
  });
  fireEvent.pointerMove(window, {
    buttons: 1,
    clientX: toX,
    clientY: 20,
    pointerId: 1,
    ...mods
  });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: toX, clientY: 20 });
};

const span = (id: string) => {
  const c = useTimelineStore.getState().clips.find((x) => x.id === id);
  if (!c) throw new Error(`clip ${id} missing`);
  return [c.startMs, c.durationMs, c.inPointMs ?? 0];
};

beforeEach(() => {
  document.elementsFromPoint = () => [];
  seed();
});

describe("Slide tool", () => {
  it("moves the clip and trims both neighbours to follow", () => {
    useTimelineUIStore.setState({ activeTool: "slide" });
    renderLanes();
    dragClip("b", 250, 250 + DRAG_PX);
    expect(span("b")).toEqual([2000 + DRAG_MS, 2000, 1000]);
    expect(span("a")).toEqual([0, 2000 + DRAG_MS, 0]);
    expect(span("c")).toEqual([4000 + DRAG_MS, 2000 - DRAG_MS, 1000 + DRAG_MS]);
  });
});

describe("Alt+drag", () => {
  it("leaves a copy where the clip was", () => {
    renderLanes();
    dragClip("d", 950, 950 + DRAG_PX, { altKey: true });
    const clips = useTimelineStore.getState().clips;
    expect(clips).toHaveLength(5);
    expect(span("d")).toEqual([9000 + DRAG_MS, 1000, 0]);
    const copy = clips.find((c) => c.id !== "d" && c.startMs === 9000);
    expect(copy?.name).toBe("d");
  });

  it("moves without a copy when Alt is not held", () => {
    renderLanes();
    dragClip("d", 950, 950 + DRAG_PX);
    expect(useTimelineStore.getState().clips).toHaveLength(4);
  });
});

describe("gap selection", () => {
  it("selects the gap a click lands in", () => {
    renderLanes();
    const lane = screen.getByTestId("track-lane-t1");
    fireEvent.pointerDown(lane, {
      button: 0,
      buttons: 1,
      clientX: 700,
      clientY: 10,
      pointerId: 1
    });
    fireEvent.pointerUp(lane, { pointerId: 1, clientX: 700, clientY: 10 });
    expect(useTimelineUIStore.getState().selectedGap).toEqual({
      trackId: "t1",
      startMs: 6000,
      endMs: 9000
    });
    expect(screen.getByTestId("selected-gap-t1")).toBeInTheDocument();
  });
});
