import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import {
  TimelineProvider
} from "../../../../stores/timeline/TimelineInstance";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { TimelineZoomControls } from "../TimelineZoomControls";

const theme = {
  ...mockTheme,
  spacing: ((...factors: number[]) =>
    factors.map((factor) => `${factor * 4}px`).join(" ")) as typeof mockTheme.spacing
};

const renderControls = (compact: boolean) =>
  render(
    <ThemeProvider theme={theme}>
      <TimelineProvider>
        <TimelineZoomControls compact={compact} onZoomToFit={() => undefined} />
      </TimelineProvider>
    </ThemeProvider>
  );

it("keeps the zoom slider and step buttons aligned at the production theme size", () => {
  renderControls(false);
  expect(screen.getByRole("button", { name: "Zoom out timeline" })).toHaveStyle({
    width: "24px",
    height: "24px"
  });
  expect(
    screen.getByRole("slider", { name: "Horizontal zoom" }).closest(".MuiSlider-root")
  ).toHaveStyle({ height: "24px", margin: "0px" });
});

it("keeps the step buttons and drops the slider in a narrow toolbar", () => {
  renderControls(true);
  expect(screen.queryByRole("slider", { name: "Horizontal zoom" })).toBeNull();
  const before = useTimelineUIStore.getState().msPerPx;
  fireEvent.click(screen.getByRole("button", { name: "Zoom in timeline" }));
  expect(useTimelineUIStore.getState().msPerPx).toBeLessThan(before);
  expect(screen.getByRole("button", { name: "Zoom to fit" })).toBeInTheDocument();
});
