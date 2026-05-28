/**
 * @jest-environment jsdom
 */
/**
 * Render tests for the floating selection action bar.
 *
 * Verifies the visibility gate (selection + bound document) and that the
 * Remove button is wired to the canvas-ref store's clearActiveLayer getter.
 * Exact pixel positioning is not asserted — the docToCss math mirrors the
 * TransformGizmo, which has its own coverage.
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { SelectionActionBar } from "../SelectionActionBar";
import { useSketchStore } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../../stores/sketch/SketchCanvasRefStore";
import { createEmptyMask } from "../selection";

// Avoid pulling the real inpaint hook (trpc + image-editor deps) into jsdom.
jest.mock("../../../hooks/sketch/useInpaintHere", () => ({
  useInpaintHere: () => ({ inpaintHere: jest.fn(), isBusy: false })
}));

class StubResizeObserver implements ResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
(
  globalThis as unknown as { ResizeObserver: typeof ResizeObserver }
).ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;

function containerRef(): React.RefObject<HTMLDivElement | null> {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
  return { current: el };
}

function renderBar(ref: React.RefObject<HTMLDivElement | null>) {
  const theme = createTheme({ cssVariables: true });
  return render(
    <ThemeProvider theme={theme}>
      <SelectionActionBar containerRef={ref} />
    </ThemeProvider>
  );
}

function selectAll(): void {
  const { width, height } = useSketchStore.getState().document.canvas;
  const mask = createEmptyMask(width, height);
  mask.data.fill(255);
  useSketchStore.getState().setSelection(mask);
}

beforeEach(() => {
  useSketchStore.setState((s) => ({
    ...s,
    activeTool: "select",
    zoom: 1,
    pan: { x: 0, y: 0 }
  }));
  useSketchStore.getState().setSelection(null);
  useSketchSessionStore.setState({ documentId: null });
  useSketchCanvasRefStore.getState().clearGetters();
});

describe("<SelectionActionBar />", () => {
  it("renders nothing without an active selection", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    const { queryByTestId } = renderBar(containerRef());
    expect(queryByTestId("sketch-selection-action-bar")).toBeNull();
  });

  it("renders nothing when there is a selection but no bound document", () => {
    selectAll();
    const { queryByTestId } = renderBar(containerRef());
    expect(queryByTestId("sketch-selection-action-bar")).toBeNull();
  });

  it("renders the three actions with an active selection and a document", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    selectAll();
    const { getByTestId } = renderBar(containerRef());
    expect(getByTestId("sketch-selection-action-bar")).toBeTruthy();
    expect(getByTestId("sketch-selection-generative-fill")).toBeTruthy();
    expect(getByTestId("sketch-selection-remove")).toBeTruthy();
    expect(getByTestId("sketch-selection-refine-edge")).toBeTruthy();
  });

  it("Remove invokes the registered clearActiveLayer getter", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    const clearActiveLayer = jest.fn();
    useSketchCanvasRefStore.getState().setGetters({
      flattenToDataUrl: () => "",
      getMaskDataUrl: () => null,
      setLayerData: () => {},
      clearActiveLayer
    });
    selectAll();

    const { getByTestId } = renderBar(containerRef());
    fireEvent.click(getByTestId("sketch-selection-remove"));
    expect(clearActiveLayer).toHaveBeenCalledTimes(1);
  });
});
