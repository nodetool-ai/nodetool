/**
 * `preferThumbnail` through the real resolver.
 *
 * The tile asks for `thumb_url` first. When the server has not written the
 * thumbnail yet, the `<img>` fails before the probe does; the tile must not
 * stay on the broken-image fallback once the probe swaps in `get_url`.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import { ResponsiveImage } from "../ResponsiveImage";

const FULL = "https://cdn.test/signed/u1/abc123.png?sig=full";
const THUMB = "https://cdn.test/signed/u1/abc123_thumb.jpg?sig=thumb";

jest.mock("../../../stores/AssetStore", () => ({
  __esModule: true,
  useAssetStore: jest.fn(
    (selector: (state: { get: () => undefined }) => unknown) =>
      selector({ get: () => undefined })
  )
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn(),
  useQueries: jest.fn()
}));

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

/** Thumbnail probes in flight; a test settles them when it chooses. */
const probes: { onerror: (() => void) | null }[] = [];

/** A thumbnail the server has not written yet: every probe fails. */
class MissingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    probes.push(this);
  }
}

const failProbes = (): void => {
  probes.splice(0).forEach((probe) => probe.onerror?.());
};

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("ResponsiveImage preferThumbnail", () => {
  const OriginalImage = global.Image;

  beforeEach(() => {
    jest.useFakeTimers();
    probes.length = 0;
    global.Image = MissingImage as unknown as typeof Image;
    // A disabled query (no locator to look up) has no data, as in the app.
    mockUseQuery.mockImplementation(
      (options) =>
        (options.enabled
          ? {
              data: { get_url: FULL, thumb_url: THUMB, content_type: "image/png" },
              isPending: false,
              isError: false
            }
          : { data: undefined, isPending: true, isError: false }) as unknown as ReturnType<
          typeof useQuery
        >
    );
  });

  afterEach(() => {
    global.Image = OriginalImage;
    jest.useRealTimers();
  });

  it("renders the thumbnail in a tile and the original without preferThumbnail", () => {
    renderWithTheme(
      <>
        <ResponsiveImage locator="asset://abc123" preferThumbnail alt="Tile" />
        <ResponsiveImage locator="asset://abc123" alt="Viewer" />
      </>
    );
    expect(screen.getByAltText("Tile")).toHaveAttribute("src", THUMB);
    expect(screen.getByAltText("Viewer")).toHaveAttribute("src", FULL);
  });

  it("recovers from a missing thumbnail by painting the original", () => {
    renderWithTheme(
      <ResponsiveImage locator="asset://abc123" preferThumbnail alt="Tile" />
    );
    expect(screen.getByAltText("Tile")).toHaveAttribute("src", THUMB);
    fireEvent.error(screen.getByAltText("Tile"));
    expect(screen.queryByAltText("Tile")).not.toBeInTheDocument();

    act(() => {
      failProbes();
    });

    expect(screen.getByAltText("Tile")).toHaveAttribute("src", FULL);
  });
});
