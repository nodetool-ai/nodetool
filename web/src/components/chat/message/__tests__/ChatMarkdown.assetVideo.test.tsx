import React from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const mockUseQuery = jest.fn();

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storage: {
      signUrl: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args)
      }
    }
  }
}));

jest.mock("../../../../hooks/useResolvedMediaUri", () =>
  jest.requireActual("../../../../hooks/__mocks__/useResolvedMediaUri")
);
import {
  mockAssetContentType,
  mockAssetUrl,
  mockMissingAsset,
  mockPendingAsset,
  resetMockAssetContentTypes
} from "../../../../hooks/__mocks__/useResolvedMediaUri";
import { screen } from "@testing-library/react";

// The map the component sees: `jest.mock` above swapped the module the
// component imports, and reaching the manual mock by its own path hands this
// suite a second copy of it.
const { mockAssetContentTypes } = jest.requireMock(
  "../../../../hooks/useResolvedMediaUri"
) as typeof import("../../../../hooks/__mocks__/useResolvedMediaUri");

jest.mock("react-markdown", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../__mocks__/linkedMarkdownMock")
}));

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: (kind: string) =>
    kind !== "collection" && kind !== "thread"
}));

import ChatMarkdown from "../ChatMarkdown";

const ASSET_URI = "asset://51f0fcd92a05488caf261eb22bbf98df.mp4";
const RESOLVED_URL = mockAssetUrl("51f0fcd92a05488caf261eb22bbf98df.mp4");

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown asset video", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockAssetContentTypes();
  });

  it("renders an asset:// mp4 markdown image as a video player", () => {
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(
      `![Beach Scene at Sunset](${ASSET_URI})`
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", RESOLVED_URL);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("aria-label", "Beach Scene at Sunset");
    expect(container.querySelector("img")).toBeNull();
    expect(mockUseQuery).not.toHaveBeenCalledWith(
      { key: "51f0fcd92a05488caf261eb22bbf98df.mp4" },
      expect.anything()
    );
  });

  it("types an extension-less asset:// by its content type", () => {
    // `save_asset` returned `asset://<id>` with no suffix, and the embed
    // rendered as an <img> with an mp4 behind it — a blank tile in chat.
    mockUseQuery.mockReturnValue({ data: undefined });
    mockAssetContentTypes.set("9c936089c3d0471a90aa5443f6f46665", "video/mp4");

    const { container } = renderMarkdown(
      "![Skateboarding Red Panda](asset://9c936089c3d0471a90aa5443f6f46665)"
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute(
      "src",
      mockAssetUrl("9c936089c3d0471a90aa5443f6f46665")
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("types an extension-less audio asset by its content type", () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    mockAssetContentTypes.set("narration1", "audio/mpeg");

    const { container } = renderMarkdown("![Narration](asset://narration1)");

    expect(container.querySelector("audio")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("still renders an extension-less image asset as an image", () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    mockAssetContentTypes.set("pic1", "image/png");

    const { container } = renderMarkdown("![Pic](asset://pic1)");

    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders an https mp4 markdown image as a video player", () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    const httpsUrl = "https://cdn.example.com/clip.mp4";
    const { container } = renderMarkdown(`![](${httpsUrl})`);

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", httpsUrl);
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an asset:// mp4 markdown link as a video player", () => {
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(
      `[Beach Scene at Sunset](${ASSET_URI})`
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", RESOLVED_URL);
    expect(video).toHaveAttribute("aria-label", "Beach Scene at Sunset");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an extensionless asset:// markdown link as a video when the asset is video", () => {
    const assetId = "552662c1d18842c8a854eaa72416393d";
    const uri = `asset://${assetId}`;
    mockAssetContentType(uri, "video/mp4");
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(
      `You can view it here: [National Geographic Giraffe Reel](${uri}).`
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", mockAssetUrl(assetId));
    expect(video).toHaveAttribute(
      "aria-label",
      "National Geographic Giraffe Reel"
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an extensionless asset:// markdown image as a video when the asset is video", () => {
    const uri = "asset://552662c1d18842c8a854eaa72416393d";
    mockAssetContentType(uri, "video/mp4");
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(`![Giraffe Reel](${uri})`);

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("aria-label", "Giraffe Reel");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an asset:// audio markdown image as an audio player", () => {
    const audioUri = "asset://abc123.mp3";
    mockUseQuery.mockReturnValue({ data: undefined });

    const { container } = renderMarkdown(`![Narration](${audioUri})`);

    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio).not.toBeNull();
    expect(audio).toHaveAttribute("src", mockAssetUrl("abc123.mp3"));
    expect(audio).toHaveAttribute("aria-label", "Narration");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  /**
   * A generated clip whose asset cannot be resolved — the row is gone, or the
   * storage object cannot be signed — used to render nothing at all, so the
   * reply showed a heading and an empty gap where the video should be.
   */
  it("shows the resource instead of nothing when the asset cannot be resolved", () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    mockMissingAsset("ea27206c96404a11b5d8ba35735edf2f");

    const { container } = renderMarkdown(
      "![Opening Hook Clip](asset://ea27206c96404a11b5d8ba35735edf2f.mp4)"
    );

    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByTestId("unresolved-media")).toBeInTheDocument();
    expect(screen.getByText("Opening Hook Clip")).toBeInTheDocument();
    expect(screen.getByText("This media could not be loaded.")).toBeInTheDocument();
  });

  it("renders nothing while the asset lookup is still in flight", () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    mockPendingAsset("d3f1ed729a6a4b45b759e95a6134e196");

    const { container } = renderMarkdown(
      "![Feature Clip](asset://d3f1ed729a6a4b45b759e95a6134e196.mp4)"
    );

    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByTestId("unresolved-media")).toBeNull();
  });
});
