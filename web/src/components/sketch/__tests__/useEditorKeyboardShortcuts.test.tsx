/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import {
  useEditorKeyboardShortcuts,
  type UseEditorKeyboardShortcutsParams
} from "../useEditorKeyboardShortcuts";
import { useSketchStore } from "../state";

function makeParams(): UseEditorKeyboardShortcutsParams {
  return {
    handleUndo: jest.fn(),
    handleRedo: jest.fn(),
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleZoomReset: jest.fn(),
    handleExportPng: jest.fn(),
    handleClearLayer: jest.fn(),
    handleFillLayerWithColor: jest.fn(),
    handleCopy: jest.fn(),
    handleCut: jest.fn(),
    handlePaste: jest.fn(async () => {}),
    handleNudgeLayer: jest.fn(),
    syncSketchOutputsNow: jest.fn(),
    setActiveTool: jest.fn(),
    setZoom: jest.fn(),
    setMirrorX: jest.fn(),
    setMirrorY: jest.fn(),
    setBrushSettings: jest.fn(),
    setPencilSettings: jest.fn(),
    setEraserSettings: jest.fn(),
    setShapeSettings: jest.fn(),
    setBlurSettings: jest.fn(),
    setCloneStampSettings: jest.fn(),
    swapColors: jest.fn(),
    resetColors: jest.fn(),
    togglePanelsHidden: jest.fn(),
    cancelActiveTool: jest.fn(),
    handleInvertLayerColors: jest.fn(),
    handleTransformCommit: jest.fn(),
    handleTransformCancel: jest.fn(),
    handleTransformUndo: jest.fn(),
    handleTransformRedo: jest.fn(),
    handleLayerViaCopy: jest.fn(),
    handleLayerViaCut: jest.fn(),
    handleFreeTransform: jest.fn()
  };
}

function dispatchKey(target: EventTarget, key: string, type: "keydown" | "keyup" = "keydown"): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

describe("useEditorKeyboardShortcuts", () => {
  beforeEach(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.getState().setActiveTool("brush");
    useSketchStore.getState().setTransientMoveModifierHeld(false);
    document.body.innerHTML = "";
  });

  it("does not steal ArrowDown from focused sketch combobox controls", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const root = document.createElement("div");
    root.className = "sketch-editor";
    const combobox = document.createElement("div");
    combobox.setAttribute("role", "combobox");
    combobox.tabIndex = 0;
    root.appendChild(combobox);
    document.body.appendChild(root);
    combobox.focus();

    const keydown = dispatchKey(combobox, "ArrowDown");
    const keyup = dispatchKey(combobox, "ArrowDown", "keyup");

    expect(keydown.defaultPrevented).toBe(false);
    expect(keyup.defaultPrevented).toBe(false);
    expect(params.handleNudgeLayer).not.toHaveBeenCalled();
    expect(params.syncSketchOutputsNow).not.toHaveBeenCalled();
  });

  it("still nudges when arrows are pressed on the sketch surface", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const root = document.createElement("div");
    root.className = "sketch-editor";
    const surface = document.createElement("div");
    surface.tabIndex = 0;
    root.appendChild(surface);
    document.body.appendChild(root);
    surface.focus();

    let keydown!: KeyboardEvent;
    let keyup!: KeyboardEvent;
    act(() => {
      keydown = dispatchKey(surface, "ArrowDown");
      keyup = dispatchKey(surface, "ArrowDown", "keyup");
    });

    expect(keydown.defaultPrevented).toBe(true);
    expect(keyup.defaultPrevented).toBe(true);
    expect(params.handleNudgeLayer).toHaveBeenCalledWith(0, 1, {
      recordHistory: true,
      syncOutputs: false
    });
    expect(params.syncSketchOutputsNow).toHaveBeenCalled();
  });

  it("routes Ctrl+T through handleFreeTransform", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const event = new KeyboardEvent("keydown", {
      key: "t",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(params.handleFreeTransform).toHaveBeenCalledTimes(1);
    expect(params.setActiveTool).not.toHaveBeenCalledWith("transform");
  });
});
