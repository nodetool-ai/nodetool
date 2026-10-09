/**
 * The setup flow writes to the script store, so Cmd/Ctrl+Z on a script still
 * in setup would undo the flow itself. The document shortcuts bind only once
 * the editor shows.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { useDocumentUndoShortcuts } from "../../../hooks/useDocumentUndoShortcuts";
import ScriptSurface from "../ScriptSurface";

let stage = "idea";
jest.mock("../../setup/script/useScriptSetupFlow", () => ({
  useScriptSetupStage: () => stage,
  useScriptSetupFlow: () => ({})
}));
jest.mock("../../setup/SetupFlow", () => ({
  SetupFlow: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="setup-flow" data-readonly={String(Boolean(readOnly))} />
  )
}));
jest.mock("../../../hooks/useDocumentUndoShortcuts", () => ({
  useDocumentUndoShortcuts: jest.fn()
}));
jest.mock("../../../hooks/script/useScriptServerSync", () => ({
  useScriptServerSync: () => "ready"
}));
jest.mock("../../../hooks/script/useScriptAgentBridge", () => ({
  useScriptAgentBridge: jest.fn()
}));
jest.mock("../../../hooks/useDocumentConflicts", () => ({
  useDocumentConflicts: () => ({ items: [], accept: jest.fn(), discard: jest.fn() })
}));
jest.mock("../../script/ScriptDocumentPane", () => () => null);
jest.mock("../../script/ScriptCastPanel", () => () => null);
jest.mock("../../script/ScriptAgentPanel", () => () => null);
jest.mock("../../chat/assistant/ResizableSideDock", () => () => null);

const shortcuts = useDocumentUndoShortcuts as jest.Mock;
const lastEnabled = (): boolean | undefined =>
  shortcuts.mock.calls[shortcuts.mock.calls.length - 1][0].enabled;

const renderSurface = (mode: "edit" | "view" = "edit") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ScriptSurface refId="script-undo" mode={mode} active />
    </ThemeProvider>
  );

describe("ScriptSurface undo shortcuts", () => {
  beforeEach(() => shortcuts.mockClear());

  it("binds no document undo while the setup flow shows", () => {
    stage = "format";
    renderSurface();
    expect(lastEnabled()).toBe(false);
  });

  it("binds document undo in the editor", () => {
    stage = "done";
    renderSurface();
    expect(lastEnabled()).toBe(true);
  });
});

describe("ScriptSurface setup flow in view mode", () => {
  it("renders the setup flow read-only in a view-mode tab", () => {
    stage = "idea";
    renderSurface("view");
    expect(screen.getByTestId("setup-flow").dataset.readonly).toBe("true");
  });

  it("renders the setup flow editable in an edit-mode tab", () => {
    stage = "idea";
    renderSurface("edit");
    expect(screen.getByTestId("setup-flow").dataset.readonly).toBe("false");
  });
});
