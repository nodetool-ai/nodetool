import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentEmbedDialog from "../DocumentEmbedDialog";
import { DocumentLocationProvider } from "../documentEditorContext";

const mockSearch = jest.fn();
const mockUseStoryboards = jest.fn();
const mockUseStoryboard = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    storyboards: {
      get: { useQuery: (input: { id: string }) => mockUseStoryboard(input) }
    }
  },
  trpcClient: {
    assets: { search: { query: (input: unknown) => mockSearch(input) } }
  }
}));
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useStoryboards: (projectId?: string) => mockUseStoryboards(projectId)
}));
jest.mock("../../ui_primitives/MediaThumbnail", () => ({
  MediaThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb">{alt}</span>
}));
jest.mock("../documentEmbeds", () => ({
  ...jest.requireActual("../documentEmbeds"),
  uploadEmbedFile: jest.fn()
}));

const ASSETS = [
  {
    id: "a1",
    name: "cover.png",
    content_type: "image/png",
    project_id: "p1",
    workspace_path: "notes/assets/cover.png"
  },
  { id: "a2", name: "voice.mp3", content_type: "audio/mpeg", project_id: "p1" },
  { id: "a3", name: "brief.pdf", content_type: "application/pdf", project_id: "p1" }
];

const renderDialog = (onInsert: jest.Mock, onClose = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={new QueryClient()}>
        <DocumentLocationProvider value={{ projectId: "p1", path: "notes/plan.md" }}>
          <DocumentEmbedDialog open onClose={onClose} onInsert={onInsert} />
        </DocumentLocationProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue({ assets: ASSETS });
  mockUseStoryboards.mockReturnValue({
    data: [{ id: "b1", name: "Launch film" }],
    isLoading: false
  });
  mockUseStoryboard.mockReturnValue({
    data: {
      id: "b1",
      document: {
        shots: [
          { id: "s2", index: 1, action: "Close on the hero", slug: "Hero close" },
          { id: "s1", index: 0, action: "Wide of the city" }
        ]
      }
    },
    isLoading: false
  });
});

describe("DocumentEmbedDialog", () => {
  it("lists the project's media and inserts a picked file by its relative path", async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn();
    const onClose = jest.fn();
    renderDialog(onInsert, onClose);

    const cover = await screen.findByRole("button", { name: /cover\.png/ });
    expect(screen.getByRole("button", { name: /voice\.mp3/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /brief\.pdf/ })).not.toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: "p1" })
    );

    await user.click(cover);
    expect(onInsert).toHaveBeenCalledWith([{ src: "assets/cover.png", alt: "cover" }]);
    expect(onClose).toHaveBeenCalled();
  });

  it("inserts a typed path or URL", async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn();
    renderDialog(onInsert);
    await screen.findByRole("button", { name: /cover\.png/ });

    await user.type(screen.getByRole("textbox", { name: /path or url/i }), "https://x/clip.mp4");
    await user.click(screen.getByRole("button", { name: /^insert$/i }));
    expect(onInsert).toHaveBeenCalledWith([{ src: "https://x/clip.mp4", alt: "" }]);
  });

  it("inserts a storyboard shot in board order", async () => {
    const user = userEvent.setup();
    const onInsert = jest.fn();
    renderDialog(onInsert);

    await user.click(screen.getByRole("tab", { name: /storyboard shot/i }));
    expect(mockUseStoryboards).toHaveBeenCalledWith("p1");
    const tiles = await screen.findAllByRole("button", { name: /SH 0/ });
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      expect.stringContaining("SH 01 · Wide of the city"),
      expect.stringContaining("SH 02 · Hero close")
    ]);
    await user.click(tiles[1]);
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith([
        { src: "storyboard://b1/shots/s2", alt: "SH 02 · Hero close" }
      ])
    );
  });
});
