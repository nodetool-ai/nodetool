import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { VideoPlayer } from "../VideoPlayer";

const renderPlayer = (label?: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VideoPlayer label={label} />
    </ThemeProvider>
  );

describe("VideoPlayer accessible name", () => {
  it("names the video element after the media", () => {
    const { container } = renderPlayer("Shot 3 clip");
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("aria-label", "Shot 3 clip");
    expect(screen.getByLabelText("Shot 3 clip")).toBe(video);
  });

  it("falls back to a generic name when the caller gives none", () => {
    const { container } = renderPlayer();
    expect(container.querySelector("video")).toHaveAttribute(
      "aria-label",
      "Video player"
    );
  });
});
