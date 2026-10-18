/**
 * The Premiere pointer gestures added beside the basic drag: the Slide tool,
 * Alt+drag duplicate, and selecting a gap by clicking it. Driven through the
 * real TrackLane/Clip tree against the default timeline store instance.
 */

import { installPointerEvent } from "../../../../test-utils/pointerEvent";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

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

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { TrackLane } from "../TrackLane";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

beforeAll(installPointerEvent);

const makeTrack = (
  id: string,
  index: number,
  locked = false
): TimelineTrack => ({
  id,
  name: `Video ${index + 1}`,
  type: "video",
  index,
  visible: true,
  locked
});

const makeClip = (
  id: string,
  trackId: string,
  startMs: number,
  durationMs: number,
  locked = false
): TimelineClip => ({
  id,
  trackId,
  name: id,
  startMs,
  durationMs,
  mediaType: "video",
  sourceType: "imported",
  status: "draft",
  locked,
  versions: []
});

/** 10 ms per px, so 30 px of pointer travel is 300 ms — clear of the 8 px
 *  snap threshold around the 1 s gridlines and the other clips' edges. */
const MS_PER_PX = 10;
const DRAG_PX = 30;
const DRAG_MS = DRAG_PX * MS_PER_PX;

const seed = () => {
  useTimelineStore.setState({
    tracks: [makeTrack("t1", 0)],
    clips: [
      { ...makeClip("a", "t1", 0, 2000), inPointMs: 0, outPointMs: 2000 },
      { ...makeClip("b", "t1", 2000, 2000), inPointMs: 1000, outPointMs: 3000 },
      { ...makeClip("c", "t1", 4000, 2000), inPointMs: 1000, outPointMs: 3000 },
      makeClip("d", "t1", 9000, 1000)
    ],
    durationMs: 12_000,
    linkedSelection: true
  });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: 0,
    activeTool: "select",
    selectedClipIds: new Set<string>(),
    selectedGap: null,
    rubberBand: null,
    snapEnabled: false
  });
  useTimelinePlaybackStore.setState({ currentTimeMs: 0 });
};

const renderLanes = () => {
  const { tracks } = useTimelineStore.getState();
  render(
    <ThemeProvider theme={mockTheme}>
      <div data-timeline-lanes="true">
        {tracks.map((t) => (
          <TrackLane key={t.id} track={t} />
        ))}
      </div>
    </ThemeProvider>
  );
};

const dragClip = (
  clipId: string,
  fromX: number,
  toX: number,
  mods: { altKey?: boolean } = {}
) => {
  const el = screen.getByTestId(`clip-${clipId}`);
  fireEvent.pointerDown(el, {
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
