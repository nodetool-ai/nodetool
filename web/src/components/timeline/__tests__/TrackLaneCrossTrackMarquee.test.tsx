/**
 * Cross-track rubber-band selection.
 *
 * A marquee started on one lane selects clips on every lane it covers, not
 * only the lane the gesture began on. The band is measured in the coordinate
 * space of the lanes container, so these tests stub the lane rects that jsdom
 * reports as all-zero.
 */

import { installGlobal } from "../../../test-utils/doubles";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Polyfill PointerEvent for jsdom (which doesn't support it natively).
if (typeof window !== "undefined" && !window.PointerEvent) {
  installGlobal(
    "PointerEvent",
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      readonly isPrimary: boolean;

      constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? "";
        this.isPrimary = params.isPrimary ?? false;
      }
    });
}

// ── Heavy media hooks → no-op mocks ─────────────────────────────────────────

jest.mock("../Tracks/useClipThumbnails", () => ({
  useClipThumbnails: () => null
}));
jest.mock("../Tracks/useAudioPeaks", () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
}));

// ── Stores that pull in network/api dependencies → light mocks ─────────────

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(sel: (s: { get: () => Promise<null> }) => T) =>
    sel({ get: () => Promise.resolve(null) })
}));
jest.mock("../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: <T,>(sel: (s: { focusedJob: Record<string, string> }) => T) =>
    sel({ focusedJob: {} })
}));
jest.mock("../../../stores/ErrorStore", () => ({
  __esModule: true,
  default: <T,>(sel: (s: { errors: Record<string, unknown> }) => T) =>
    sel({ errors: {} }),
  hasNodeError: () => false,
  nodeErrorToDisplayString: () => ""
}));
jest.mock("../../../stores/timeline/TimelineGenerationStore", () => ({
  useTimelineGenerationStore: <T,>(
    sel: (s: { clipJobs: Record<string, unknown> }) => T
  ) => sel({ clipJobs: {} })
}));

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { TrackLane } from "../Tracks/TrackLane";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";

// jsdom does not implement pointer capture.
beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

const trackA: TimelineTrack = {
  id: "t1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

const trackB: TimelineTrack = {
  id: "t2",
  name: "Video 2",
  type: "video",
  index: 1,
  visible: true,
  locked: false
};

const makeClip = (
  id: string,
  trackId: string,
  startMs: number,
  durationMs: number
): TimelineClip => ({
  id,
  trackId,
  name: id,
  startMs,
  durationMs,
  mediaType: "video",
  sourceType: "imported",
  status: "draft",
  locked: false,
  versions: []
});

const MS_PER_PX = 10;
const LANE_HEIGHT_PX = 64;

/** Give an element a fixed rect — jsdom reports every rect as all-zero. */
const stubRect = (el: HTMLElement, top: number, bottom: number) => {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: top,
      left: 0,
      right: 1000,
      top,
      bottom,
      width: 1000,
      height: bottom - top,
      toJSON: () => ({})
    }) as DOMRect;
};

/** Two stacked lanes inside a lanes container, with realistic rects. */
const renderLanes = () => {
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <div data-timeline-lanes="true">
        <TrackLane track={trackA} />
        <TrackLane track={trackB} />
      </div>
    </ThemeProvider>
  );
  const laneA = screen.getByTestId("track-lane-t1");
  const laneB = screen.getByTestId("track-lane-t2");
  const container = laneA.parentElement as HTMLElement;
  stubRect(container, 0, LANE_HEIGHT_PX * 2);
  stubRect(laneA, 0, LANE_HEIGHT_PX);
  stubRect(laneB, LANE_HEIGHT_PX, LANE_HEIGHT_PX * 2);
  return { ...view, laneA, laneB };
};

beforeEach(() => {
  useTimelineStore.setState({
    tracks: [trackA, trackB],
    clips: [
      makeClip("a1", trackA.id, 2000, 1000),
      makeClip("a2", trackA.id, 6000, 1000),
      makeClip("b1", trackB.id, 2000, 1000),
      makeClip("b2", trackB.id, 6000, 1000)
    ],
    durationMs: 10_000
  });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: 0,
    selectedClipIds: new Set<string>(),
    rubberBand: null
  });
  useTimelinePlaybackStore.setState({ currentTimeMs: 0 });
});

describe("rubber-band selection across tracks", () => {
  it("selects clips on every lane the band covers", () => {
    const { laneA } = renderLanes();
    // Band x 150→250 (1500–2500 ms), y 10→100: covers both lanes.
    fireEvent.pointerDown(laneA, {
      button: 0,
      clientX: 150,
      clientY: 10,
      pointerId: 1
    });
    fireEvent.pointerMove(laneA, {
      buttons: 1,
      clientX: 250,
      clientY: 100,
      pointerId: 1
    });
    const selected = useTimelineUIStore.getState().selectedClipIds;
    expect([...selected].sort()).toEqual(["a1", "b1"]);
  });

  it("leaves other lanes alone when the band stays inside one", () => {
    const { laneA } = renderLanes();
    // Same time range, but y 10→30 never leaves lane A.
    fireEvent.pointerDown(laneA, {
      button: 0,
      clientX: 150,
      clientY: 10,
      pointerId: 1
    });
    fireEvent.pointerMove(laneA, {
      buttons: 1,
      clientX: 250,
      clientY: 30,
      pointerId: 1
    });
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual(["a1"]);
  });

  it("selects upwards when the band is dragged from a lower lane", () => {
    const { laneB } = renderLanes();
    fireEvent.pointerDown(laneB, {
      button: 0,
      clientX: 250,
      clientY: 100,
      pointerId: 1
    });
    fireEvent.pointerMove(laneB, {
      buttons: 1,
      clientX: 150,
      clientY: 10,
      pointerId: 1
    });
    const selected = useTimelineUIStore.getState().selectedClipIds;
    expect([...selected].sort()).toEqual(["a1", "b1"]);
  });

  it("publishes the band rect in lanes-content space", () => {
    const { laneA } = renderLanes();
    fireEvent.pointerDown(laneA, {
      button: 0,
      clientX: 150,
      clientY: 10,
      pointerId: 1
    });
    fireEvent.pointerMove(laneA, {
      buttons: 1,
      clientX: 250,
      clientY: 100,
      pointerId: 1
    });
    expect(useTimelineUIStore.getState().rubberBand).toEqual({
      left: 150,
      top: 10,
      width: 100,
      height: 90
    });
    fireEvent.pointerUp(laneA, { pointerId: 1 });
    expect(useTimelineUIStore.getState().rubberBand).toBeNull();
  });

  it("shift+band unions the cross-track hits with the prior selection", () => {
    useTimelineUIStore.setState({ selectedClipIds: new Set(["b2"]) });
    const { laneA } = renderLanes();
    fireEvent.pointerDown(laneA, {
      button: 0,
      clientX: 150,
      clientY: 10,
      pointerId: 1,
      shiftKey: true
    });
    fireEvent.pointerMove(laneA, {
      buttons: 1,
      clientX: 250,
      clientY: 100,
      pointerId: 1,
      shiftKey: true
    });
    const selected = useTimelineUIStore.getState().selectedClipIds;
    expect([...selected].sort()).toEqual(["a1", "b1", "b2"]);
  });
});
