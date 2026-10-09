/**
 * The Studio script page binds no document undo while the setup flow shows:
 * the flow writes to the script store, so Cmd/Ctrl+Z would undo the flow.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../__mocks__/themeMock";
import { useDocumentUndoShortcuts } from "../../hooks/useDocumentUndoShortcuts";
import StudioScriptPage from "../StudioScriptPage";

let stage = "idea";
let loadState = "ready";
jest.mock("react-router-dom", () => ({
  __esModule: true,
  useParams: () => ({ scriptId: "script-undo" }),
  useNavigate: () => jest.fn()
}));
jest.mock("../StudioShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
jest.mock("../../components/setup/script/useScriptSetupFlow", () => ({
  useScriptSetupStage: () => stage,
  useScriptSetupFlow: () => ({})
}));
jest.mock("../../components/setup/SetupFlow", () => ({
  SetupFlow: () => <div data-testid="setup-flow" />
}));
jest.mock("../../hooks/useDocumentUndoShortcuts", () => ({
  useDocumentUndoShortcuts: jest.fn()
}));
jest.mock("../../hooks/script/useScriptServerSync", () => ({
  useScriptServerSync: () => loadState
}));
jest.mock("../../hooks/script/useScriptAgentBridge", () => ({
  useScriptAgentBridge: jest.fn()
}));
jest.mock("../../hooks/script/useAssembleScriptTimeline", () => ({
  useAssembleScriptTimeline: () => ({
    assemble: jest.fn(),
    assembling: false,
    error: null
  })
}));
jest.mock("../../components/script/ScriptDocumentPane", () => () => null);
jest.mock("../../components/script/ScriptCastPanel", () => () => null);
jest.mock("../../components/script/ScriptAgentPanel", () => () => null);

const shortcuts = useDocumentUndoShortcuts as jest.Mock;
const lastEnabled = (): boolean | undefined =>
  shortcuts.mock.calls[shortcuts.mock.calls.length - 1][0].enabled;

const renderPage = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioScriptPage />
    </ThemeProvider>
  );

describe("StudioScriptPage undo shortcuts", () => {
  beforeEach(() => {
    shortcuts.mockClear();
    loadState = "ready";
  });

  it("binds no document undo while the setup flow shows", () => {
    stage = "review";
    renderPage();
    expect(lastEnabled()).toBe(false);
  });

  it("binds document undo in the editor", () => {
    stage = "done";
    renderPage();
    expect(lastEnabled()).toBe(true);
  });
});

describe("StudioScriptPage server load", () => {
  afterEach(() => {
    loadState = "ready";
  });

  it("shows the load status, not the editor or flow, until the server copy lands", () => {
    stage = "idea";
    loadState = "loading";
    renderPage();
    expect(screen.getByText("Loading script…")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-flow")).toBeNull();
  });

  it("shows the setup flow once the script is ready", () => {
    stage = "idea";
    renderPage();
    expect(screen.getByTestId("setup-flow")).toBeInTheDocument();
  });
});
