import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { PlaybackButton } from "../PlaybackButton";
import mockTheme from "../../../__mocks__/themeMock";

describe("PlaybackButton", () => {
  const mockOnPlay = jest.fn();
  const mockOnPause = jest.fn();
  const mockOnStop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders play icon when stopped", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="stopped"
          onPlay={mockOnPlay}
          onPause={mockOnPause}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("PlayArrowIcon")).toBeInTheDocument();
  });

  it("renders pause icon when playing and in toggle mode", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="playing"
          onPlay={mockOnPlay}
          onPause={mockOnPause}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("PauseIcon")).toBeInTheDocument();
  });

  it("calls onPlay when clicked while stopped", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="stopped"
          onPlay={mockOnPlay}
          onPause={mockOnPause}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnPlay).toHaveBeenCalledTimes(1);
  });

  it("calls onPause when clicked while playing", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="playing"
          onPlay={mockOnPlay}
          onPause={mockOnPause}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnPause).toHaveBeenCalledTimes(1);
  });

  it("renders stop icon when playbackAction is stop", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="playing"
          playbackAction="stop"
          onStop={mockOnStop}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("StopIcon")).toBeInTheDocument();
  });

  it("calls onStop when playbackAction is stop and clicked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="playing"
          playbackAction="stop"
          onStop={mockOnStop}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnStop).toHaveBeenCalledTimes(1);
  });

  it("applies nodrag class by default", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="stopped"
          onPlay={mockOnPlay}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("nodrag");
  });

  it("applies state as class", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <PlaybackButton
          state="playing"
          onPlay={mockOnPlay}
          onPause={mockOnPause}
        />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveClass("playing");
  });
});
