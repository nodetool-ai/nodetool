/**
 * Document surfaces hold their content behind the initial server load.
 *
 * The store seeds an empty document on mount, so a surface that renders
 * straight away shows an empty board/script — indistinguishable from one that
 * really is empty. Each waits on its sync hook instead.
 */

import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import StoryboardSurface from "../StoryboardSurface";
import ScriptSurface from "../ScriptSurface";
import mockTheme from "../../../__mocks__/themeMock";
import type { DocumentLoadState } from "../../../stores/documentSync";

jest.mock("@mui/material/useMediaQuery", () => () => false);

let storyboardLoadState: DocumentLoadState = "loading";
let scriptLoadState: DocumentLoadState = "loading";

jest.mock("../../../hooks/storyboard/useStoryboardServerSync", () => ({
  useStoryboardServerSync: () => storyboardLoadState
}));
jest.mock("../../../hooks/script/useScriptServerSync", () => ({
  useScriptServerSync: () => scriptLoadState
}));

jest.mock("../../../hooks/storyboard/useStoryboardAgentBridge", () => ({
  useStoryboardAgentBridge: jest.fn()
}));
jest.mock("../../../hooks/script/useScriptAgentBridge", () => ({
  useScriptAgentBridge: jest.fn()
}));
jest.mock("../../../hooks/useDocumentUndoShortcuts", () => ({
  useDocumentUndoShortcuts: jest.fn()
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

jest.mock("../../storyboard/StoryboardBoard", () => ({
  __esModule: true,
  default: () => <div>storyboard board</div>
}));
jest.mock("../../storyboard/StoryboardQueueOverlay", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../storyboard/StoryboardAgentPanel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../script/ScriptDocumentPane", () => ({
  __esModule: true,
  default: () => <div>script document</div>
}));
jest.mock("../../script/ScriptCastPanel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../script/ScriptAgentPanel", () => ({
  __esModule: true,
  default: () => null
}));

const withTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("document surfaces during the initial load", () => {
  it("shows a spinner instead of an empty storyboard", () => {
    storyboardLoadState = "loading";
    withTheme(<StoryboardSurface refId="board-1" mode="edit" active />);

    expect(screen.getByText("Loading storyboard…")).toBeInTheDocument();
    expect(screen.queryByText("storyboard board")).not.toBeInTheDocument();
  });

  it("renders the storyboard once the load lands", () => {
    storyboardLoadState = "ready";
    withTheme(<StoryboardSurface refId="board-1" mode="edit" active />);

    expect(screen.getByText("storyboard board")).toBeInTheDocument();
    expect(screen.queryByText("Loading storyboard…")).not.toBeInTheDocument();
  });

  it("says so when a storyboard cannot be loaded", () => {
    storyboardLoadState = "error";
    withTheme(<StoryboardSurface refId="board-1" mode="edit" active />);

    expect(
      screen.getByText("Could not load this storyboard")
    ).toBeInTheDocument();
  });

  it("shows a spinner instead of an empty script", () => {
    scriptLoadState = "loading";
    withTheme(<ScriptSurface refId="script-1" mode="edit" active />);

    expect(screen.getByText("Loading script…")).toBeInTheDocument();
    expect(screen.queryByText("script document")).not.toBeInTheDocument();
  });

  it("renders the script once the load lands", () => {
    scriptLoadState = "ready";
    withTheme(<ScriptSurface refId="script-1" mode="edit" active />);

    expect(screen.getByText("script document")).toBeInTheDocument();
  });
});
