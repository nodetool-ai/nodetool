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
const mockUseScript = jest.fn();
const mockUseTimeline = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: {
      get: { useQuery: (input: { id: string }) => mockUseStoryboard(input) }
    },
    scripts: {
      get: { useQuery: (input: { id: string }) => mockUseScript(input) }
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
jest.mock("../../../hooks/useTimelineSequence", () => ({
  useTimeline: (id: string) => mockUseTimeline(id)
}));
jest.mock("../../timeline/TimelinePlayer", () => ({
  __esModule: true,
  default: ({ sequenceId, active }: { sequenceId: string; active: boolean }) => (
    <div data-testid="timeline-player" data-id={sequenceId} data-active={String(active)} />
  )
}));
jest.mock("../../script/ScriptSpeakerAvatar", () => ({
  __esModule: true,
  default: () => <span data-testid="avatar" />
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
    renderEmbed("storyboard://b1#shot=s2");
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
    renderEmbed("storyboard://b1#shot=s1", "Opening");
    expect(screen.getByTestId("image")).toHaveAttribute("alt", "Opening");
    expect(screen.queryByTestId("video")).not.toBeInTheDocument();
  });

  it("says so when the shot is gone", () => {
    mockUseStoryboard.mockReturnValue({ data: board, isLoading: false });
    renderEmbed("storyboard://b1#shot=deleted", "Old shot");
    expect(screen.queryByTestId("document-shot-embed")).not.toBeInTheDocument();
    expect(screen.getByText(/Old shot/)).toBeInTheDocument();
  });
});

describe("DocumentEmbed timelines", () => {
  const timeline = { id: "tl1", name: "Teaser cut", projectId: "p1", width: 1080, height: 1920 };

  it("plays the timeline in an inactive player and opens it in the editor", async () => {
    mockUseTimeline.mockReturnValue({ data: timeline, isLoading: false });
    renderEmbed("timeline://tl1");
    const player = await screen.findByTestId("timeline-player");
    expect(player).toHaveAttribute("data-id", "tl1");
    expect(player).toHaveAttribute("data-active", "false");
    expect(mockUseTimeline).toHaveBeenCalledWith("tl1");
    expect(screen.getByText("Teaser cut")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open timeline" }));
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "timeline",
      ref: "tl1",
      mode: "edit",
      title: "Teaser cut",
      projectId: "p1"
    });
  });

  it("names a timeline that no longer exists", async () => {
    mockUseTimeline.mockReturnValue({ data: undefined, isLoading: false });
    renderEmbed("timeline://gone", "Old cut");
    expect(await screen.findByText("Timeline not found: Old cut")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-player")).not.toBeInTheDocument();
  });
});

describe("DocumentEmbed voice scripts", () => {
  const script = {
    id: "sc1",
    name: "Launch voiceover",
    projectId: "p1",
    document: {
      cast: [{ id: "n", name: "Narrator" }],
      sections: [
        {
          id: "intro",
          title: "Intro",
          lines: [
            {
              id: "l1",
              speakerId: "n",
              text: "Meet the city.",
              direction: "warm",
              takes: [
                { id: "t1", assetId: "first", durationMs: 900 },
                { id: "t2", assetId: "chosen", durationMs: 1000 }
              ],
              currentTakeId: "t2"
            },
            { id: "l2", speakerId: "n", text: "Not voiced yet.", takes: [] }
          ]
        }
      ]
    }
  };

  it("lists each line with its speaker and plays the chosen take", async () => {
    mockUseScript.mockReturnValue({ data: script, isLoading: false });
    renderEmbed("script://sc1");
    expect(await screen.findByTestId("document-script-embed")).toBeInTheDocument();
    expect(mockUseScript).toHaveBeenCalledWith({ id: "sc1" });
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Meet the city.")).toBeInTheDocument();
    expect(screen.getByText("(warm)")).toBeInTheDocument();
    expect(screen.getAllByText("Narrator")).toHaveLength(2);
    const audio = screen.getAllByTestId("audio");
    expect(audio).toHaveLength(1);
    expect(audio[0]).toHaveAttribute("data-locator", "asset://chosen");
    await userEvent.click(screen.getByRole("button", { name: "Open script" }));
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "script",
      ref: "sc1",
      mode: "edit",
      title: "Launch voiceover",
      projectId: "p1"
    });
  });

  it("plays the newest take when none is chosen", async () => {
    const line = { ...script.document.sections[0].lines[0], currentTakeId: null };
    mockUseScript.mockReturnValue({
      data: {
        ...script,
        document: { ...script.document, sections: [{ id: "s", lines: [line] }] }
      },
      isLoading: false
    });
    renderEmbed("script://sc1");
    expect(await screen.findByTestId("audio")).toHaveAttribute("data-locator", "asset://chosen");
  });

  it("says when the script has no lines", async () => {
    mockUseScript.mockReturnValue({
      data: { ...script, document: { cast: [], sections: [{ id: "s", lines: [] }] } },
      isLoading: false
    });
    renderEmbed("script://sc1");
    expect(await screen.findByText("This script has no lines yet.")).toBeInTheDocument();
  });

  it("names a script that no longer exists", async () => {
    mockUseScript.mockReturnValue({ data: undefined, isLoading: false });
    renderEmbed("script://gone", "Old script");
    expect(await screen.findByText("Script not found: Old script")).toBeInTheDocument();
  });
});
