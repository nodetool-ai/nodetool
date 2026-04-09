/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchModal from "../SketchModal";
import { useSketchStore } from "../state/useSketchStore";

const mockSketchEditorRenderState = {
  renders: 0
};

jest.mock("../SketchEditor", () => {
  const React = require("react") as typeof import("react");

  const MockSketchEditor = React.forwardRef((_props, ref) => {
    mockSketchEditorRenderState.renders += 1;
    React.useImperativeHandle(ref, () => ({
      undo: jest.fn(),
      redo: jest.fn(),
      clearLayer: jest.fn(),
      exportPng: jest.fn(),
      flipHorizontal: jest.fn(),
      flipVertical: jest.fn(),
      mergeDown: jest.fn(),
      flattenVisible: jest.fn(),
      discardToInitial: jest.fn(),
      flushPendingChanges: jest.fn()
    }));
    return <div data-testid="sketch-editor-mock">Sketch Editor Mock</div>;
  });

  return {
    __esModule: true,
    default: MockSketchEditor
  };
});

function renderModal() {
  const theme = createTheme({
    cssVariables: true
  });

  return render(
    <ThemeProvider theme={theme}>
      <SketchModal open title="Image Editor" onClose={jest.fn()} />
    </ThemeProvider>
  );
}

describe("SketchModal", () => {
  beforeEach(() => {
    mockSketchEditorRenderState.renders = 0;
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("does not rerender on unrelated viewport pan updates", () => {
    renderModal();

    expect(screen.getByTestId("sketch-editor-mock")).toBeInTheDocument();
    expect(mockSketchEditorRenderState.renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 32, y: -18 });
    });

    expect(mockSketchEditorRenderState.renders).toBe(1);
  });
});
