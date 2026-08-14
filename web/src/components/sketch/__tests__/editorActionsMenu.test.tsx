/**
 * @jest-environment jsdom
 */
/**
 * The tool bar's overflow menu: the editor-wide entries render, host-supplied
 * entries are appended, and nothing trips MUI's "Menu doesn't accept a Fragment
 * as a child" warning (the page-load smoke test fails on any console error).
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ConnectedEditorActions } from "../editor-shell/ConnectedEditorActions";
import { EditorMenuItem } from "../../ui_primitives";
import { useSketchStore } from "../state";

function renderActions(menuItems?: (close: () => void) => React.ReactNode[]) {
  return render(
    <ThemeProvider theme={createTheme({ cssVariables: true })}>
      <ConnectedEditorActions menuItems={menuItems} />
    </ThemeProvider>
  );
}

describe("editor actions menu", () => {
  it("opens the menu with the editor-wide entries", async () => {
    const user = userEvent.setup();
    renderActions();

    expect(screen.getByTestId("sketch-assistant-toggle")).toBeTruthy();

    await user.click(screen.getByTestId("sketch-editor-menu"));

    expect(screen.getByTestId("sketch-fit-view")).toBeTruthy();
    await user.click(screen.getByTestId("sketch-hide-panels"));
    expect(useSketchStore.getState().panelsHidden).toBe(true);
    useSketchStore.setState((s) => ({ ...s, panelsHidden: false }));
  });

  it("appends host entries without a Fragment child warning", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    const onHostAction = jest.fn();

    renderActions((close) => [
      <EditorMenuItem
        key="host"
        onClick={() => {
          close();
          onHostAction();
        }}
        data-testid="host-action"
      >
        Host action
      </EditorMenuItem>
    ]);

    await user.click(screen.getByTestId("sketch-editor-menu"));
    await user.click(screen.getByTestId("host-action"));

    expect(onHostAction).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
