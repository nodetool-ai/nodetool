import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  createTimelineInstance,
  TimelineProvider,
  useTimelineStore
} from "../../../../stores/timeline/TimelineInstance";
import {
  timelineTemporalOf,
  type TimelineStoreApi
} from "../../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../../stores/timeline/useTimelineHistoryBatch";
import {
  ReframeFocusOverlay,
  reframeViewportPointToSource,
  sourcePointToReframeViewport
} from "../ReframeFocusOverlay";

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.pointerId = props.pointerId ?? 0;
  }
}
// @ts-expect-error — augmenting the jsdom global for pointer gesture tests.
window.PointerEvent = FakePointerEvent;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;

const CLIP_ID = "clip-reframe";
const DEFAULT_GEOMETRY = {
  crop: { left: 0, right: 0, top: 0, bottom: 0 },
  sourceWidth: 200,
  sourceHeight: 100,
  sequenceWidth: 200,
  sequenceHeight: 100
} as const;

const Harness = () => {
  const addKeyframe = useTimelineStore((state) => state.addClipReframeKeyframe);
  const history = useTimelineHistoryBatch();
  return (
    <ReframeFocusOverlay
      x={0.5}
      y={0.5}
      {...DEFAULT_GEOMETRY}
      frameWidth={200}
      frameHeight={100}
      onChange={(x, y) => {
        addKeyframe(CLIP_ID, 500, x, y, 1);
        history.mark();
      }}
      onDragStart={history.begin}
      onDragEnd={history.end}
    />
  );
};

function renderHarness(): TimelineStoreApi {
  const instance = createTimelineInstance();
  instance.doc.setState({
    clips: [
      makeClip({
        id: CLIP_ID,
        trackId: "video-track",
        name: "Speaker",
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 2000,
        reframe: { mode: "auto" }
      })
    ]
  });
  timelineTemporalOf(instance.doc).clear();
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <Harness />
      </TimelineProvider>
    </ThemeProvider>
  );
  const overlay = screen.getByRole("slider", { name: "Reframe focus point" });
  jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  return instance.doc;
}

describe("ReframeFocusOverlay", () => {
  it("authors focus with the keyboard", () => {
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ReframeFocusOverlay
          x={0.5}
          y={0.5}
          {...DEFAULT_GEOMETRY}
          frameWidth={200}
          frameHeight={100}
          onChange={onChange}
        />
      </ThemeProvider>
    );

    fireEvent.keyDown(
      screen.getByRole("slider", { name: "Reframe focus point" }),
      { key: "ArrowRight" }
    );
    expect(onChange).toHaveBeenCalledWith(0.51, 0.5);
  });

  it("turns a viewer drag into one undoable framing correction", () => {
    const store = renderHarness();
    const overlay = screen.getByRole("slider", { name: "Reframe focus point" });

    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 140, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(overlay, { clientX: 160, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(overlay, { clientX: 160, clientY: 30, pointerId: 1 });

    expect(store.getState().clips[0]?.reframe?.keyframes).toEqual([
      { sourceMs: 500, x: 0.8, y: 0.3, zoom: 1 }
    ]);
    expect(timelineTemporalOf(store).pastStates).toHaveLength(1);

    timelineTemporalOf(store).undo();
    expect(store.getState().clips[0]?.reframe?.keyframes).toBeUndefined();
  });

  it("maps the displayed crop back into source coordinates", () => {
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ReframeFocusOverlay
          x={0.8}
          y={0.5}
          crop={{ left: 0.64, right: 0.04, top: 0, bottom: 0 }}
          sourceWidth={1920}
          sourceHeight={1080}
          sequenceWidth={1080}
          sequenceHeight={1920}
          frameWidth={100}
          frameHeight={200}
          onChange={onChange}
        />
      </ThemeProvider>
    );
    const overlay = screen.getByRole("slider", {
      name: "Reframe focus point"
    });
    jest.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 200,
      right: 100,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    expect(
      Number(overlay.querySelector("circle")?.getAttribute("cx"))
    ).toBeCloseTo(50);
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 100, pointerId: 2 });
    const [sourceX, sourceY] = onChange.mock.calls[0] as [number, number];
    expect(sourceX).toBeCloseTo(0.8);
    expect(sourceY).toBeCloseTo(0.5);
  });

  it("round-trips source coordinates through clip placement", () => {
    const geometry = {
      crop: { left: 0.1, right: 0.2, top: 0.15, bottom: 0.05 },
      transform: {
        position: { x: 48, y: -32 },
        scale: { x: 0.85, y: 1.1 },
        rotation: 0.3,
        anchor: { x: 0.35, y: 0.6 }
      },
      sourceWidth: 1920,
      sourceHeight: 1080,
      sequenceWidth: 1080,
      sequenceHeight: 1920,
      frameWidth: 360,
      frameHeight: 640
    };
    const displayed = sourcePointToReframeViewport(0.63, 0.42, geometry);
    const source = reframeViewportPointToSource(
      displayed.x,
      displayed.y,
      geometry
    );

    expect(source.x).toBeCloseTo(0.63);
    expect(source.y).toBeCloseTo(0.42);
  });
});
