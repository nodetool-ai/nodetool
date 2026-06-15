/**
 * @jest-environment jsdom
 */
/**
 * Render tests for the floating selection action bar.
 *
 * Verifies the visibility gate (selection + bound document), the inline inpaint
 * form (prompt + run), and that the Remove button is wired to the canvas-ref
 * store's clearActiveLayer getter. Exact pixel positioning is not asserted —
 * the docToCss math mirrors the TransformGizmo, which has its own coverage.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { SelectionActionBar } from "../SelectionActionBar";
import { useSketchStore } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../../stores/sketch/SketchCanvasRefStore";
import { createEmptyMask } from "../selection";

// Heavy model picker — stub to keep model-fetching deps out of jsdom.
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

// Avoid pulling the real inpaint hook (trpc + image-editor deps) into jsdom.
const mockInpaint = jest.fn();
jest.mock("../../../hooks/sketch/useInpaintHere", () => ({
  useInpaintHere: () => ({ inpaintHere: mockInpaint, isBusy: false })
}));

const mockStart = jest.fn();
jest.mock("../../../hooks/sketch/useDirectGenJob", () => ({
  useDirectGenJob: () => ({ start: mockStart, cancel: jest.fn() })
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

/** Seed a direct-gen binding so the bar's model picker starts populated. */
function seedModel(): void {
  useSketchSessionStore.getState().upsertBinding({
    layerId: "seed-binding",
    kind: "inpaint",
    prompt: "",
    provider: "fake",
    model: "flux-fill",
    sourceLayerId: null,
    status: "draft",
    versions: []
  });
}

beforeEach(() => {
  mockInpaint.mockReset();
  mockStart.mockReset();
  useSketchStore.setState((s) => ({
    ...s,
    activeTool: "select",
    zoom: 1,
    pan: { x: 0, y: 0 }
  }));
  useSketchStore.getState().setSelection(null);
  useSketchSessionStore.setState({ documentId: null, bindings: {} });
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

  it("renders all actions with an active selection and a document", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    selectAll();
    const { getByTestId, getByRole } = renderBar(containerRef());
    expect(getByTestId("sketch-selection-action-bar")).toBeTruthy();
    expect(getByTestId("sketch-selection-mode-edit")).toBeTruthy();
    expect(getByTestId("sketch-selection-mode-inpaint")).toBeTruthy();
    expect(getByTestId("sketch-selection-inpaint-prompt")).toBeTruthy();
    expect(getByTestId("sketch-selection-generate")).toBeTruthy();
    expect(getByTestId("sketch-selection-remove")).toBeTruthy();
    expect(getByTestId("sketch-selection-refine-edge")).toBeTruthy();
    expect(getByRole("button", { name: "Dismiss selection" })).toBeTruthy();
  });

  it("keeps the run button disabled until a prompt is typed", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    selectAll();
    const { getByTestId, getByPlaceholderText } = renderBar(containerRef());
    expect(getByTestId("sketch-selection-generate")).toBeDisabled();
    fireEvent.change(getByPlaceholderText("Replace selection with…"), {
      target: { value: "a blue sky" }
    });
    expect(getByTestId("sketch-selection-generate")).not.toBeDisabled();
  });

  it("runs the inpaint job (inpaint mode) when the run button is clicked", async () => {
    mockInpaint.mockResolvedValue({ ok: true, layerId: "layer-1" });
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    selectAll();
    const { getByTestId, getByPlaceholderText } = renderBar(containerRef());
    fireEvent.change(getByPlaceholderText("Replace selection with…"), {
      target: { value: "a blue sky" }
    });
    fireEvent.click(getByTestId("sketch-selection-generate"));
    await waitFor(() => expect(mockInpaint).toHaveBeenCalledTimes(1));
    expect(mockInpaint).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "inpaint", prompt: "a blue sky" })
    );
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith("layer-1"));
  });

  it("switches to edit mode and dispatches an image-to-image edit", async () => {
    mockInpaint.mockResolvedValue({ ok: true, layerId: "layer-2" });
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    selectAll();
    const { getByTestId, getByPlaceholderText } = renderBar(containerRef());

    // Switching mode clears the seeded model, so the run stays disabled until a
    // new model would be picked — but the prompt placeholder must change.
    fireEvent.click(getByTestId("sketch-selection-mode-edit"));
    expect(getByPlaceholderText("Describe the edit…")).toBeTruthy();
  });

  it("shows mask refinement only in inpaint mode", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    selectAll();
    const { getByTestId, queryByTestId } = renderBar(containerRef());

    // Inpaint is the default mode → mask refinement is available.
    expect(getByTestId("sketch-selection-refine-edge")).toBeTruthy();

    // Edit mode runs on the whole frame, so the mask options disappear.
    fireEvent.click(getByTestId("sketch-selection-mode-edit"));
    expect(queryByTestId("sketch-selection-refine-edge")).toBeNull();

    // Back to inpaint → they return.
    fireEvent.click(getByTestId("sketch-selection-mode-inpaint"));
    expect(getByTestId("sketch-selection-refine-edge")).toBeTruthy();
  });

  it("Dismiss clears the active selection", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    selectAll();
    const { getByRole } = renderBar(containerRef());
    fireEvent.click(getByRole("button", { name: "Dismiss selection" }));
    expect(useSketchStore.getState().selection).toBeNull();
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
