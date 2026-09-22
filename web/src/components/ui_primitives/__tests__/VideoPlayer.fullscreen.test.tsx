import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { VideoPlayer } from "../VideoPlayer";

it("uses iPhone video fullscreen and follows native dismissal", () => {
  const enter = jest.fn();
  const exit = jest.fn();
  Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
    configurable: true,
    value: enter
  });
  Object.defineProperty(HTMLVideoElement.prototype, "webkitExitFullscreen", {
    configurable: true,
    value: exit
  });
  try {
    render(
      <ThemeProvider theme={mockTheme}>
        <VideoPlayer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));
    expect(enter).toHaveBeenCalledTimes(1);
    const video = screen.getByLabelText("Video player");
    fireEvent(video, new Event("webkitbeginfullscreen"));
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(exit).toHaveBeenCalledTimes(1);
    fireEvent(video, new Event("webkitendfullscreen"));
    expect(
      screen.getByRole("button", { name: "Enter fullscreen" })
    ).toBeVisible();
  } finally {
    Reflect.deleteProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen");
    Reflect.deleteProperty(HTMLVideoElement.prototype, "webkitExitFullscreen");
  }
});
