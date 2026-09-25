import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { TimelineViewControls } from "../TimelineViewControls";

it("keeps the zoom sliders and step buttons aligned at the production theme size", () => {
  const theme = {
    ...mockTheme,
    spacing: ((...factors: number[]) =>
      factors.map((factor) => `${factor * 4}px`).join(" ")) as typeof mockTheme.spacing
  };
  render(
    <ThemeProvider theme={theme}>
      <TimelineProvider>
        <TimelineViewControls compact={false} />
      </TimelineProvider>
    </ThemeProvider>
  );

  fireEvent.click(screen.getByRole("button", { name: "Timeline view" }));
  expect(screen.getByRole("dialog", { name: "Timeline view" })).toHaveStyle({
    width: "264px",
    boxSizing: "border-box"
  });
  expect(screen.getByRole("button", { name: "Zoom out timeline" })).toHaveStyle({
    width: "24px",
    height: "24px"
  });
  expect(
    screen.getByRole("slider", { name: "Horizontal zoom" }).closest(".MuiSlider-root")
  ).toHaveStyle({ height: "24px", margin: "0px" });
});
