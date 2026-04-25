/**
 * Tests for AudioControls component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioControls from "../AudioControls";


// Mock TOOLTIP_ENTER_DELAY
jest.mock("../../../config/constants", () => ({
  TOOLTIP_ENTER_DELAY: 500
}));

describe("AudioControls", () => {
  const defaultProps = {
    isPlaying: false,
    zoom: 50,
    loop: false,
    mute: false,
    setLoop: jest.fn(),
    setMute: jest.fn(),
    onPlayPause: jest.fn(),
    onZoomChange: jest.fn(),
    filename: "test-audio.mp3",
    assetUrl: "http://example.com/audio.mp3"
  };

  const renderWithTheme = (ui: React.ReactElement) =>
    render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render when assetUrl is provided", () => {
      renderWithTheme(<AudioControls {...defaultProps} />);
      expect(screen.getByText("ZOOM:")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("should not render when assetUrl is not provided", () => {
      const propsWithoutUrl = { ...defaultProps, assetUrl: undefined };
      const { container } = renderWithTheme(<AudioControls {...propsWithoutUrl} />);
      expect(container.querySelector(".audio-controls")?.childNodes.length).toBe(0);
    });

    it("should render zoom controls", () => {
      renderWithTheme(<AudioControls {...defaultProps} />);
      expect(screen.getByText("ZOOM:")).toBeInTheDocument();
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    it("should render play/pause button", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} />);
      const playButton = container.querySelector(".play-button");
      expect(playButton).toBeInTheDocument();
    });

    it("should render loop button", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} />);
      const loopButton = container.querySelector(".loop-button");
      expect(loopButton).toBeInTheDocument();
    });

    it("should render mute button", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} />);
      const muteButton = container.querySelector(".mute-button");
      expect(muteButton).toBeInTheDocument();
    });

    it("should render download button", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} />);
      const downloadButton = container.querySelector(".download-audio-button");
      expect(downloadButton).toBeInTheDocument();
    });
  });

  describe("Loop Interaction", () => {
    it("should apply disabled class when loop is false", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} loop={false} />);
      const loopButton = container.querySelector(".loop-button.disabled");
      expect(loopButton).toBeInTheDocument();
    });

    it("should not apply disabled class when loop is true", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} loop={true} />);
      const loopButton = container.querySelector(".loop-button:not(.disabled)");
      expect(loopButton).toBeInTheDocument();
    });
  });

  describe("Mute Interaction", () => {
    it("should apply disabled class when mute is false", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} mute={false} />);
      const muteButton = container.querySelector(".mute-button.disabled");
      expect(muteButton).toBeInTheDocument();
    });

    it("should not apply disabled class when mute is true", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} mute={true} />);
      const muteButton = container.querySelector(".mute-button:not(.disabled)");
      expect(muteButton).toBeInTheDocument();
    });
  });

  describe("Zoom Interaction", () => {
    it("should display current zoom value", () => {
      renderWithTheme(<AudioControls {...defaultProps} zoom={75} />);
      expect(screen.getByText("75")).toBeInTheDocument();
    });
  });

  describe("Font Sizes", () => {
    it("should apply tiny font size by default", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} />);
      const zoomLabel = container.querySelector(".tiny");
      expect(zoomLabel).toBeInTheDocument();
    });

    it("should apply small font size when specified", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} fontSize="small" />);
      const zoomLabel = container.querySelector(".small");
      expect(zoomLabel).toBeInTheDocument();
    });

    it("should apply normal font size when specified", () => {
      const { container } = renderWithTheme(<AudioControls {...defaultProps} fontSize="normal" />);
      const zoomLabel = container.querySelector(".normal");
      expect(zoomLabel).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty filename", () => {
      const { container } = renderWithTheme(
        <AudioControls {...defaultProps} filename="" />
      );
      const downloadButton = container.querySelector(".download-audio-button.disabled");
      expect(downloadButton).toBeInTheDocument();
    });

    it("should handle undefined filename", () => {
      const { container } = renderWithTheme(
        <AudioControls {...defaultProps} filename={undefined} />
      );
      const downloadButton = container.querySelector(".download-audio-button");
      expect(downloadButton).toBeInTheDocument();
    });

    it("should handle zoom at minimum value", () => {
      renderWithTheme(<AudioControls {...defaultProps} zoom={1} />);
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("should handle zoom at maximum value", () => {
      renderWithTheme(<AudioControls {...defaultProps} zoom={100} />);
      expect(screen.getByText("100")).toBeInTheDocument();
    });
  });
});
