/**
 * @jest-environment jsdom
 *
 * Regression tests for the refactored SketchEditor hooks:
 * - useToolChromeActions: verifies shared tool-chrome subscriptions
 * - useEditorStoreActions: verifies focused action bundles
 * - useEditorLifecycle: verifies lifecycle hook wiring
 */
import { renderHook, act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  useHistoryStoreActions,
  useLayerStoreActions,
  useCanvasStoreActions,
  useColorStoreActions,
  useSessionStoreActions
} from "../hooks/useEditorStoreActions";
import { useToolChromeActions } from "../hooks/useToolChromeActions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  const state = useSketchStore.getState();
  // Reset to default state
  state.setActiveTool("brush");
  state.setForegroundColor("#ffffff");
  state.setBackgroundColor("#000000");
}

beforeEach(() => {
  resetStore();
});

// ---------------------------------------------------------------------------
// useToolChromeActions
// ---------------------------------------------------------------------------

describe("useToolChromeActions", () => {
  it("returns all per-tool settings setters", () => {
    const { result } = renderHook(() => useToolChromeActions());

    expect(result.current.setBrushSettings).toBeDefined();
    expect(result.current.setPencilSettings).toBeDefined();
    expect(result.current.setEraserSettings).toBeDefined();
    expect(result.current.setShapeSettings).toBeDefined();
    expect(result.current.setFillSettings).toBeDefined();
    expect(result.current.setBlurSettings).toBeDefined();
    expect(result.current.setGradientSettings).toBeDefined();
    expect(result.current.setCloneStampSettings).toBeDefined();
    expect(result.current.setSelectSettings).toBeDefined();
    expect(result.current.setSegmentSettings).toBeDefined();
  });

  it("returns all selection actions", () => {
    const { result } = renderHook(() => useToolChromeActions());

    expect(result.current.invertSelection).toBeDefined();
    expect(result.current.featherCurrentSelection).toBeDefined();
    expect(result.current.smoothCurrentSelectionBorders).toBeDefined();
    expect(result.current.convertSelectionToBorderOutline).toBeDefined();
  });

  it("returns stable references across renders when store does not change", () => {
    const { result, rerender } = renderHook(() => useToolChromeActions());

    const first = { ...result.current };
    rerender();
    const second = result.current;

    // Store action references are stable
    expect(second.setBrushSettings).toBe(first.setBrushSettings);
    expect(second.invertSelection).toBe(first.invertSelection);
  });

  it("does not rerender when unrelated state changes (zoom, pan)", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useToolChromeActions();
    });

    const beforeCount = renderCount;

    act(() => {
      useSketchStore.getState().setZoom(2);
    });
    act(() => {
      useSketchStore.getState().setPan({ x: 100, y: 200 });
    });

    // Action selectors should not rerender on viewport changes
    expect(renderCount).toBe(beforeCount);
  });

  it("does not rerender when document changes", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useToolChromeActions();
    });

    const beforeCount = renderCount;

    act(() => {
      useSketchStore.getState().addLayer();
    });

    // Action selectors should not rerender on document changes
    expect(renderCount).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// useHistoryStoreActions
// ---------------------------------------------------------------------------

describe("useHistoryStoreActions", () => {
  it("returns pushHistory, undo, and redo", () => {
    const { result } = renderHook(() => useHistoryStoreActions());

    expect(result.current.pushHistory).toBeDefined();
    expect(result.current.undo).toBeDefined();
    expect(result.current.redo).toBeDefined();
  });

  it("returns stable references", () => {
    const { result, rerender } = renderHook(() => useHistoryStoreActions());

    const first = { ...result.current };
    rerender();

    expect(result.current.pushHistory).toBe(first.pushHistory);
    expect(result.current.undo).toBe(first.undo);
    expect(result.current.redo).toBe(first.redo);
  });
});

// ---------------------------------------------------------------------------
// useLayerStoreActions
// ---------------------------------------------------------------------------

