import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { GameDocument } from "@nodetool-ai/protocol/game.js";
import mockTheme from "../../../__mocks__/themeMock";
import { GamePlayer } from "../GamePlayerPage";

const mockBeginPlay = jest.fn();
let mockSession: {
  playing: boolean;
  playDocument: GameDocument | null;
  backend: string;
  sceneId: string;
};

jest.mock("../useGamePlaySession", () => ({
  useGamePlaySession: () => ({
    canvasRef: { current: null },
    inputRef: { current: { handlesKey: () => false, keyUp: jest.fn(), release: jest.fn() } },
    playing: mockSession.playing,
    playDocument: mockSession.playDocument,
    playState: { tick: 0, score: 0, won: false, sceneId: mockSession.sceneId },
    backend: mockSession.backend,
    error: null,
    beginPlay: mockBeginPlay,
    stop: jest.fn()
  })
}));

jest.mock("../../support/ReportBugButton", () => ({
  __esModule: true,
  default: () => null
}));

const document = {
  scenes: [
    { id: "title", name: "Title" },
    { id: "forest", name: "Forest" }
  ]
} as unknown as GameDocument;

const renderPlayer = (autoPlay: boolean) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <GamePlayer
        gameId="example:lumen"
        name="Lumen"
        document={document}
        setsDocumentTitle={false}
        autoPlay={autoPlay}
      />
    </ThemeProvider>
  );

describe("GamePlayer", () => {
  beforeEach(() => {
    mockBeginPlay.mockClear();
    mockSession = { playing: false, playDocument: null, backend: "Initializing", sceneId: "title" };
  });

  // UX study 2 (A1-10, A3-09): the card's Play opened the player in "Ready".
  it("starts once the renderer is ready when the card's Play opened it", () => {
    const { rerender } = renderPlayer(true);
    expect(mockBeginPlay).not.toHaveBeenCalled();

    mockSession = { ...mockSession, backend: "Canvas 2D" };
    rerender(
      <ThemeProvider theme={mockTheme}>
        <GamePlayer gameId="example:lumen" name="Lumen" document={document} setsDocumentTitle={false} autoPlay />
      </ThemeProvider>
    );
    expect(mockBeginPlay).toHaveBeenCalledTimes(1);

    mockSession = { ...mockSession, playing: true, playDocument: document };
    rerender(
      <ThemeProvider theme={mockTheme}>
        <GamePlayer gameId="example:lumen" name="Lumen" document={document} setsDocumentTitle={false} autoPlay />
      </ThemeProvider>
    );
    expect(mockBeginPlay).toHaveBeenCalledTimes(1);
  });

  it("waits for the Play button without autoPlay", () => {
    mockSession = { ...mockSession, backend: "Canvas 2D" };
    renderPlayer(false);
    expect(mockBeginPlay).not.toHaveBeenCalled();
    expect(screen.getByText(/Ready/)).toBeInTheDocument();
  });

  // UX study 2 (A3-33): the header said "Playing" on the title screen.
  it("names the current scene instead of claiming the level is playing", () => {
    mockSession = { playing: true, playDocument: document, backend: "Canvas 2D", sceneId: "title" };
    renderPlayer(false);
    expect(screen.getByText("Score 0 · Scene: Title · Canvas 2D")).toBeInTheDocument();
    expect(screen.queryByText(/Playing/)).toBeNull();
  });
});
