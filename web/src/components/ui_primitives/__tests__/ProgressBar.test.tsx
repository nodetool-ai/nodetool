import React from "react";
import { describe, expect, it } from "@jest/globals";
import "@testing-library/jest-dom/jest-globals";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ProgressBar } from "../ProgressBar";

const renderBar = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("ProgressBar", () => {
  it("exposes one progressbar named by its label", () => {
    renderBar(<ProgressBar value={40} label="Uploading clip.mp4" />);

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveAccessibleName("Uploading clip.mp4");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("draws the medium bar at 6px and the small bar at 4px", () => {
    const { rerender } = renderBar(<ProgressBar value={10} showValue={false} />);
    expect(screen.getByRole("progressbar")).toHaveStyle({ height: "6px" });

    rerender(
      <ThemeProvider theme={mockTheme}>
        <ProgressBar value={10} showValue={false} size="small" />
      </ThemeProvider>
    );
    expect(screen.getByRole("progressbar")).toHaveStyle({ height: "4px" });
  });

  it("tints the track and fills the bar with an accent colour", () => {
    const { container } = renderBar(
      <ProgressBar value={50} showValue={false} accent="#ff0000" />
    );

    expect(screen.getByRole("progressbar")).toHaveStyle({
      backgroundColor: "rgba(255, 0, 0, 0.16)"
    });
    expect(container.querySelector(".MuiLinearProgress-bar")).toHaveStyle({
      backgroundColor: "#ff0000"
    });
  });
});
