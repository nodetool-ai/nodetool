/**
 * TrackLane / Clip coordinate-math tests.
 *
 * The lanes render INSIDE the natively scrolling container (TracksRegion's
 * overflowX: auto panel whose content width is the full timeline width), so
 * lane-local pixel coordinates are already content-space. These tests pin
 * that invariant: a non-zero UI-store scrollLeftPx must NOT shift clip
 * positions or px→ms conversions (seek, rubber-band).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// Polyfill PointerEvent for jsdom (which doesn't support it natively).
// PointerEvent extends MouseEvent so clientX/clientY/button work correctly.
if (typeof window !== "undefined" && !window.PointerEvent) {
  (window as unknown as Record<string, unknown>).PointerEvent =
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
    };
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
  useAssetStore: (sel: (s: { get: () => Promise<null> }) => unknown) =>
    sel({ get: () => Promise.resolve(null) })
}));
jest.mock("../../../stores/WorkflowRunsStore", () => ({
  __esModule: true,
  default: (sel: (s: { focusedJob: Record<string, string> }) => unknown) =>
    sel({ focusedJob: {} })
}));
jest.mock("../../../stores/ErrorStore", () => ({
  __esModule: true,
  default: (sel: (s: { errors: Record<string, unknown> }) => unknown) =>
    sel({ errors: {} }),
  hasNodeError: () => false,
  nodeErrorToDisplayString: () => ""
}));
jest.mock("../../../stores/timeline/TimelineGenerationStore", () => ({
  useTimelineGenerationStore: (
    sel: (s: { clipJobs: Record<string, unknown> }) => unknown
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

const track: TimelineTrack = {
  id: "t1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

const makeClip = (
  id: string,
  startMs: number,
  durationMs: number
): TimelineClip => ({
  id,
  trackId: track.id,
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
const SCROLL_LEFT_PX = 300;

const renderLane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TrackLane track={track} />
    </ThemeProvider>
  );

beforeEach(() => {
  useTimelineStore.setState({
    tracks: [track],
    clips: [makeClip("c1", 2000, 1000), makeClip("c2", 3000, 1000)],
    durationMs: 10_000
  });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: SCROLL_LEFT_PX,
    selectedClipIds: new Set<string>()
  });
  useTimelinePlaybackStore.setState({ currentTimeMs: 0 });
});

describe("TrackLane content-space coordinate math", () => {
  it("positions clips at startMs / msPerPx regardless of scrollLeftPx", () => {
    renderLane();
    // 2000 ms / 10 ms-per-px = 200 px. A double-counted scroll offset would
    // yield 200 - 300 = -100 px.
    expect(screen.getByTestId("clip-c1").style.left).toBe("200px");
    expect(screen.getByTestId("clip-c2").style.left).toBe("300px");
  });

  it("seeks using lane-local x without adding scrollLeftPx", () => {
    renderLane();
    const lane = screen.getByTestId("track-lane-t1");
    // jsdom rects are all-zero, so clientX === lane-local x.
    fireEvent.pointerDown(lane, { button: 0, clientX: 120, pointerId: 1 });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(
      120 * MS_PER_PX
    );
  });

  it("rubber-band selects clips by content-space range", () => {
    renderLane();
    const lane = screen.getByTestId("track-lane-t1");
    // Band from x=150 (1500 ms) to x=250 (2500 ms) → only c1 (2000–3000 ms).
    fireEvent.pointerDown(lane, { button: 0, clientX: 150, pointerId: 1 });
    fireEvent.pointerMove(lane, { buttons: 1, clientX: 250, pointerId: 1 });
    const selected = useTimelineUIStore.getState().selectedClipIds;
    expect([...selected]).toEqual(["c1"]);
  });

  it("shift+rubber-band unions the band with the prior selection", () => {
    useTimelineUIStore.setState({ selectedClipIds: new Set(["c2"]) });
    renderLane();
    const lane = screen.getByTestId("track-lane-t1");
    fireEvent.pointerDown(lane, {
      button: 0,
      clientX: 150,
      pointerId: 1,
      shiftKey: true
    });
    fireEvent.pointerMove(lane, {
      buttons: 1,
      clientX: 250,
      pointerId: 1,
      shiftKey: true
    });
    const selected = useTimelineUIStore.getState().selectedClipIds;
    expect(selected.has("c1")).toBe(true);
    expect(selected.has("c2")).toBe(true);
    expect(selected.size).toBe(2);
  });

  it("clears the rubber band on pointercancel", () => {
    renderLane();
    const lane = screen.getByTestId("track-lane-t1");
    fireEvent.pointerDown(lane, { button: 0, clientX: 150, pointerId: 1 });
    fireEvent.pointerMove(lane, { buttons: 1, clientX: 250, pointerId: 1 });
    fireEvent.pointerCancel(lane, { pointerId: 1 });
    // Further moves must not extend a stale band selection.
    fireEvent.pointerMove(lane, { buttons: 1, clientX: 450, pointerId: 1 });
    const selected = useTimelineUIStore.getState().selectedClipIds;
    expect([...selected]).toEqual(["c1"]);
  });
});
