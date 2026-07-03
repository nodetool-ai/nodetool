/**
 * @jest-environment jsdom
 */
/**
 * Tests for the top prompt bar: the visibility gate (bound document) and that
 * submitting creates a text-to-image layer and runs the direct-gen job for
 * full-frame generation.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import { ConnectedModePromptBar } from "../editor-shell/ConnectedModePromptBar";
import { useSketchStore } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";

// Heavy model picker — stub to keep model-fetching deps out of jsdom.
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => null
}));

const mockStart = jest.fn();
jest.mock("../../../hooks/sketch/useDirectGenJob", () => ({
  useDirectGenJob: () => ({ start: mockStart, cancel: jest.fn() })
}));

// useMediaOptions fetches per-model constraints via TanStack Query; these tests
// don't render a QueryClientProvider, so stub it (the bar falls back to the full
// static option lists, which is what these assertions expect).
jest.mock("../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useMediaOptions: () => ({ data: undefined })
}));

function renderBar() {
  const theme = createTheme({ cssVariables: true });
  return render(
    <ThemeProvider theme={theme}>
      <ConnectedModePromptBar />
    </ThemeProvider>
  );
}

/** Seed a direct-gen binding so the bar's model picker starts populated. */
function seedModel(): void {
  useSketchSessionStore.getState().upsertBinding({
    layerId: "seed-binding",
    kind: "text-to-image",
    prompt: "",
    provider: "fake",
    model: "flux-pro",
    sourceLayerId: null,
    status: "draft",
    versions: []
  });
}

beforeEach(() => {
  mockStart.mockReset();
  useSketchStore.setState((s) => ({
    ...s,
    panelsHidden: false
  }));
  useSketchSessionStore.setState({ documentId: null, name: "", bindings: {} });
});

describe("<ConnectedModePromptBar />", () => {
  it("renders nothing without a bound document", () => {
    const { queryByTestId } = renderBar();
    expect(queryByTestId("sketch-mode-prompt-bar")).toBeNull();
  });

  it("renders nothing when panels are hidden (chrome-less canvas)", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    useSketchStore.setState((s) => ({ ...s, panelsHidden: true }));
    const { queryByTestId } = renderBar();
    expect(queryByTestId("sketch-mode-prompt-bar")).toBeNull();
  });

  it("renders the bar and submit with a bound document", () => {
    useSketchSessionStore.setState({ documentId: "doc-1", name: "portrait" });
    const { getByTestId } = renderBar();
    expect(getByTestId("sketch-mode-prompt-bar")).toBeTruthy();
    expect(getByTestId("sketch-gen-submit")).toBeTruthy();
  });

  it("keeps submit disabled until a prompt is typed", () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    const { getByTestId, getByPlaceholderText } = renderBar();
    expect(getByTestId("sketch-gen-submit")).toBeDisabled();
    fireEvent.change(getByPlaceholderText("Describe the image…"), {
      target: { value: "a red fox" }
    });
    expect(getByTestId("sketch-gen-submit")).not.toBeDisabled();
  });

  it("runs the direct-gen job on Generate submit", async () => {
    useSketchSessionStore.setState({ documentId: "doc-1" });
    seedModel();
    const { getByTestId, getByPlaceholderText } = renderBar();
    fireEvent.change(getByPlaceholderText("Describe the image…"), {
      target: { value: "a red fox" }
    });
    fireEvent.click(getByTestId("sketch-gen-submit"));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  });
});