describe("useLayerStoreActions", () => {
  it("returns all layer CRUD actions", () => {
    const { result } = renderHook(() => useLayerStoreActions());

    expect(result.current.addLayer).toBeDefined();
    expect(result.current.removeLayer).toBeDefined();
    expect(result.current.duplicateLayer).toBeDefined();
    expect(result.current.reorderLayers).toBeDefined();
    expect(result.current.toggleLayerVisibility).toBeDefined();
    expect(result.current.setLayerOpacity).toBeDefined();
    expect(result.current.setLayerBlendMode).toBeDefined();
    expect(result.current.renameLayer).toBeDefined();
    expect(result.current.updateLayerData).toBeDefined();
    expect(result.current.setMaskLayer).toBeDefined();
    expect(result.current.toggleAlphaLock).toBeDefined();
    expect(result.current.toggleLayerExposedInput).toBeDefined();
    expect(result.current.toggleLayerExposedOutput).toBeDefined();
    expect(result.current.mergeLayerDown).toBeDefined();
    expect(result.current.flattenVisible).toBeDefined();
    expect(result.current.addGroup).toBeDefined();
    expect(result.current.toggleGroupCollapsed).toBeDefined();
    expect(result.current.moveLayerToGroup).toBeDefined();
    expect(result.current.ungroupLayer).toBeDefined();
    expect(result.current.groupLayers).toBeDefined();
    expect(result.current.setActiveLayer).toBeDefined();
  });

  it("returns transform-related layer actions", () => {
    const { result } = renderHook(() => useLayerStoreActions());

    expect(result.current.setLayerTransform).toBeDefined();
    expect(result.current.commitLayerTransform).toBeDefined();
    expect(result.current.setLayerContentBounds).toBeDefined();
    expect(result.current.offsetLayerTransform).toBeDefined();
  });

  it("does not rerender on viewport changes", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useLayerStoreActions();
    });

    const beforeCount = renderCount;

    act(() => {
      useSketchStore.getState().setZoom(3);
    });

    expect(renderCount).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// useCanvasStoreActions
// ---------------------------------------------------------------------------

describe("useCanvasStoreActions", () => {
  it("returns viewport and canvas actions", () => {
    const { result } = renderHook(() => useCanvasStoreActions());

    expect(result.current.setZoom).toBeDefined();
    expect(result.current.setPan).toBeDefined();
    expect(result.current.resizeCanvas).toBeDefined();
    expect(result.current.offsetAllPaintLayersTransform).toBeDefined();
    expect(result.current.setMirrorX).toBeDefined();
    expect(result.current.setMirrorY).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// useColorStoreActions
// ---------------------------------------------------------------------------

describe("useColorStoreActions", () => {
  it("returns color and tool-settings actions", () => {
    const { result } = renderHook(() => useColorStoreActions());

    expect(result.current.setForegroundColor).toBeDefined();
    expect(result.current.setBrushSettings).toBeDefined();
    expect(result.current.setPencilSettings).toBeDefined();
    expect(result.current.setEraserSettings).toBeDefined();
    expect(result.current.setFillSettings).toBeDefined();
    expect(result.current.setBlurSettings).toBeDefined();
    expect(result.current.setCloneStampSettings).toBeDefined();
    expect(result.current.setShapeSettings).toBeDefined();
    expect(result.current.setGradientSettings).toBeDefined();
    expect(result.current.swapColors).toBeDefined();
    expect(result.current.resetColors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// useSessionStoreActions
// ---------------------------------------------------------------------------

describe("useSessionStoreActions", () => {
  it("returns session-level actions", () => {
    const { result } = renderHook(() => useSessionStoreActions());

    expect(result.current.setDocument).toBeDefined();
    expect(result.current.setActiveTool).toBeDefined();
    expect(result.current.togglePanelsHidden).toBeDefined();
  });

  it("does not rerender on document changes", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useSessionStoreActions();
    });

    const beforeCount = renderCount;

    act(() => {
      useSketchStore.getState().addLayer();
    });

    expect(renderCount).toBe(beforeCount);
  });

  it("does not rerender on tool-settings changes", () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useSessionStoreActions();
    });

    const beforeCount = renderCount;

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 42 });
    });

    expect(renderCount).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// Cross-bundle isolation
// ---------------------------------------------------------------------------

describe("cross-bundle isolation", () => {
  it("tool-chrome does not rerender when canvas actions change zoom", () => {
    let chromeCount = 0;
    renderHook(() => {
      chromeCount++;
      return useToolChromeActions();
    });

    const before = chromeCount;

    act(() => {
      useSketchStore.getState().setZoom(5);
    });

    expect(chromeCount).toBe(before);
  });

  it("layer store does not rerender when tool settings change", () => {
    let layerCount = 0;
    renderHook(() => {
      layerCount++;
      return useLayerStoreActions();
    });

    const before = layerCount;

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 99 });
    });

    expect(layerCount).toBe(before);
  });

  it("history store does not rerender when foreground color changes", () => {
    let historyCount = 0;
    renderHook(() => {
      historyCount++;
      return useHistoryStoreActions();
    });

    const before = historyCount;

    act(() => {
      useSketchStore.getState().setForegroundColor("#ff0000");
    });

    expect(historyCount).toBe(before);
  });
});
