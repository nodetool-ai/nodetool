import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { VideoPlayer } from "../VideoPlayer";

const renderPlayer = (seekToSeconds?: number) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VideoPlayer seekToSeconds={seekToSeconds} />
    </ThemeProvider>
  );

describe("VideoPlayer seekToSeconds", () => {
  it("parks the video at the requested time and follows changes", () => {
    const { container, rerender } = renderPlayer(4.5);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.currentTime).toBe(4.5);
    rerender(
      <ThemeProvider theme={mockTheme}>
        <VideoPlayer seekToSeconds={9} />
      </ThemeProvider>
    );
    expect(video.currentTime).toBe(9);
  });

  it("leaves the time alone without a request", () => {
    const { container } = renderPlayer();
    expect((container.querySelector("video") as HTMLVideoElement).currentTime).toBe(0);
  });
});
