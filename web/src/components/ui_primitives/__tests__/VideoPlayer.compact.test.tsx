import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { VideoPlayer } from "../VideoPlayer";

const renderPlayer = (compact: boolean) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <VideoPlayer compact={compact} />
    </ThemeProvider>
  );

describe("VideoPlayer compact", () => {
  it("replaces the speed selector with a mute toggle", () => {
    const { container } = renderPlayer(true);
    expect(container.querySelector(".speed-select")).toBeNull();
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(video.muted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(video.muted).toBe(false);
  });

  it("keeps the speed selector by default", () => {
    const { container } = renderPlayer(false);
    expect(container.querySelector(".speed-select")).not.toBeNull();
    expect(container.querySelector(".mute-button")).toBeNull();
  });
});
