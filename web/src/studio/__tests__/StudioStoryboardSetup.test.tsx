/**
 * Resume by stage on the Studio board page (PRD § 6.4, D3) — the same rule the
 * workspace tab follows: the stage on the document decides, and nothing else.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../__mocks__/themeMock";

jest.mock("react-router-dom", () => ({
  __esModule: true,
  useNavigate: () => jest.fn(),
  useParams: () => ({ boardId: "b1" })
}));

jest.mock("../StudioShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
jest.mock("../../components/storyboard/StoryboardBoard", () => ({
  __esModule: true,
  default: () => <div data-testid="board" />
}));
jest.mock("../../components/storyboard/StoryboardAgentPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="agent-panel" />
}));
jest.mock("../../components/storyboard/StoryboardQueueOverlay", () => ({
  __esModule: true,
  default: () => null
}));

jest.mock("../../hooks/storyboard/useStoryboardServerSync", () => ({
  useStoryboardServerSync: () => "ready"
}));
jest.mock("../../hooks/storyboard/useStoryboardAgentBridge", () => ({
  useStoryboardAgentBridge: jest.fn()
}));
jest.mock("../../stores/storyboard/StoryboardGenerationStore", () => ({
  useStoryboardGenerationSubscriptions: jest.fn()
}));
// Resume-by-stage is about which step mounts. The look step's body reaches the
// generation store, the entity library and the cost estimate; `LookStep.test.tsx`
// covers what it does, so here it only has to exist.
jest.mock("../../components/setup/storyboard/LookStep", () => ({
  LookStep: () => null,
  useLookStep: () => ({
    canAdvance: true,
    primaryDetail: undefined,
    generate: jest.fn(async () => {})
  })
}));

jest.mock("../../hooks/useDocumentUndoShortcuts", () => ({
  useDocumentUndoShortcuts: jest.fn()
}));
jest.mock("../../hooks/storyboard/useDirectScreenplay", () => ({
  useDirectScreenplay: () => ({
    direct: jest.fn(),
    directing: false,
    error: null
  })
}));
jest.mock("../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [], isLoading: false })
}));
jest.mock("../../hooks/useResolvedMediaUri");
jest.mock("../../hooks/storyboard/useAssembleTimeline", () => ({
  useAssembleTimeline: () => ({
    assemble: jest.fn(),
    assembling: false,
    error: null
  })
}));

import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../stores/storyboard/StoryboardStore";
import StudioStoryboardPage from "../StudioStoryboardPage";

const BOARD_ID = "b1";

const renderPage = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioStoryboardPage />
    </ThemeProvider>
  );

beforeEach(() => {
  useStoryboardStore.setState({ boards: {} });
});

describe("StudioStoryboardPage setup stages", () => {
  it.each([
    ["idea", "Continue"],
    ["genre", "Review your screenplay"],
    ["review", "Continue to storyboard"],
    ["look", "Generate your storyboard"]
  ] as const)("mounts the %s step, not the board", (stage, primary) => {
    useStoryboardStore.getState().ensureBoard(BOARD_ID);
    useStoryboardStore
      .getState()
      .setSetup(BOARD_ID, { stage: stage as StoryboardSetupStage });
    renderPage();

    expect(screen.getByRole("button", { name: primary })).toBeInTheDocument();
    expect(screen.queryByTestId("board")).not.toBeInTheDocument();
  });

  it("mounts the board at stage done", () => {
    useStoryboardStore.getState().ensureBoard(BOARD_ID);
    useStoryboardStore.getState().setSetup(BOARD_ID, { stage: "done" });
    renderPage();

    expect(screen.getByTestId("board")).toBeInTheDocument();
  });

  it("mounts the board for a document with no stage field", () => {
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
    renderPage();

    expect(screen.getByTestId("board")).toBeInTheDocument();
  });
});
