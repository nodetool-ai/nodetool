/**
 * Small previews paint the asset's 512px thumbnail; the actions still use the
 * stored original.
 *
 * Production egress was dominated by node bodies and cards downloading
 * multi-megabyte originals to fill tiles a few hundred pixels wide. These pin
 * the thumbnail path end to end through the real resolver: the tile paints
 * `thumb_url`, falls back to `get_url` while the server is still writing the
 * thumbnail, and the viewer and copy action keep `get_url`.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import ImageRefPreview from "../ImageRefPreview";
import { THUMBNAIL_RETRY_BASE_MS } from "../../../hooks/useImageThumbnail";

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

jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({ url, open }: { url?: string; open: boolean }) =>
    open
      ? React.createElement("div", { "data-testid": "asset-viewer", "data-url": url })
      : null
}));

jest.mock("../../common/CopyAssetButton", () => ({
  __esModule: true,
  CopyAssetButton: ({ url }: { url: string }) =>
    React.createElement("span", { "data-testid": "copy-asset", "data-url": url })
}));

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

/** Controls which URLs load; each probe settles on the next microtask. */
const available = new Set<string>();

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(url: string) {
    void Promise.resolve().then(() => {
      if (available.has(url)) {
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

const ALT = "Generated image output";

const renderPreview = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("ImageRefPreview", () => {
  const OriginalImage = global.Image;

  beforeEach(() => {
    jest.useFakeTimers();
    available.clear();
    global.Image = FakeImage as unknown as typeof Image;
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

  it("paints the thumbnail in a small tile and keeps the original for the actions", async () => {
    available.add(THUMB);
    renderPreview(
      <ImageRefPreview value={{ type: "image", uri: "asset://abc123" }} preferThumbnail />
    );
    await flush();

    expect(screen.getByAltText(ALT)).toHaveAttribute("src", THUMB);
    expect(screen.getByTestId("copy-asset")).toHaveAttribute("data-url", FULL);

    fireEvent.doubleClick(screen.getByAltText(ALT));
    expect(screen.getByTestId("asset-viewer")).toHaveAttribute("data-url", FULL);
  });

  it("paints the original while the thumbnail is still missing, then switches", async () => {
    renderPreview(
      <ImageRefPreview value={{ type: "image", uri: "asset://abc123" }} preferThumbnail />
    );
    await flush();
    await flush();
    expect(screen.getByAltText(ALT)).toHaveAttribute("src", FULL);

    available.add(THUMB);
    await act(async () => {
      jest.advanceTimersByTime(THUMBNAIL_RETRY_BASE_MS);
    });
    await flush();
    await flush();

    expect(screen.getByAltText(ALT)).toHaveAttribute("src", THUMB);
  });

  it("paints the original when the caller needs full resolution", async () => {
    available.add(THUMB);
    renderPreview(<ImageRefPreview value={{ type: "image", uri: "asset://abc123" }} />);
    await flush();

    expect(screen.getByAltText(ALT)).toHaveAttribute("src", FULL);
  });

  it("paints an inline image unchanged", async () => {
    const dataUri = "data:image/png;base64,AAAA";
    renderPreview(<ImageRefPreview value={{ type: "image", uri: dataUri }} preferThumbnail />);
    await flush();

    expect(screen.getByAltText(ALT)).toHaveAttribute("src", dataUri);
  });
});
