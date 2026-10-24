/**
 * Given a document bar, the run console hands it the save status, Run and
 * Test, and keeps only the "Running…" state and the output.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import JsScriptRunConsole from "../JsScriptRunConsole";
import { useJsScriptStore } from "../../../stores/jsScript/JsScriptStore";
import type { DocumentBarRender } from "../../ui_primitives";

jest.mock("../../../hooks/useContextCommands", () => ({
  useContextCommands: jest.fn()
}));

const SCRIPT_ID = "bar-script";

const bar: DocumentBarRender = ({ status, actions }) => (
  <div role="toolbar" aria-label="document bar">
    {status}
    {actions}
  </div>
);

const renderConsole = (readOnly = false) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <JsScriptRunConsole
        scriptId={SCRIPT_ID}
        readOnly={readOnly}
        onRun={jest.fn()}
        onTest={jest.fn()}
        documentBar={bar}
      />
    </ThemeProvider>
  );

describe("JsScriptRunConsole in the document bar", () => {
  beforeEach(() => {
    useJsScriptStore.getState().ensureScript(SCRIPT_ID);
    useJsScriptStore.getState().setSaveStatus(SCRIPT_ID, "saved");
    useJsScriptStore.getState().setRunning(SCRIPT_ID, false);
  });

  it("draws the save status, Run and Test in the bar", () => {
    useJsScriptStore.getState().setSaveStatus(SCRIPT_ID, "unsaved");
    renderConsole();
    const toolbar = screen.getByRole("toolbar", { name: "document bar" });

    expect(toolbar).toHaveTextContent("Unsaved changes");
    expect(
      screen.getByRole("button", { name: /run/i }).closest("[role=toolbar]")
    ).toBe(toolbar);
    expect(toolbar).toHaveTextContent(/no tests/i);
  });

  it("keeps the running state in the console", () => {
    useJsScriptStore.getState().setRunning(SCRIPT_ID, true);
    renderConsole();
    const running = screen.getByText(/running/i, { selector: "p, span" });
    expect(running.closest("[role=toolbar]")).toBeNull();
  });

  it("leaves the bar to the title and mode in view mode", () => {
    renderConsole(true);
    expect(screen.getByRole("toolbar", { name: "document bar" })).toBeEmptyDOMElement();
  });
});
