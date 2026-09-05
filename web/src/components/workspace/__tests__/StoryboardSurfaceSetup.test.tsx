/**
 * Resume by stage on a workspace storyboard tab (PRD § 6.4, D3).
 *
 * The stage on the document is the only thing read: each of the four setup
 * stages mounts its step, `done` mounts the board, and a board saved before
 * the field existed has no stage at all and mounts the board too.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../storyboard/StoryboardBoard", () => ({
  __esModule: true,
  default: () => <div data-testid="board" />
}));
jest.mock("../../storyboard/StoryboardAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="agent-panel" />
}));
jest.mock("../../storyboard/StoryboardQueueOverlay", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../chat/assistant/ResizableSideDock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

jest.mock("../../../hooks/storyboard/useStoryboardServerSync", () => ({
  useStoryboardServerSync: () => "ready"
}));
jest.mock("../../../hooks/storyboard/useStoryboardAgentBridge", () => ({
  useStoryboardAgentBridge: jest.fn()
}));
jest.mock("../../../stores/storyboard/StoryboardGenerationStore", () => ({
  useStoryboardGenerationSubscriptions: jest.fn()
}));
jest.mock("../../../hooks/storyboard/useDirectScreenplay", () => ({
  useDirectScreenplay: () => ({
    direct: jest.fn(),
    directing: false,
    error: null
  })
}));
jest.mock("../../../hooks/storyboard/useAssembleTimeline", () => ({
  useAssembleTimeline: () => ({
    assemble: jest.fn(),
    assembling: false,
    error: null
  })
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({
  useDocumentConflicts: () => ({
    items: [],
    accept: jest.fn(),
    discard: jest.fn()
  })
}));
jest.mock("../../../hooks/useDocumentUndoShortcuts", () => ({
  useDocumentUndoShortcuts: jest.fn()
}));
// The idea step offers the shipped boards' loglines, and the genre step draws
// `package://` stills — neither is what this suite is asking about.
jest.mock("../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [], isLoading: false })
}));
jest.mock("../../../hooks/useResolvedMediaUri");
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (s: { setTitle: jest.Mock }) => T) =>
    selector({ setTitle: jest.fn() })
}));

import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../../stores/storyboard/StoryboardStore";
import StoryboardSurface from "../StoryboardSurface";

const BOARD_ID = "b1";

const seedBoard = (stage: StoryboardSetupStage) => {
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  useStoryboardStore.getState().setSetup(BOARD_ID, { stage });
};

/** A board saved before `setupStage` existed: the field is simply absent. */
const seedLegacyBoard = () => {
  useStoryboardStore.getState().ensureBoard(BOARD_ID);
  useStoryboardStore.setState((state) => {
    const board: Record<string, unknown> = { ...state.boards[BOARD_ID] };
    delete board.setupStage;
    return {
      boards: {
        ...state.boards,
        [BOARD_ID]: board as unknown as StoryboardBoard
      }
    };
  });
};

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardSurface refId={BOARD_ID} mode="edit" active />
    </ThemeProvider>
  );

beforeEach(() => {
  useStoryboardStore.setState({ boards: {} });
});

describe("StoryboardSurface setup stages", () => {
  it.each([
    ["idea", "Continue"],
    ["genre", "Review your screenplay"],
    ["review", "Continue to storyboard"],
    ["look", "Generate your storyboard"]
  ] as const)("mounts the %s step, not the board", (stage, primary) => {
    seedBoard(stage);
    renderSurface();

    expect(screen.getByRole("button", { name: primary })).toBeInTheDocument();
    expect(screen.queryByTestId("board")).not.toBeInTheDocument();
  });

  it("mounts each step's own body", () => {
    seedBoard("idea");
    const { unmount } = renderSurface();
    expect(
      screen.getByRole("heading", { name: "What's your story?" })
    ).toBeInTheDocument();
    unmount();

    seedBoard("genre");
    renderSurface();
    expect(
      screen.getByRole("heading", { name: "Choose your genre" })
    ).toBeInTheDocument();
  });

  it("mounts the board at stage done", () => {
    seedBoard("done");
    renderSurface();

    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Setup steps" })).toBeNull();
  });

  it("mounts the board for a document with no stage field", () => {
    seedLegacyBoard();
    renderSurface();

    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Setup steps" })).toBeNull();
  });
});
