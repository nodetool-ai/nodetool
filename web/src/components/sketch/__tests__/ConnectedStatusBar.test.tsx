/**
 * @jest-environment jsdom
 */
/**
 * Tests for the bottom status bar: the visibility gate (bound document +
 * panels shown) and that dimensions, layer count, cursor position, and
 * selection size render from real store state.
 */

import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ConnectedStatusBar } from "../editor-shell/ConnectedStatusBar";
import { useSketchStore } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { createEmptyMask } from "../selection";

// ColorSwatch reads theme.rounded (not present in a bare test theme); its own
// behavior is covered elsewhere, so stub it to isolate the status-bar logic.
jest.mock("../../ui_primitives", () => ({
  ...jest.requireActual("../../ui_primitives"),
  ColorSwatch: () => null
}));

function renderBar() {
  return render(
    <ThemeProvider theme={createTheme({ cssVariables: true })}>
      <ConnectedStatusBar />
    </ThemeProvider>
  );
}

beforeEach(() => {
  useSketchStore.setState((s) => ({ ...s, panelsHidden: false, zoom: 1 }));
  useSketchStore.getState().setSelection(null);
  useSketchStore.getState().setCursorDocPos(null);
  useSketchSessionStore.setState({ documentId: null });
});

describe("<ConnectedStatusBar />", () => {
  it("renders nothing without a bound document", () => {
    const { queryByTestId } = renderBar();
    expect(queryByTestId("sketch-status-bar")).toBeNull();
  });

  it("renders nothing when panels are hidden", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    useSketchStore.setState((s) => ({ ...s, panelsHidden: true }));
    const { queryByTestId } = renderBar();
    expect(queryByTestId("sketch-status-bar")).toBeNull();
  });

  it("shows dimensions and layer count with a bound document", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    const { getByTestId } = renderBar();
    const bar = getByTestId("sketch-status-bar");
    const { width, height } = useSketchStore.getState().document.canvas;
    expect(bar.textContent).toContain(`${width} × ${height}`);
    expect(bar.textContent).toMatch(/layer/);
  });

  it("shows the cursor position when set", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    useSketchStore.getState().setCursorDocPos({ x: 12, y: 34 });
    const { getByTestId } = renderBar();
    expect(getByTestId("sketch-status-bar").textContent).toContain(
      "x 12, y 34"
    );
  });

  it("shows the selection size when there is an active selection", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    const { width, height } = useSketchStore.getState().document.canvas;
    const mask = createEmptyMask(width, height);
    mask.data.fill(255);
    useSketchStore.getState().setSelection(mask);
    const { getByTestId } = renderBar();
    expect(getByTestId("sketch-status-bar").textContent).toMatch(
      /selection \d+ × \d+/
    );
  });
});
