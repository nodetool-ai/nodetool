import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { SnapGuideOverlay } from "../SnapGuideOverlay";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";

const renderOverlay = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SnapGuideOverlay />
    </ThemeProvider>
  );

beforeEach(() => {
  useTimelineUIStore.setState({ msPerPx: 10, snapGuideMs: null });
});

describe("SnapGuideOverlay", () => {
  it("renders nothing while no snap is engaged", () => {
    renderOverlay();
    expect(screen.queryByTestId("timeline-snap-guide")).toBeNull();
  });

  it("draws the guide at snapGuideMs / msPerPx", () => {
    useTimelineUIStore.setState({ snapGuideMs: 8500 });
    renderOverlay();
    expect(screen.getByTestId("timeline-snap-guide")).toHaveStyle({
      left: "850px"
    });
  });

  it("follows the zoom level", () => {
    useTimelineUIStore.setState({ snapGuideMs: 8500, msPerPx: 20 });
    renderOverlay();
    expect(screen.getByTestId("timeline-snap-guide")).toHaveStyle({
      left: "425px"
    });
  });
});
