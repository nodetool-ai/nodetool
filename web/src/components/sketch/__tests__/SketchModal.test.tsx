/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import SketchModal from "../SketchModal";
import { useSketchStore } from "../state/useSketchStore";

const mockSketchEditorRenderState = {
  renders: 0,
  suspendKeyboardShortcuts: undefined as boolean | undefined
};

jest.mock("../SketchEditor", () => {
  const React = require("react") as typeof import("react");

  const MockSketchEditor = React.forwardRef(
    (props: { suspendKeyboardShortcuts?: boolean }, ref) => {
    mockSketchEditorRenderState.renders += 1;
    mockSketchEditorRenderState.suspendKeyboardShortcuts =
      props.suspendKeyboardShortcuts;
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
    }
  );

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

  it("pauses editor shortcuts and focuses Cancel while confirming a discard", () => {
    renderModal();
    expect(mockSketchEditorRenderState.suspendKeyboardShortcuts).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(mockSketchEditorRenderState.suspendKeyboardShortcuts).toBe(true);
    const cancel = screen.getByRole("button", { name: "Cancel discard" });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(cancel, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "Cancel discard" })).toBeNull();
    expect(mockSketchEditorRenderState.suspendKeyboardShortcuts).toBe(false);
  });
});
