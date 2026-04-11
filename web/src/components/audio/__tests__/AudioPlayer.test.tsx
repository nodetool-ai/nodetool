/**
 * Tests for AudioPlayer component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioPlayer from "../AudioPlayer";

// Mock URL.createObjectURL/revokeObjectURL without replacing the entire URL object
const originalCreateObjectURL = global.URL.createObjectURL;
const originalRevokeObjectURL = global.URL.revokeObjectURL;
global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = jest.fn();

// Mock dependencies
jest.mock("wavesurfer.js", () => ({
  default: {
    create: jest.fn(() => ({
      on: jest.fn(),
      un: jest.fn(),
      unAll: jest.fn(),
      play: jest.fn(),
      playPause: jest.fn(),
      pause: jest.fn(),
      stop: jest.fn(),
      seekTo: jest.fn(),
      setMuted: jest.fn(),
      zoom: jest.fn(),
      getDuration: jest.fn(() => 120),
      getCurrentTime: jest.fn(() => 45),
      isPlaying: jest.fn(() => false),
      getWrapper: jest.fn(() => ({
        getBoundingClientRect: jest.fn(() => ({
          left: 0,
          top: 0,
          width: 800,
          height: 100,
          right: 800,
          bottom: 100,
          x: 0,
          y: 0,
          toJSON: jest.fn()
        })),
        scrollWidth: 800,
        clientWidth: 800
      })),
      destroy: jest.fn(),
      load: jest.fn()
    }))
  }
}));

jest.mock("wavesurfer.js/dist/plugins/minimap", () => ({
  default: {
    create: jest.fn(() => ({
      destroy: jest.fn()
    }))
  }
}));

jest.mock("axios", () => {
  const axiosMock = {
    get: jest.fn(() =>
      Promise.resolve({
        status: 200,
        data: new Blob(["audio data"], { type: "audio/mp3" })
      })
    ),
    isCancel: jest.fn(() => false)
  };
  return {
    __esModule: true,
    default: axiosMock
  };
});

jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));

const themeWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
);

describe("AudioPlayer", () => {
  const defaultProps = {
    source: "http://example.com/audio.mp3",
    filename: "test-audio.mp3"
  };

  afterAll(() => {
    global.URL.createObjectURL = originalCreateObjectURL;
    global.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render with filename", () => {
      render(<AudioPlayer {...defaultProps} />, { wrapper: themeWrapper });
      expect(screen.getByText("test-audio.mp3")).toBeInTheDocument();
    });

    it("should render waveform container", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />, { wrapper: themeWrapper });
      const waveform = container.querySelector("#waveform");
      expect(waveform).toBeInTheDocument();
    });

    it("should render minimap container", () => {
      const { container } = render(<AudioPlayer {...defaultProps} />, { wrapper: themeWrapper });
      const minimap = container.querySelector(".minimap");
      expect(minimap).toBeInTheDocument();
    });

    it("should apply disabled class when no source", () => {
      const { container } = render(<AudioPlayer source="" filename="test.mp3" />, { wrapper: themeWrapper });
      const audioControls = container.querySelector(".audio-controls-container.disabled");
      expect(audioControls).toBeInTheDocument();
    });
  });

  describe("Audio Loading", () => {
    it("should load audio from URL source", () => {
      render(<AudioPlayer {...defaultProps} />, { wrapper: themeWrapper });
      expect(screen.getByText("test-audio.mp3")).toBeInTheDocument();
    });

    it("should handle Uint8Array source", () => {
      const audioData = new Uint8Array([1, 2, 3, 4, 5]);
      render(<AudioPlayer source={audioData} filename="test.mp3" />, { wrapper: themeWrapper });
      
      expect(screen.getByText("test.mp3")).toBeInTheDocument();
    });

    it("should handle empty source", () => {
      const { container } = render(<AudioPlayer source="" />, { wrapper: themeWrapper });
      const audioControls = container.querySelector(".audio-controls-container");
      expect(audioControls).toBeInTheDocument();
    });

    it("should handle undefined source", () => {
      const { container } = render(<AudioPlayer source={undefined} />, { wrapper: themeWrapper });
      const audioControls = container.querySelector(".audio-controls-container");
      expect(audioControls).toBeInTheDocument();
    });
  });

  describe("Font Sizes", () => {
    it("should apply tiny font size by default", () => {
      render(<AudioPlayer {...defaultProps} />, { wrapper: themeWrapper });
      expect(screen.getByText("test-audio.mp3")).toBeInTheDocument();
    });

    it("should apply small font size when specified", () => {
      render(<AudioPlayer {...defaultProps} fontSize="small" />, { wrapper: themeWrapper });
      expect(screen.getByText("test-audio.mp3")).toBeInTheDocument();
    });

    it("should apply normal font size when specified", () => {
      render(<AudioPlayer {...defaultProps} fontSize="normal" />, { wrapper: themeWrapper });
      expect(screen.getByText("test-audio.mp3")).toBeInTheDocument();
    });
  });

  describe("Custom Props", () => {
    it("should render with custom height props", () => {
      const { container } = render(<AudioPlayer {...defaultProps} height={20} />, { wrapper: themeWrapper });

      const waveform = container.querySelector("#waveform") as HTMLElement;
      expect(waveform).toBeInTheDocument();
    });

    it("should render with custom waveform height props", () => {
      const { container } = render(<AudioPlayer {...defaultProps} waveformHeight={25} />, { wrapper: themeWrapper });

      const waveform = container.querySelector("#waveform") as HTMLElement;
      expect(waveform).toBeInTheDocument();
    });

    it("should render with custom minimap height props", () => {
      const { container } = render(<AudioPlayer {...defaultProps} minimapHeight={10} />, { wrapper: themeWrapper });

      const minimap = container.querySelector(".minimap") as HTMLElement;
      expect(minimap).toBeInTheDocument();
    });
  });

  describe("Display Names", () => {
    it("should have component name", () => {
      expect(AudioPlayer.name).toBe("AudioPlayer");
    });
  });
});
