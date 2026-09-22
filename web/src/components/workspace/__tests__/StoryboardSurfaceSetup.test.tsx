/**
 * Resume by stage on a workspace storyboard tab (PRD § 6.4, D3).
 *
 * The stage on the document is the only thing read: each of the four setup
 * stages mounts its step, `done` mounts the board, and a board saved before
 * the field existed has no stage at all and mounts the board too.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

let mockMobile = false;
jest.mock("@mui/material", () => ({
  ...jest.requireActual("@mui/material"),
  useMediaQuery: () => mockMobile
}));

const mockDocumentConflicts = {
  items: [] as Array<{
    unitId: string;
    label: string;
    detail?: string;
  }>,
  accept: jest.fn(),
  discard: jest.fn()
};

// The look step reaches the generation store, the entity library and the
// cost estimate. `LookStep.test.tsx` covers what it does; these suites only
// need it to exist so the flow can mount.
jest.mock("../../../components/setup/storyboard/LookStep", () => ({
  LookStep: () => null,
  useLookStep: () => ({
    canAdvance: true,
    primaryDetail: undefined,
    generate: jest.fn(async () => {})
  })
}));
jest.mock("../../../components/setup/storyboard/EntitiesStep", () => ({
  EntitiesStep: () => null
}));

jest.mock("../../storyboard/StoryboardBoard", () => ({
  __esModule: true,
  default: ({
    reviewRequest
  }: {
    reviewRequest?: { shotId: string; requestId: string } | null;
  }) => (
    <div
      data-testid="board"
      data-review-shot={reviewRequest?.shotId}
      data-review-request={reviewRequest?.requestId}
    />
  )
}));
jest.mock("../../storyboard/StoryboardAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="agent-panel" />
}));
jest.mock("../../storyboard/StoryboardQueueOverlay", () => ({
  __esModule: true,
  default: ({
    onReviewCompleted
  }: {
    onReviewCompleted?: (target: { shotId: string; requestId: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onReviewCompleted?.({
          shotId: "shot-review",
          requestId: "request-review"
        })
      }
    >
      Review completed takes
    </button>
  )
}));
jest.mock("../../chat/assistant/ResizableSideDock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
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
  useDocumentConflicts: () => mockDocumentConflicts
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
// The genre step carries a model picker; this suite asserts which step mounts,
// not what the picker offers, and stands up no query client.
jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useLanguageModelsByProvider: () => ({ models: [], isLoading: false })
}));
jest.mock("../../properties/LanguageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));
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

const renderSurface = (mode: "edit" | "view" = "edit") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardSurface refId={BOARD_ID} mode={mode} active />
    </ThemeProvider>
  );

beforeEach(() => {
  useStoryboardStore.setState({ boards: {} });
  mockMobile = false;
  mockDocumentConflicts.items = [];
  mockDocumentConflicts.accept.mockClear();
  mockDocumentConflicts.discard.mockClear();
});

describe("StoryboardSurface setup stages", () => {
  it.each([
    ["idea", "Continue"],
    ["genre", "Generate screenplay"],
    ["review", "Set up entities"],
    ["entities", "Choose the look"],
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
    expect(
      screen.queryByRole("navigation", { name: "Setup steps" })
    ).toBeNull();
  });

  it("opens the guarded shot editor target from the queue", async () => {
    seedBoard("done");
    renderSurface();

    await userEvent.click(
      screen.getByRole("button", { name: "Review completed takes" })
    );

    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-review-shot",
      "shot-review"
    );
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-review-request",
      "request-review"
    );
  });

  it("reveals the board pane before opening a completed take on mobile", async () => {
    mockMobile = true;
    seedBoard("done");
    renderSurface();
    await userEvent.click(screen.getByRole("tab", { name: "Assistant" }));
    expect(screen.getByTestId("board")).not.toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Review completed takes" })
    );

    expect(screen.getByTestId("board")).toBeVisible();
    expect(screen.getByTestId("board")).toHaveAttribute(
      "data-review-shot",
      "shot-review"
    );
  });

  it("mounts the board for a document with no stage field", () => {
    seedLegacyBoard();
    renderSurface();

    expect(screen.getByTestId("board")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Setup steps" })
    ).toBeNull();
  });

  it("keeps unfinished setup read-only in view mode", () => {
    seedBoard("idea");
    renderSurface("view");

    expect(
      screen.getByRole("heading", { name: "What's your story?" })
    ).toBeInTheDocument();
    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("shows setup conflicts in the shared surface shell", () => {
    mockDocumentConflicts.items = [
      {
        unitId: "shot-1",
        label: "Shot 1 action",
        detail: "External action"
      }
    ];
    seedBoard("review");
    renderSurface();

    expect(
      screen.getByText(
        "1 change made outside the editor conflicts with your edits."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });
});
