/**
 * The locator branch of the three media primitives.
 *
 * Each has two shapes: `src`, which the `ResolvedMediaUrl` brand already
 * guarantees is fetchable, and `locator`, which is whatever the graph stored.
 * These pin the locator branch — the one that has to resolve — and the
 * pass-through of an HTTPS URL, which a stored locator and a signed URL both
 * end up as.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { ResponsiveImage } from "../ResponsiveImage";
import { VideoPlayer } from "../VideoPlayer";
import { AudioPlayback } from "../AudioPlayback";
import { mockAssetUrl } from "../../../hooks/__mocks__/useResolvedMediaUri";
import { asResolvedMediaUrl } from "../../../utils/resolveMediaUri";

jest.mock("../../../hooks/useResolvedMediaUri");

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const HTTPS_URL = asResolvedMediaUrl("https://cdn.test/clip.mp4") ?? "";

describe("ResponsiveImage", () => {
  it("resolves an asset locator before setting src", () => {
    renderWithTheme(<ResponsiveImage locator="asset://abc123" alt="Still" />);
    expect(screen.getByAltText("Still")).toHaveAttribute(
      "src",
      mockAssetUrl("abc123")
    );
  });

  it("resolves a ref carrying only an asset_id", () => {
    renderWithTheme(
      <ResponsiveImage locator={{ asset_id: "def456" }} alt="Still" />
    );
    expect(screen.getByAltText("Still")).toHaveAttribute(
      "src",
      mockAssetUrl("def456")
    );
  });

  it("passes an https URL through unchanged", () => {
    renderWithTheme(
      <ResponsiveImage locator="https://cdn.test/a.png" alt="Still" />
    );
    expect(screen.getByAltText("Still")).toHaveAttribute(
      "src",
      "https://cdn.test/a.png"
    );
  });

  it("reports metadata duration to source monitors", () => {
    const onDurationChange = jest.fn();
    renderWithTheme(
      <VideoPlayer src={HTTPS_URL} onDurationChange={onDurationChange} />
    );
    const video = screen.getByLabelText("Video player");
    Object.defineProperty(video, "duration", { configurable: true, value: 4.25 });
    fireEvent.loadedMetadata(video);
    expect(onDurationChange).toHaveBeenCalledWith(4.25);
  });

  it("sets no src for a locator that resolves to nothing", () => {
    renderWithTheme(<ResponsiveImage locator={undefined} alt="Still" />);
    expect(screen.getByAltText("Still")).not.toHaveAttribute("src");
  });

  it("renders an already-resolved src without a lookup", () => {
    renderWithTheme(
      <ResponsiveImage
        src={asResolvedMediaUrl("https://cdn.test/b.png") ?? ""}
        alt="Still"
      />
    );
    expect(screen.getByAltText("Still")).toHaveAttribute(
      "src",
      "https://cdn.test/b.png"
    );
  });
});

describe("VideoPlayer", () => {
  it("resolves an asset locator before setting src", () => {
    renderWithTheme(<VideoPlayer locator="asset://clip789" />);
    expect(screen.getByLabelText("Video player")).toHaveAttribute(
      "src",
      mockAssetUrl("clip789")
    );
  });

  it("passes an https URL through unchanged", () => {
    renderWithTheme(<VideoPlayer src={HTTPS_URL} />);
    expect(screen.getByLabelText("Video player")).toHaveAttribute(
      "src",
      HTTPS_URL
    );
  });

  it("sets no src for a locator that resolves to nothing", () => {
    renderWithTheme(<VideoPlayer locator={null} />);
    expect(screen.getByLabelText("Video player")).not.toHaveAttribute("src");
  });
});

describe("AudioPlayback", () => {
  it("resolves an asset locator before setting src", () => {
    renderWithTheme(
      <AudioPlayback locator="asset://track42" label="Generated audio" />
    );
    expect(screen.getByLabelText("Generated audio")).toHaveAttribute(
      "src",
      mockAssetUrl("track42")
    );
  });

  it("passes an https URL through unchanged", () => {
    renderWithTheme(<AudioPlayback locator="https://cdn.test/a.wav" />);
    expect(screen.getByLabelText("Audio player")).toHaveAttribute(
      "src",
      "https://cdn.test/a.wav"
    );
  });

  it("sets no src for a locator that resolves to nothing", () => {
    renderWithTheme(<AudioPlayback locator="" />);
    expect(screen.getByLabelText("Audio player")).not.toHaveAttribute("src");
  });
});
