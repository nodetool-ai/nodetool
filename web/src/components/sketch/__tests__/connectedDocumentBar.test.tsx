/**
 * @jest-environment jsdom
 */
/**
 * The sketch editor's document bar slots: status and Undo/Redo, the
 * assistant in View, and the host's primary action before the ⋮ menu.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ConnectedDocumentBar } from "../editor-shell/ConnectedDocumentBar";
import { DocumentBar, EditorButton } from "../../ui_primitives";

describe("ConnectedDocumentBar", () => {
  it("fills the bar's slots from the editor", async () => {
    const user = userEvent.setup();
    const onUndo = jest.fn();
    render(
      <ThemeProvider theme={createTheme({ cssVariables: true })}>
        <ConnectedDocumentBar
          render={(slots) => <DocumentBar title="Poster" {...slots} />}
          onUndo={onUndo}
          onRedo={jest.fn()}
          inlineActions={<EditorButton variant="contained">Save to image</EditorButton>}
        />
      </ThemeProvider>
    );

    const bar = screen.getByRole("toolbar", { name: "Poster document" });
    expect(bar).toHaveTextContent("Saved");
    expect(within(bar).getByTestId("sketch-assistant-toggle")).toBeTruthy();
    expect(
      within(bar).getByRole("button", { name: "Save to image" })
    ).toBeTruthy();
    expect(within(bar).getByRole("button", { name: /undo/i })).toBeDisabled();

    await user.click(within(bar).getByTestId("sketch-editor-menu"));
    expect(screen.getByTestId("sketch-fit-view")).toBeTruthy();
  });
});
