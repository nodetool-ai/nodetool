/**
 * PreviewArea tests.
 *
 * Covers transport controls, keyboard shortcuts, and timecode / FPS display.
 * The PreviewCompositor is mocked so these tests focus on the transport UI
 * without involving DOM media APIs.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

// ── Module mocks ─────────────────────────────────────────────────────────────

// Prevent the compositor from mounting video elements in jsdom.
jest.mock("../PreviewCompositor", () => ({
  PreviewCompositor: () =>
    React.createElement("div", { "data-testid": "preview-compositor" })
}));

// Provide stable store state so tests don't need a full Zustand provider.
const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockStop = jest.fn();
const mockSetCurrentTimeMs = jest.fn();

let mockCurrentTimeMs = 0;
let mockIsPlaying = false;

jest.mock("../../../../stores/timeline/TimelinePlaybackStore", () => ({
  useTimelinePlaybackStore: (selector: (s: unknown) => unknown) => {
    const state = {
      currentTimeMs: mockCurrentTimeMs,
      isPlaying: mockIsPlaying,
      play: mockPlay,
      pause: mockPause,
      stop: mockStop,
      setCurrentTimeMs: mockSetCurrentTimeMs
    };
    return selector ? selector(state) : state;
  }
}));

jest.mock("../../../../stores/timeline/TimelineStore", () => ({
  useTimelineStore: (selector: (s: unknown) => unknown) => {
    const state = {
      clips: [],
      tracks: [],
      durationMs: 60_000
    };
    return selector ? selector(state) : state;
  }
}));

jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (s: unknown) => unknown) => {
    const state = {
      get: jest.fn().mockResolvedValue(null)
    };
    return selector ? selector(state) : state;
  }
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { PreviewArea } from "../PreviewArea";

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderPreview = (props = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PreviewArea fps={30} {...props} />
    </ThemeProvider>
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PreviewArea", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTimeMs = 0;
    mockIsPlaying = false;
  });

  describe("rendering", () => {
    it("renders the compositor", () => {
      renderPreview();
      expect(screen.getByTestId("preview-compositor")).toBeInTheDocument();
    });

    it("renders transport control buttons", () => {
      renderPreview();
      expect(
        screen.getByRole("button", { name: /play/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /stop/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /step back/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /step forward/i })
      ).toBeInTheDocument();
    });

    it("shows initial timecode 00:00:00:00", () => {
      renderPreview();
      expect(screen.getByText("00:00:00:00")).toBeInTheDocument();
    });

    it("shows the FPS readout", () => {
      renderPreview({ fps: 24 });
      expect(screen.getByText("24 fps")).toBeInTheDocument();
    });

    it("shows 30 fps by default", () => {
      renderPreview();
      expect(screen.getByText("30 fps")).toBeInTheDocument();
    });
  });

  describe("play button state", () => {
    it("shows Play button when not playing", () => {
      mockIsPlaying = false;
      renderPreview();
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("shows Pause button when playing", () => {
      mockIsPlaying = true;
      renderPreview();
      expect(
        screen.getByRole("button", { name: "Pause" })
      ).toBeInTheDocument();
    });
  });

  describe("keyboard shortcuts", () => {
    it("calls stop on Home key", () => {
      mockIsPlaying = true;
      renderPreview();
      fireEvent.keyDown(screen.getByTestId("preview-area"), { key: "Home" });
      expect(mockStop).toHaveBeenCalled();
    });

    it("stops and resets on End key", () => {
      mockIsPlaying = true;
      renderPreview();
      fireEvent.keyDown(screen.getByTestId("preview-area"), { key: "End" });
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe("transport buttons", () => {
    it("calls stop when Stop button is clicked", () => {
      renderPreview();
      fireEvent.click(screen.getByRole("button", { name: /stop/i }));
      expect(mockStop).toHaveBeenCalled();
    });

    it("step-back button is disabled when playing", () => {
      mockIsPlaying = true;
      renderPreview();
      const stepBack = screen.getByRole("button", { name: /step back one frame/i });
      expect(stepBack).toBeDisabled();
    });

    it("step-forward button is disabled when playing", () => {
      mockIsPlaying = true;
      renderPreview();
      const stepFwd = screen.getByRole("button", { name: /step forward one frame/i });
      expect(stepFwd).toBeDisabled();
    });

    it("step-back button is enabled when paused", () => {
      mockIsPlaying = false;
      renderPreview();
      const stepBack = screen.getByRole("button", { name: /step back one frame/i });
      expect(stepBack).not.toBeDisabled();
    });
  });

  describe("timecode formatting", () => {
    it("formats 1.5 seconds as 00:00:01:15 at 30 fps", () => {
      mockCurrentTimeMs = 1500;
      renderPreview({ fps: 30 });
      // 1.5s at 30fps = frame 45 → 00:00:01:15
      expect(screen.getByText("00:00:01:15")).toBeInTheDocument();
    });

    it("formats 60 seconds as 00:01:00:00 at 30 fps", () => {
      mockCurrentTimeMs = 60_000;
      renderPreview({ fps: 30 });
      expect(screen.getByText("00:01:00:00")).toBeInTheDocument();
    });
  });
});
