import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

const mockSketchGet = jest.fn();
const mockTimelineGet = jest.fn();
const mockSignUrl = jest.fn();

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../../hooks/useResolvedMediaUri");
import { mockAssetUrl } from "../../../../hooks/__mocks__/useResolvedMediaUri";

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    sketch: {
      get: { useQuery: (...args: unknown[]) => mockSketchGet(...args) }
    },
    timeline: {
      get: { useQuery: (...args: unknown[]) => mockTimelineGet(...args) }
    },
    storage: {
      signUrl: { useQuery: (...args: unknown[]) => mockSignUrl(...args) }
    }
  }
}));

jest.mock("../../../sketch/SketchRenderer", () => ({
  __esModule: true,
  default: () => <div data-testid="sketch-renderer" />
}));

jest.mock("../../../timeline/TimelineRenderer", () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-renderer" />
}));

// The real player pulls in the game runtime; the test only needs the props.
jest.mock("../../../game/GamePlayerPage", () => ({
  __esModule: true,
  SavedGamePlayer: ({
    gameId,
    setsDocumentTitle
  }: {
    gameId: string;
    setsDocumentTitle?: boolean;
  }) => (
    <div
      data-testid="game-player"
      data-game-id={gameId}
      data-sets-title={String(setsDocumentTitle)}
    />
  )
}));

jest.mock("../../../../lib/chat/openResource", () => ({
  __esModule: true,
  openResource: jest.fn(),
  canOpenResource: () => true
}));

jest.mock("react-markdown", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../__mocks__/linkedMarkdownMock")
}));

// Import after mocks
import ChatMarkdown from "../ChatMarkdown";

const idleQuery = { data: undefined, isLoading: false, isError: false };

const SKETCH_DOCUMENT = {
  canvas: { width: 512, height: 512 },
  layers: [],
  activeLayerId: "layer-1"
};

const TIMELINE_SEQUENCE = {
  id: "tl_1",
  name: "Cut",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 4000,
  tracks: [],
  clips: [],
  markers: []
};

const renderMarkdown = (content: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatMarkdown content={content} />
    </ThemeProvider>
  );

describe("ChatMarkdown inline document previews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSketchGet.mockReturnValue(idleQuery);
    mockTimelineGet.mockReturnValue(idleQuery);
    mockSignUrl.mockReturnValue({ data: undefined });
  });

  it("renders an embedded sketch as an inline preview", async () => {
    mockSketchGet.mockReturnValue({
      data: { id: "sk_1", document: { sketch: SKETCH_DOCUMENT } },
      isLoading: false,
      isError: false
    });

    renderMarkdown("![Poster draft](sketch://sk_1)");

    expect(mockSketchGet).toHaveBeenCalledWith(
      { id: "sk_1" },
      expect.objectContaining({ staleTime: 30_000 })
    );
    expect(await screen.findByTestId("sketch-renderer")).toBeInTheDocument();
    // The open-in-editor chip carries the label.
    expect(screen.getByText("Poster draft")).toBeInTheDocument();
  });

  it("renders an embedded timeline as an inline preview", async () => {
    mockTimelineGet.mockReturnValue({
      data: TIMELINE_SEQUENCE,
      isLoading: false,
      isError: false
    });

    renderMarkdown("![First cut](timeline://tl_1)");

    expect(mockTimelineGet).toHaveBeenCalledWith(
      { id: "tl_1" },
      expect.objectContaining({ staleTime: 30_000 })
    );
    expect(await screen.findByTestId("timeline-renderer")).toBeInTheDocument();
    expect(screen.getByText("First cut")).toBeInTheDocument();
  });

  it("renders an embedded game as an inline player", async () => {
    renderMarkdown("![Cave run](game://g_1)");

    const player = await screen.findByTestId("game-player");
    expect(player).toHaveAttribute("data-game-id", "g_1");
    // Chat is not the player's page: the tab title stays the app's.
    expect(player).toHaveAttribute("data-sets-title", "false");
    expect(screen.getByRole("button", { name: /Cave run/ })).toBeInTheDocument();
  });

  it("keeps a plain game link as a chip, not a player", () => {
    renderMarkdown("Built [Cave run](game://g_1).");

    expect(screen.getByRole("button", { name: /Cave run/ })).toBeInTheDocument();
    expect(screen.queryByTestId("game-player")).toBeNull();
  });

  it("keeps a plain sketch link as a chip, not a preview", () => {
    renderMarkdown("Edited [the poster](sketch://sk_1).");

    expect(screen.getByText("the poster")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-resource-preview")).toBeNull();
    expect(mockSketchGet).not.toHaveBeenCalled();
  });

  it("still renders asset:// images as plain images", () => {
    mockSignUrl.mockReturnValue({ data: undefined });
    const { container } = renderMarkdown("![](asset://abc.png)");

    expect(screen.queryByTestId("inline-resource-preview")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      mockAssetUrl("abc.png")
    );
  });

  it("degrades to the chip when the document fails to load", () => {
    mockSketchGet.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "not found" }
    });

    renderMarkdown("![Poster draft](sketch://sk_1)");

    expect(screen.queryByTestId("sketch-renderer")).toBeNull();
    expect(screen.getByText("Could not load this sketch.")).toBeInTheDocument();
    expect(screen.getByText("Poster draft")).toBeInTheDocument();
  });
});
