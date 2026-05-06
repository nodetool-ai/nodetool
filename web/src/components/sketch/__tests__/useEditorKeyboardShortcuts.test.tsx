/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import {
  useEditorKeyboardShortcuts,
  type UseEditorKeyboardShortcutsParams
} from "../useEditorKeyboardShortcuts";
import { useSketchStore } from "../state";
import { isMac } from "../shortcuts";

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
    setBrushSettings: jest.fn(),
    setPencilSettings: jest.fn(),
    setEraserSettings: jest.fn(),
    setShapeSettings: jest.fn(),
    setBlurSettings: jest.fn(),
    setCloneStampSettings: jest.fn(),
    setSelectSettings: jest.fn(),
    swapColors: jest.fn(),
    resetColors: jest.fn(),
    togglePanelsHidden: jest.fn(),
    cancelActiveTool: jest.fn(),
    handleCropCommit: jest.fn(),
    handleInvertLayerColors: jest.fn(),
    handleTransformCommit: jest.fn(),
    handleTransformCancel: jest.fn(),
    handleTransformUndo: jest.fn(),
    handleTransformRedo: jest.fn(),
    handleLayerViaCopy: jest.fn(),
    handleLayerViaCut: jest.fn(),
    handleFreeTransform: jest.fn(),
    handleRepeatLastTransform: jest.fn(),
    handleRepeatLastTransformOnCopy: jest.fn()
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

function createPrimaryModifierKeydownEvent(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    code: isMac() ? "MetaLeft" : "ControlLeft",
    key: isMac() ? "Meta" : "Control",
    bubbles: true,
    cancelable: true
  });
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

  it("nudges by 10 pixels when Shift is held", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const root = document.createElement("div");
    root.className = "sketch-editor";
    const surface = document.createElement("div");
    surface.tabIndex = 0;
    root.appendChild(surface);
    document.body.appendChild(root);
    surface.focus();

    act(() => {
      dispatchKey(surface, "Shift");
      dispatchKey(surface, "ArrowRight");
      dispatchKey(surface, "ArrowRight", "keyup");
      dispatchKey(surface, "Shift", "keyup");
    });

    expect(params.handleNudgeLayer).toHaveBeenCalledWith(10, 0, {
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

  it("routes Ctrl+Shift+T through repeat last transform", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const event = new KeyboardEvent("keydown", {
      key: "t",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(params.handleRepeatLastTransform).toHaveBeenCalledTimes(1);
    expect(params.handleRepeatLastTransformOnCopy).not.toHaveBeenCalled();
  });

  it("routes Ctrl+Alt+Shift+T through repeat transform on copy", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const event = new KeyboardEvent("keydown", {
      key: "t",
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(params.handleRepeatLastTransformOnCopy).toHaveBeenCalledTimes(1);
    expect(params.handleRepeatLastTransform).not.toHaveBeenCalled();
  });

  it("calls handleCropCommit on Enter when crop tool is active", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    act(() => {
      useSketchStore.getState().setActiveTool("crop");
    });

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(params.handleCropCommit).toHaveBeenCalledTimes(1);
  });

  it("does not arm spring-loaded move when the primary modifier is pressed while select tool is active", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    act(() => {
      useSketchStore.getState().setActiveTool("select");
    });

    const event = createPrimaryModifierKeydownEvent();
    act(() => {
      window.dispatchEvent(event);
    });

    expect(useSketchStore.getState().transientMoveModifierHeld).toBe(false);
  });

  it("arms spring-loaded move on the primary modifier and clears it on window blur", () => {
    const params = makeParams();
    renderHook(() => useEditorKeyboardShortcuts(params));

    const event = createPrimaryModifierKeydownEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(useSketchStore.getState().transientMoveModifierHeld).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(useSketchStore.getState().transientMoveModifierHeld).toBe(false);
  });
});
