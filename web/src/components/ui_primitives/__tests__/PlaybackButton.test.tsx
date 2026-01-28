import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { PlaybackButton } from "../PlaybackButton";
import mockTheme from "../../../__mocks__/themeMock";

// Mock icons
jest.mock("@mui/icons-material/PlayArrow", () => ({
  __esModule: true,
  default: () => <span data-testid="play-icon" />
}));

jest.mock("@mui/icons-material/Pause", () => ({
  __esModule: true,
  default: () => <span data-testid="pause-icon" />
}));

jest.mock("@mui/icons-material/Stop", () => ({
  __esModule: true,
  default: () => <span data-testid="stop-icon" />
}));

// Mock MUI IconButton
jest.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: ({ children, disabled, onClick, className, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} className={className} {...rest}>
      {children}
    </button>
  )
}));

// Mock Tooltip to just render children
jest.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

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

    expect(screen.getByTestId("play-icon")).toBeInTheDocument();
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

    expect(screen.getByTestId("pause-icon")).toBeInTheDocument();
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

    expect(screen.getByTestId("stop-icon")).toBeInTheDocument();
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
