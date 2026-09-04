/**
 * Clip pointer gestures: drag, trim-start, trim-end, lock refusal, and
 * multi-selection drags — driven through the real TrackLane/Clip tree against
 * the default timeline store instance.
 *
 * Drag moves arrive through window listeners (the clip may re-parent into
 * another lane mid-gesture), so pointermove fires on `window`; trim moves are
 * React handlers on the handle itself.
 */

import { installGlobal } from "../../../../test-utils/doubles";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

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
    }
  );
}

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

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { TrackLane } from "../TrackLane";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

// jsdom does not implement pointer capture.
beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

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

const clipState = (id: string) => {
  const clip = useTimelineStore.getState().clips.find((c) => c.id === id);
  if (!clip) {
    throw new Error(`clip ${id} missing`);
  }
  return { trackId: clip.trackId, startMs: clip.startMs, durationMs: clip.durationMs };
};

const seed = ({ lockTrackB = false } = {}) => {
  useTimelineStore.setState({
    tracks: [makeTrack("t1", 0), makeTrack("t2", 1, lockTrackB)],
    clips: [
      makeClip("a1", "t1", 2000, 1000),
      makeClip("a2", "t1", 6000, 1000, true),
      makeClip("a3", "t1", 8500, 1000),
      makeClip("b1", "t2", 2000, 1000)
    ],
    durationMs: 12_000
  });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: 0,
    activeTool: "select",
    selectedClipIds: new Set<string>(),
    rubberBand: null
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

const dragClip = (clipId: string, fromX: number, toX: number) => {
  const el = screen.getByTestId(`clip-${clipId}`);
  fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: fromX, clientY: 20, pointerId: 1 });
  fireEvent.pointerMove(window, { buttons: 1, clientX: toX, clientY: 20, pointerId: 1 });
  fireEvent.pointerUp(window, { pointerId: 1 });
};

const dragHandle = (
  clipId: string,
  edge: "start" | "end",
  fromX: number,
  toX: number
) => {
  const el = screen.getByTestId(`clip-trim-${edge}-${clipId}`);
  fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: fromX, pointerId: 1 });
  fireEvent.pointerMove(el, { buttons: 1, clientX: toX, pointerId: 1 });
  fireEvent.pointerUp(el, { pointerId: 1 });
};

beforeEach(() => {
  seed();
});

describe("Clip drag", () => {
  it("moves startMs by the pointer travel", () => {
    renderLanes();
    dragClip("a1", 100, 100 + DRAG_PX);
    expect(clipState("a1")).toEqual({ trackId: "t1", startMs: 2000 + DRAG_MS, durationMs: 1000 });
  });

  it("ignores travel below the drag threshold", () => {
    renderLanes();
    dragClip("a1", 100, 102);
    expect(clipState("a1").startMs).toBe(2000);
  });

  it("keeps the relative offset of two selected clips", () => {
    useTimelineUIStore.setState({ selectedClipIds: new Set(["a1", "a3"]) });
    renderLanes();
    dragClip("a1", 100, 100 + DRAG_PX);
    expect(clipState("a1").startMs).toBe(2000 + DRAG_MS);
    expect(clipState("a3").startMs).toBe(8500 + DRAG_MS);
    expect(clipState("a3").startMs - clipState("a1").startMs).toBe(6500);
  });
});

describe("Clip drag across tracks", () => {
  let rafSpy: jest.SpyInstance;
  beforeEach(() => {
    // The hit test is coalesced to one sample per frame; run it synchronously
    // so the first pointermove already sees the lane under the pointer.
    rafSpy = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 1;
      });
  });
  afterEach(() => {
    rafSpy.mockRestore();
    // jsdom lacks elementsFromPoint; drop the stub so other suites see none.
    Reflect.deleteProperty(document, "elementsFromPoint");
  });

  const pointerOverLane = (trackId: string) => {
    const lane = screen.getByTestId(`track-lane-${trackId}`);
    document.elementsFromPoint = () => [lane];
  };

  it("re-parents a single clip into the lane under the pointer", () => {
    renderLanes();
    pointerOverLane("t2");
    dragClip("a1", 100, 100 + DRAG_PX);
    expect(clipState("a1")).toEqual({ trackId: "t2", startMs: 2000 + DRAG_MS, durationMs: 1000 });
  });

  it("moves only the primary clip of a multi-selection to the new lane", () => {
    useTimelineUIStore.setState({ selectedClipIds: new Set(["a1", "a3"]) });
    renderLanes();
    pointerOverLane("t2");
    dragClip("a1", 100, 100 + DRAG_PX);
    expect(clipState("a1")).toEqual({ trackId: "t2", startMs: 2000 + DRAG_MS, durationMs: 1000 });
    expect(clipState("a3")).toEqual({ trackId: "t1", startMs: 8500 + DRAG_MS, durationMs: 1000 });
  });

  it("refuses a locked target lane and keeps moving on the source lane", () => {
    seed({ lockTrackB: true });
    renderLanes();
    pointerOverLane("t2");
    dragClip("a1", 100, 100 + DRAG_PX);
    expect(clipState("a1")).toEqual({ trackId: "t1", startMs: 2000 + DRAG_MS, durationMs: 1000 });
  });
});

describe("Clip trim", () => {
  it("trim-end changes durationMs only", () => {
    renderLanes();
    dragHandle("a1", "end", 200, 200 + DRAG_PX);
    expect(clipState("a1")).toEqual({ trackId: "t1", startMs: 2000, durationMs: 1000 + DRAG_MS });
  });

  it("trim-start moves startMs and shrinks durationMs together", () => {
    renderLanes();
    dragHandle("a1", "start", 100, 100 + DRAG_PX);
    expect(clipState("a1")).toEqual({ trackId: "t1", startMs: 2000 + DRAG_MS, durationMs: 1000 - DRAG_MS });
  });
});

describe("Clip lock", () => {
  it("a clip on a locked track neither moves nor trims", () => {
    seed({ lockTrackB: true });
    renderLanes();
    const before = clipState("b1");
    dragClip("b1", 100, 100 + DRAG_PX);
    dragHandle("b1", "start", 100, 100 + DRAG_PX);
    dragHandle("b1", "end", 200, 200 + DRAG_PX);
    expect(clipState("b1")).toEqual(before);
  });

  it("a locked clip neither moves nor trims", () => {
    renderLanes();
    const before = clipState("a2");
    dragClip("a2", 100, 100 + DRAG_PX);
    dragHandle("a2", "start", 100, 100 + DRAG_PX);
    dragHandle("a2", "end", 200, 200 + DRAG_PX);
    expect(clipState("a2")).toEqual(before);
  });

  it("the cut tool refuses to split a clip on a locked track", () => {
    seed({ lockTrackB: true });
    useTimelineUIStore.setState({ activeTool: "cut" });
    renderLanes();
    const el = screen.getByTestId("clip-b1");
    el.getBoundingClientRect = () =>
      ({ left: 200, right: 300, top: 0, bottom: 64, width: 100, height: 64, x: 200, y: 0, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: 250, pointerId: 1 });
    });
    expect(useTimelineStore.getState().clips.filter((c) => c.trackId === "t2")).toHaveLength(1);
  });
});
