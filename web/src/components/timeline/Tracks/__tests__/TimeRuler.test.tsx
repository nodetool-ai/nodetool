/**
 * TimeRuler marker-overlay tests.
 *
 * The canvas drawing can't run in jsdom (no 2d context), but the interactive
 * marker flags are plain DOM: this verifies a marker renders, clicking it seeks
 * the playhead, and the delete button removes it from the store.
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimeRuler } from "../TimeRuler";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

const renderRuler = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TimeRuler totalWidthPx={1000} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("TimeRuler markers", () => {
  it("renders a flag and seeks the playhead on click", () => {
    renderRuler();
    act(() => {
      useTimelineStore.getState().addMarker(2000, "Scene 1");
    });

    const flag = screen.getByTestId("timeline-marker");
    expect(flag).toHaveTextContent("Scene 1");

    act(() => {
      fireEvent.click(flag);
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(2000);
  });

  it("deletes a marker via its × button", () => {
    renderRuler();
    act(() => {
      useTimelineStore.getState().addMarker(2000, "Scene 1");
    });
    expect(screen.getByTestId("timeline-marker")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("marker-delete"));
    });
    expect(useTimelineStore.getState().markers).toHaveLength(0);
    expect(screen.queryByTestId("timeline-marker")).not.toBeInTheDocument();
  });
});
