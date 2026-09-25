import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeTrack } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TracksRegion } from "../TracksRegion";

it("mounts only the visible rows of a Serein-sized timeline and keeps columns aligned", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

  const tracks = Array.from({ length: 319 }, (_, index) =>
    makeTrack({
      id: `track-${index}`,
      name: `Track ${index}`,
      index,
      type: index >= 200 ? "audio" : "video",
      heightPx: index === 200 ? 120 : undefined
    })
  );
  act(() => {
    useTimelineStore.setState({ tracks, scriptEnabled: true });
    useTimelineUIStore.getState().setExpandedFxTrackId("track-200");
  });

  const scrollArea = screen.getByTestId("tracks-scroll-area");
  expect(screen.getAllByTestId(/^track-header-track-/).length).toBeLessThan(20);
  expect(scrollArea.querySelectorAll("[data-track-lane-id]").length).toBeLessThan(20);
  expect(screen.queryByTestId("track-header-track-200")).not.toBeInTheDocument();

  const targetTop = 200 * 64;
  act(() => {
    scrollArea.scrollTop = targetTop;
    fireEvent.scroll(scrollArea);
  });

  expect(screen.getByTestId("track-header-track-200")).toBeInTheDocument();
  expect(scrollArea.querySelector('[data-track-lane-id="track-200"]')).toBeInTheDocument();
  expect(screen.getByLabelText("Script lane")).toBeInTheDocument();
  expect(screen.getByTestId("script-lane")).toBeInTheDocument();
  expect(screen.queryByTestId("track-header-track-0")).not.toBeInTheDocument();
  expect(screen.getAllByTestId(/^track-header-track-/).length).toBeLessThan(20);
  expect(scrollArea.firstElementChild).toHaveStyle({ height: "20798px" });

  act(() => {
    useTimelineUIStore.getState().setVerticalZoom(2);
  });
  expect(scrollArea.scrollTop).toBe(200 * 128);
  expect(screen.getByTestId("track-header-track-200")).toBeInTheDocument();
  expect(scrollArea.querySelector('[data-track-lane-id="track-200"]')).toBeInTheDocument();
  expect(screen.getAllByTestId(/^track-header-track-/).length).toBeLessThan(20);
  expect(scrollArea.firstElementChild).toHaveStyle({ height: "41270px" });
});
