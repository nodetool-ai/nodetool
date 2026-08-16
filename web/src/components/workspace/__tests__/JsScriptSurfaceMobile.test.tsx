/**
 * JsScriptSurface — mobile layout
 *
 * On a phone the editor, run console, script settings, and assistant collapse
 * to one pane behind a segmented switcher. Every pane stays mounted so Monaco's
 * model and the console output survive a switch; only one is displayed.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import JsScriptSurface from "../JsScriptSurface";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("@mui/material/useMediaQuery", () => () => true);

jest.mock("../../../hooks/jsScript/useJsScriptServerSync", () => ({
  useJsScriptServerSync: jest.fn()
}));
jest.mock("../../../hooks/jsScript/useJsScriptAgentBridge", () => ({
  useJsScriptAgentBridge: jest.fn()
}));
jest.mock("../../../hooks/useDocumentUndoShortcuts", () => ({
  useDocumentUndoShortcuts: jest.fn()
}));

jest.mock("../../jsScript/JsScriptEditorPane", () => () => (
  <div data-testid="editor-pane" />
));
jest.mock("../../jsScript/JsScriptRunConsole", () => () => (
  <div data-testid="run-console" />
));
jest.mock("../../jsScript/JsScriptSettingsPanel", () => () => (
  <div data-testid="settings-panel" />
));
jest.mock("../../jsScript/JsScriptAgentPanel", () => () => (
  <div data-testid="agent-panel" />
));

jest.mock("../../../stores/jsScript/JsScriptStore", () => ({
  useJsScriptName: () => "My script",
  useJsScriptStore: (selector: (state: unknown) => unknown) =>
    selector({
      ensureScript: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn()
    })
}));

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ setTitle: jest.fn() })
}));

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <JsScriptSurface refId="script-1" mode="edit" active />
    </ThemeProvider>
  );

/** The pane wrapper is the displayed ancestor of the mocked child. */
const paneOf = (testId: string): HTMLElement =>
  screen.getByTestId(testId).parentElement as HTMLElement;

describe("JsScriptSurface on mobile", () => {
  it("keeps every pane mounted and shows the code pane first", () => {
    renderSurface();

    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(screen.getByTestId("run-console")).toBeInTheDocument();
    expect(screen.getByTestId("settings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("agent-panel")).toBeInTheDocument();

    expect(paneOf("editor-pane")).toHaveStyle({ display: "flex" });
    expect(paneOf("run-console")).toHaveStyle({ display: "none" });
  });

  it("switches the displayed pane without unmounting the editor", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("tab", { name: /run/i }));

    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(paneOf("editor-pane")).toHaveStyle({ display: "none" });
    expect(paneOf("run-console")).toHaveStyle({ display: "flex" });
  });

  it("does not render the desktop side dock", () => {
    renderSurface();

    expect(
      screen.queryByLabelText("Resize JS script assistant")
    ).not.toBeInTheDocument();
  });
});
