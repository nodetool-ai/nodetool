import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentEmbed from "../nodes/DocumentEmbed";
import { DocumentLocationProvider } from "../documentEditorContext";

const mockOpenTab = jest.fn();
const mockUseStoryboard = jest.fn();
const mockResolved = jest.fn();
const mockAssetOfFile = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: {
      get: { useQuery: (input: { id: string }) => mockUseStoryboard(input) }
    }
  },
  trpcClient: {}
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: { openTab: jest.Mock }) => unknown) =>
    selector({ openTab: mockOpenTab })
}));
jest.mock("../../../hooks/useResolvedMediaUri", () => ({
  useResolvedMedia: (locator: unknown) => mockResolved(locator)
}));
jest.mock("../../workspaces/workspaceTreeActions", () => ({
  assetOfFile: (projectId: string, path: string) => mockAssetOfFile(projectId, path)
}));
jest.mock("../../asset_viewer/LazyModel3DViewer", () => ({
  __esModule: true,
  default: ({ url }: { url: string }) => <div data-testid="model3d" data-url={url} />
}));
const mockLocatorOf = (locator: unknown) =>
  typeof locator === "string" ? locator : JSON.stringify(locator);
jest.mock("../../ui_primitives/ResponsiveImage", () => ({
  ResponsiveImage: ({ locator, alt }: { locator: unknown; alt: string }) => (
    <img data-testid="image" data-locator={mockLocatorOf(locator)} alt={alt} />
  )
}));
jest.mock("../../ui_primitives/VideoPlayer", () => ({
  VideoPlayer: ({ locator }: { locator: unknown }) => (
    <div data-testid="video" data-locator={mockLocatorOf(locator)} />
  )
}));
jest.mock("../../ui_primitives/AudioPlayback", () => ({
  AudioPlayback: ({ locator }: { locator: unknown }) => (
    <div data-testid="audio" data-locator={mockLocatorOf(locator)} />
  )
}));

const renderEmbed = (src: string, alt = "", path: string | null = "notes/plan.md") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={client}>
        <DocumentLocationProvider value={{ projectId: "p1", path }}>
          {children}
        </DocumentLocationProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
  return render(wrap(<DocumentEmbed src={src} alt={alt} />));
};

const ASSET_ID = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  jest.clearAllMocks();
  mockResolved.mockReturnValue({ url: undefined, contentType: undefined, pending: false });
});

describe("DocumentEmbed media", () => {
  it("plays a project video found by its relative path", async () => {
    mockAssetOfFile.mockResolvedValue({ id: ASSET_ID });
    renderEmbed("assets/teaser.mp4", "Teaser");
    const video = await screen.findByTestId("video");
    expect(video).toHaveAttribute("data-locator", `asset://${ASSET_ID}`);
    expect(mockAssetOfFile).toHaveBeenCalledWith("p1", "notes/assets/teaser.mp4");
    expect(screen.getByText("Teaser")).toBeInTheDocument();
  });

  it("plays audio from a URL without a project lookup", () => {
    renderEmbed("https://example.com/voice.mp3", "Voice");
    expect(screen.getByTestId("audio")).toHaveAttribute(
      "data-locator",
      "https://example.com/voice.mp3"
    );
    expect(mockAssetOfFile).not.toHaveBeenCalled();
  });

  it("types an asset locator by the asset's content type", () => {
    mockResolved.mockReturnValue({ url: "https://x/v", contentType: "video/mp4", pending: false });
    renderEmbed(`asset://${ASSET_ID}`, "Clip");
    expect(screen.getByTestId("video")).toHaveAttribute("data-locator", `asset://${ASSET_ID}`);
  });

  it("shows a 3D model through its resolved URL", () => {
    mockResolved.mockReturnValue({ url: "https://x/robot.glb", contentType: "model/gltf-binary", pending: false });
    renderEmbed(`asset://${ASSET_ID}`, "Robot");
    expect(screen.getByTestId("model3d")).toHaveAttribute("data-url", "https://x/robot.glb");
  });

  it("falls back to the caption while the asset's type is unknown", () => {
    renderEmbed(`asset://${ASSET_ID}`, "Pending");
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByTestId("image")).not.toBeInTheDocument();
  });
});

describe("DocumentEmbed storyboard shots", () => {
  const board = {
    id: "b1",
    name: "Launch film",
    projectId: "p1",
    document: {
      shots: [
        {
          id: "s1",
          index: 0,
          action: "Wide of the city",
          keyframe: { type: "image", uri: `asset://${ASSET_ID}` },
          clip: null
        },
        {
          id: "s2",
          index: 1,
          action: "Close on the hero",
          slug: "Hero close",
          keyframe: { type: "image", uri: "asset://key" },
          clip: { type: "video", uri: "asset://clip" }
        }
      ]
    }
  };

  it("shows the clip of a rendered shot and opens its storyboard", async () => {
    mockUseStoryboard.mockReturnValue({ data: board, isLoading: false });
    const user = userEvent.setup();
    renderEmbed("storyboard://b1/shots/s2");
    expect(mockUseStoryboard).toHaveBeenCalledWith({ id: "b1" });
    expect(screen.getByTestId("video").getAttribute("data-locator")).toContain("asset://clip");
    expect(screen.getByText("Launch film · SH 02 · Hero close")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "storyboard",
      ref: "b1",
      mode: "edit",
      title: "Launch film",
      projectId: "p1"
    });
  });

  it("shows the keyframe of a shot with no clip yet", () => {
    mockUseStoryboard.mockReturnValue({ data: board, isLoading: false });
    renderEmbed("storyboard://b1/shots/s1", "Opening");
    expect(screen.getByTestId("image")).toHaveAttribute("alt", "Opening");
    expect(screen.queryByTestId("video")).not.toBeInTheDocument();
  });

  it("says so when the shot is gone", () => {
    mockUseStoryboard.mockReturnValue({ data: board, isLoading: false });
    renderEmbed("storyboard://b1/shots/deleted", "Old shot");
    expect(screen.queryByTestId("document-shot-embed")).not.toBeInTheDocument();
    expect(screen.getByText(/Old shot/)).toBeInTheDocument();
  });
});
