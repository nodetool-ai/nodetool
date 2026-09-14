/**
 * Fade handles on a clip: dragging one sets the fade's length, the shape menu
 * sets its curve, and neither can be reached on a locked clip or on media the
 * mixer never sounds. Driven through the real TrackLane/Clip tree against the
 * default timeline store, as the other gesture suites are.
 */

import { installGlobal } from "../../../../test-utils/doubles";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

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
import {
  getTimelineTemporal,
  useTimelineStore
} from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
});

const MS_PER_PX = 10;

const track: TimelineTrack = {
  id: "t1",
  name: "Audio",
  type: "audio",
  index: 0,
  visible: true,
  locked: false
};

const makeClip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
  id: "a1",
  trackId: "t1",
  name: "Voiceover",
  startMs: 0,
  durationMs: 4000,
  mediaType: "audio",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...overrides
});

const seed = (clip: TimelineClip = makeClip()) => {
  useTimelineStore.setState({ tracks: [track], clips: [clip], durationMs: 8000 });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: 0,
    activeTool: "select",
    selectedClipIds: new Set<string>(),
    rubberBand: null
  });
  useTimelinePlaybackStore.setState({ currentTimeMs: 0 });
};

const renderLanes = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <div data-timeline-lanes="true">
        <TrackLane track={track} />
      </div>
    </ThemeProvider>
  );

const clipState = (): TimelineClip => {
  const clip = useTimelineStore.getState().clips.find((c) => c.id === "a1");
  if (!clip) throw new Error("clip a1 missing");
  return clip;
};

const dragFade = (edge: "in" | "out", fromX: number, toX: number) => {
  const el = screen.getByTestId(`clip-fade-handle-${edge}-a1`);
  fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: fromX, pointerId: 1 });
  fireEvent.pointerMove(el, { buttons: 1, clientX: toX, pointerId: 1 });
  fireEvent.pointerUp(el, { pointerId: 1 });
};

beforeEach(() => {
  document.elementsFromPoint = () => [];
  seed();
});

describe("fade handles", () => {
  it("makes a fade-in from the pointer travel to the right", () => {
    renderLanes();
    dragFade("in", 0, 50);
    expect(clipState().fadeInMs).toBe(500);
  });

  it("makes a fade-out from travel to the left", () => {
    renderLanes();
    dragFade("out", 100, 70);
    expect(clipState().fadeOutMs).toBe(300);
  });

  it("continues an existing fade rather than restarting it", () => {
    seed(makeClip({ fadeInMs: 400 }));
    renderLanes();
    dragFade("in", 0, 20);
    expect(clipState().fadeInMs).toBe(600);
  });

  it("removes the fade when the handle is pushed back to the edge", () => {
    seed(makeClip({ fadeInMs: 400 }));
    renderLanes();
    dragFade("in", 100, 0);
    expect(clipState().fadeInMs).toBe(0);
  });

  it("stops one fade at what the other has left of the clip", () => {
    seed(makeClip({ fadeOutMs: 1000 }));
    renderLanes();
    dragFade("in", 0, 1000);
    expect(clipState().fadeInMs).toBe(3000);
  });

  it("records the whole drag as one undo entry", () => {
    renderLanes();
    const el = screen.getByTestId("clip-fade-handle-in-a1");
    fireEvent.pointerDown(el, { button: 0, buttons: 1, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(el, { buttons: 1, clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(el, { buttons: 1, clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });

    expect(clipState().fadeInMs).toBe(500);
    getTimelineTemporal().undo();
    expect(clipState().fadeInMs).toBeUndefined();
  });

  it("takes arrow keys on a focused handle", () => {
    seed(makeClip({ fadeInMs: 400 }));
    renderLanes();
    const el = screen.getByTestId("clip-fade-handle-in-a1");
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(clipState().fadeInMs).toBe(500);
    fireEvent.keyDown(el, { key: "ArrowLeft", shiftKey: true });
    expect(clipState().fadeInMs).toBe(490);
  });

  it("grows the out handle's fade when it is pushed left", () => {
    seed(makeClip({ fadeOutMs: 400 }));
    renderLanes();
    fireEvent.keyDown(screen.getByTestId("clip-fade-handle-out-a1"), {
      key: "ArrowLeft"
    });
    expect(clipState().fadeOutMs).toBe(500);
  });

  it("refuses a locked clip", () => {
    seed(makeClip({ locked: true }));
    renderLanes();
    dragFade("in", 0, 50);
    expect(clipState().fadeInMs).toBeUndefined();
  });

  it("shows no handles on media the mixer never sounds", () => {
    seed(makeClip({ mediaType: "text" }));
    renderLanes();
    expect(screen.queryByTestId("clip-fade-handle-in-a1")).toBeNull();
  });
});

describe("the fade shape menu", () => {
  it("sets the curve of the edge it was opened on", () => {
    seed(makeClip({ fadeInMs: 500, fadeOutMs: 500 }));
    renderLanes();
    fireEvent.contextMenu(screen.getByTestId("clip-fade-handle-out-a1"));
    fireEvent.click(screen.getByText("+3 dB"));

    expect(clipState().fadeOutShape).toBe("plus3dB");
    expect(clipState().fadeInShape).toBeUndefined();
  });
});
