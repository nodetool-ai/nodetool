/**
 * Follow playhead: the page-scroll rule, and the lanes paging during playback
 * only while the toolbar toggle is on.
 *
 * Store state is seeded AFTER render so `getState()` routes to the mounted
 * provider's instance.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { followScrollLeft } from "../followPlayhead";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));

describe("followScrollLeft", () => {
  // 10 ms/px, a 1000 px viewport scrolled to 0: the view shows 0–10 s.
  it("leaves the view alone while the playhead is inside it", () => {
    expect(followScrollLeft(5_000, 10, 0, 1000)).toBeNull();
  });

  it("pages forward when the playhead nears the right edge", () => {
    // 9.6 s is 960 px, past the 950 px edge; the page leads by 100 px.
    expect(followScrollLeft(9_600, 10, 0, 1000)).toBe(860);
  });

  it("pages back when the playhead is left of the view", () => {
    // A loop wrap to 1 s while the view starts at 2000 px.
    expect(followScrollLeft(1_000, 10, 2000, 1000)).toBe(0);
  });

  it("does nothing without a measured viewport", () => {
    expect(followScrollLeft(50_000, 10, 0, 0)).toBeNull();
  });
});

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

const sizeScrollArea = (): HTMLElement => {
  const el = screen.getByTestId("tracks-scroll-area");
  Object.defineProperty(el, "clientWidth", { configurable: true, value: 1000 });
  return el;
};

const playTo = (timeMs: number) => {
  act(() => {
    useTimelineUIStore.getState().setZoom(10);
    useTimelinePlaybackStore.getState().play();
    useTimelinePlaybackStore.getState().setTimeMs(timeMs);
  });
};

describe("TracksRegion follow playhead", () => {
  it("pages the lanes during playback while Follow is on", () => {
    renderRegion();
    const el = sizeScrollArea();
    expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    playTo(9_600);
    expect(el.scrollLeft).toBe(860);
  });

  it("leaves the lanes alone when paused", () => {
    renderRegion();
    const el = sizeScrollArea();
    act(() => {
      useTimelineUIStore.getState().setZoom(10);
      useTimelinePlaybackStore.getState().setTimeMs(9_600);
    });
    expect(el.scrollLeft).toBe(0);
  });

  it("leaves the lanes alone after Follow is turned off", () => {
    renderRegion();
    const el = sizeScrollArea();
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(useTimelineUIStore.getState().followPlayhead).toBe(false);
    playTo(9_600);
    expect(el.scrollLeft).toBe(0);
  });
});
