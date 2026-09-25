import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import { installGlobal } from "../../../../test-utils/doubles";
import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TracksRegion } from "../TracksRegion";

if (typeof window !== "undefined" && !window.PointerEvent) {
  installGlobal(
    "PointerEvent",
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;

      constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
      }
    }
  );
}

jest.mock("../Clip", () => ({
  Clip: ({ clipId }: { clipId: string }) => (
    <div data-testid={`clip-${clipId}`} data-timeline-clip-id={clipId} />
  )
}));

it("changes time and track scale with independent zoom sliders", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  act(() => {
    useTimelineStore.setState({
      tracks: [makeTrack({ id: "zoom-track", name: "Zoom track" })]
    });
  });

  const lanes = screen.getByTestId("tracks-scroll-area").querySelector<HTMLElement>(
    "[data-timeline-lanes]"
  );
  expect(lanes).toHaveStyle({ height: "64px" });
  const viewButton = screen.getByRole("button", { name: "Timeline view" });
  expect(screen.getByTestId("timeline-toolbar").lastElementChild).toBe(
    viewButton
  );
  expect(screen.queryByRole("slider", { name: "Horizontal zoom" })).toBeNull();
  fireEvent.click(viewButton);
  expect(viewButton).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("dialog", { name: "Timeline view" })).toBeInTheDocument();
  const horizontal = screen.getByRole("slider", { name: "Horizontal zoom" });
  const vertical = screen.getByRole("slider", { name: "Vertical zoom" });
  fireEvent.keyDown(horizontal, { key: "ArrowRight" });
  expect(useTimelineUIStore.getState().msPerPx).toBeLessThan(10);
  fireEvent.keyDown(vertical, { key: "ArrowRight" });
  expect(useTimelineUIStore.getState().verticalZoom).toBeCloseTo(1.05);
  expect(lanes).toHaveStyle({ height: "67.2px" });
  expect(useTimelineStore.getState().tracks[0].heightPx).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Increase track height" }));
  expect(useTimelineUIStore.getState().verticalZoom).toBeCloseTo(1.15);
});

it("windows sparse Serein-style tracks as the timeline scrolls", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  const track = makeTrack({ id: "sparse-track", name: "Sparse track" });
  act(() => {
    useTimelineStore.setState({
      tracks: [track],
      clips: Array.from({ length: 10 }, (_, index) =>
        makeClip({
          id: `sparse-${index}`,
          trackId: track.id,
          startMs: index * 1000,
          durationMs: 500
        })
      )
    });
    useTimelineUIStore.getState().setLanesViewportWidthPx(500);
    useTimelineUIStore.getState().setZoom(10);
  });
  expect(screen.getByTestId("clip-sparse-0")).toBeInTheDocument();
  expect(screen.queryByTestId("clip-sparse-9")).not.toBeInTheDocument();

  const scrollArea = screen.getByTestId("tracks-scroll-area");
  act(() => {
    scrollArea.scrollLeft = 700;
    fireEvent.scroll(scrollArea);
  });
  expect(screen.queryByTestId("clip-sparse-0")).not.toBeInTheDocument();
  expect(screen.getByTestId("clip-sparse-9")).toBeInTheDocument();
});

it("mounts only nearby clips, retains spanning clips, and pins the active gesture", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

  const track = makeTrack({ id: "dense-track", name: "Dense track" });
  const clips = Array.from({ length: 300 }, (_, index) =>
    makeClip({
      id: `dense-${index}`,
      trackId: track.id,
      startMs: index * 1000,
      durationMs: 500
    })
  );
  clips.push(
    makeClip({
      id: "long-clip",
      trackId: track.id,
      startMs: 0,
      durationMs: 300_000
    })
  );
  act(() => {
    useTimelineStore.setState({ tracks: [track], clips });
    useTimelineUIStore.getState().setLanesViewportWidthPx(500);
    useTimelineUIStore.getState().setZoom(10);
  });

  const scrollArea = screen.getByTestId("tracks-scroll-area");
  expect(scrollArea.querySelectorAll("[data-timeline-clip-id]").length).toBeLessThan(20);
  expect(screen.getByTestId("clip-dense-0")).toBeInTheDocument();
  expect(screen.getByTestId("clip-long-clip")).toBeInTheDocument();
  expect(screen.queryByTestId("clip-dense-100")).not.toBeInTheDocument();

  fireEvent.pointerDown(screen.getByTestId("clip-dense-0"), { button: 0 });
  act(() => {
    scrollArea.scrollLeft = 10_000;
    fireEvent.scroll(scrollArea);
  });

  expect(screen.getByTestId("clip-dense-0")).toBeInTheDocument();
  expect(screen.getByTestId("clip-dense-100")).toBeInTheDocument();
  expect(screen.getByTestId("clip-long-clip")).toBeInTheDocument();
  expect(scrollArea.querySelectorAll("[data-timeline-clip-id]").length).toBeLessThan(20);

  fireEvent.pointerUp(window);
  expect(screen.queryByTestId("clip-dense-0")).not.toBeInTheDocument();

  act(() => useTimelineUIStore.getState().setZoom(20));
  expect(screen.getByTestId("clip-dense-200")).toBeInTheDocument();
  expect(screen.queryByTestId("clip-dense-100")).not.toBeInTheDocument();
});
