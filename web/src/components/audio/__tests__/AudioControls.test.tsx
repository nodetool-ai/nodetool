/**
 * Tests for AudioControls component
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioControls from "../AudioControls";

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
    it("renders the clock, zoom slider and buttons when assetUrl is provided", () => {
      renderWithTheme(
        <AudioControls {...defaultProps} currentTime={45} duration={125} />
      );
      expect(screen.getByText("0:45 / 2:05")).toBeInTheDocument();
      expect(screen.getByRole("slider", { name: "Zoom" })).toHaveAttribute(
        "aria-valuenow",
        "50"
      );
      for (const name of ["Play", "Loop", "Mute", "Download"]) {
        expect(screen.getByRole("button", { name })).toBeInTheDocument();
      }
    });

    it("renders nothing when assetUrl is not provided", () => {
      const { container } = renderWithTheme(
        <AudioControls {...defaultProps} assetUrl={undefined} />
      );
      expect(container.querySelector(".audio-controls")).toBeNull();
    });

    it("shows Pause while playing", () => {
      renderWithTheme(<AudioControls {...defaultProps} isPlaying />);
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("formats hours past the first hour", () => {
      renderWithTheme(
        <AudioControls {...defaultProps} currentTime={3725} duration={7200} />
      );
      expect(screen.getByText("1:02:05 / 2:00:00")).toBeInTheDocument();
    });
  });

  describe("Interaction", () => {
    it("calls onPlayPause", () => {
      renderWithTheme(<AudioControls {...defaultProps} />);
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      expect(defaultProps.onPlayPause).toHaveBeenCalledTimes(1);
    });

    it("toggles loop and reports its state", () => {
      renderWithTheme(<AudioControls {...defaultProps} loop />);
      const loop = screen.getByRole("button", { name: "Loop" });
      expect(loop).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(loop);
      expect(defaultProps.setLoop).toHaveBeenCalledWith(false);
    });

    it("toggles mute and reports its state", () => {
      renderWithTheme(<AudioControls {...defaultProps} />);
      const mute = screen.getByRole("button", { name: "Mute" });
      expect(mute).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(mute);
      expect(defaultProps.setMute).toHaveBeenCalledWith(true);
    });
  });

  describe("Download", () => {
    const originalCreateObjectURL = global.URL.createObjectURL;
    const originalRevokeObjectURL = global.URL.revokeObjectURL;
    const originalFetch = global.fetch;

    afterEach(() => {
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    const downloadNameFor = async (
      props: Partial<React.ComponentProps<typeof AudioControls>>,
      servedType: string | null
    ): Promise<string> => {
      global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
      global.URL.revokeObjectURL = jest.fn();
      const served: Pick<Response, "ok" | "blob"> & {
        headers: Pick<Headers, "get">;
      } = {
        ok: true,
        headers: { get: () => servedType },
        blob: () =>
          Promise.resolve(new Blob(["audio"], { type: servedType ?? "" }))
      };
      // SAFETY: jsdom has no Response, and AudioControls reads only
      // headers.get and blob() from the fetch result.
      global.fetch = jest.fn(() => Promise.resolve(served as Response));

      const names: string[] = [];
      jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          names.push(this.getAttribute("download") ?? "");
        });

      const { container } = renderWithTheme(
        <AudioControls {...defaultProps} {...props} />
      );
      const downloadButton = container.querySelector<HTMLElement>(
        ".download-audio-button"
      );
      if (!downloadButton) {
        throw new Error("download button not rendered");
      }
      fireEvent.click(downloadButton);
      await waitFor(() => expect(names).toHaveLength(1));
      return names[0];
    };

    it("names the file after the format the transfer served", async () => {
      await expect(
        downloadNameFor(
          {
            filename: "",
            assetUrl: "http://example.com/api/storage/abc",
            mimeType: "audio/wav"
          },
          "audio/wav"
        )
      ).resolves.toBe("audio.wav");
    });

    it("falls back to the declared mime type when the transfer is opaque", async () => {
      await expect(
        downloadNameFor(
          {
            filename: "",
            assetUrl: "http://example.com/api/storage/abc",
            mimeType: "audio/wav"
          },
          "application/octet-stream"
        )
      ).resolves.toBe("audio.wav");
    });

    it("keeps a filename that already names a format", async () => {
      await expect(
        downloadNameFor(
          { filename: "seed-audio.wav", mimeType: "audio/wav" },
          "audio/wav"
        )
      ).resolves.toBe("seed-audio.wav");
    });
  });
});
