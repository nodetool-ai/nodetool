/**
 * @jest-environment jsdom
 *
 * Regression tests for store subscription boundaries (passes 1-4+).
 *
 * These tests verify that connected shell components only re-render when
 * the store slices they subscribe to change, and that unrelated state
 * mutations do NOT cause unnecessary re-renders.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  useResolvedToolSettings,
  useActiveToolSettings
} from "../hooks/useSketchStoreSelectors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate a minimal "connected component" that subscribes like ConnectedToolbar. */
function useToolbarSelectors() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  const backgroundColor = useSketchStore((s) => s.backgroundColor);
  return { activeTool, foregroundColor, backgroundColor };
}

/** Simulate ConnectedToolTopBar (updated: uses hasActiveSelection boolean). */
function useToolTopBarSelectors() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettings = useResolvedToolSettings();
  return { activeTool, panelsHidden, hasActiveSelection, toolSettings };
}

/** Simulate ConnectedLayersPanel (updated: uses narrow document sub-field selectors). */
function useLayersPanelSelectors() {
  const layers = useSketchStore((s) => s.document.layers);
  const activeLayerId = useSketchStore((s) => s.document.activeLayerId);
  const maskLayerId = useSketchStore((s) => s.document.maskLayerId);
  const canvasWidth = useSketchStore((s) => s.document.canvas.width);
  const canvasHeight = useSketchStore((s) => s.document.canvas.height);
  const selectedLayerIds = useSketchStore((s) => s.selectedLayerIds);
  const isolatedLayerId = useSketchStore((s) => s.isolatedLayerId);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  return {
    layers,
    activeLayerId,
    maskLayerId,
    canvasWidth,
    canvasHeight,
    selectedLayerIds,
    isolatedLayerId,
    panelsHidden
  };
}

/** Simulate SketchCanvasPane's direct subscriptions. */
function useCanvasPaneSelectors() {
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const mirrorX = useSketchStore((s) => s.mirrorX);
  const mirrorY = useSketchStore((s) => s.mirrorY);
  const selection = useSketchStore((s) => s.selection);
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  return { zoom, pan, mirrorX, mirrorY, selection, foregroundColor };
}

/** Simulate ConnectedContextMenu (updated: uses hasActiveSelection boolean). */
function useContextMenuSelectors() {
  const activeTool = useSketchStore((s) => s.activeTool);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettings = useResolvedToolSettings();
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  const backgroundColor = useSketchStore((s) => s.backgroundColor);
  return { activeTool, hasActiveSelection, toolSettings, foregroundColor, backgroundColor };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

// ---------------------------------------------------------------------------
// Pass 1: ConnectedToolbar isolation
// ---------------------------------------------------------------------------

describe("ConnectedToolbar isolation (pass 1)", () => {
  it("does NOT rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolbarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(2.5);
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when pan changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolbarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 100, y: -50 });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when selection changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolbarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setSelection({
        width: 100,
        height: 100,
        data: new Uint8ClampedArray(100 * 100)
      });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when toolSettings change", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolbarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 42 });
    });
    expect(renders).toBe(1);
  });

  it("DOES rerender when activeTool changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolbarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setActiveTool("pencil");
    });
    expect(renders).toBe(2);
  });

  it("DOES rerender when foregroundColor changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolbarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setForegroundColor("#ff0000");
    });
    expect(renders).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pass 1: ConnectedToolTopBar isolation
// ---------------------------------------------------------------------------

describe("ConnectedToolTopBar isolation (pass 1)", () => {
  it("does NOT rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolTopBarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(3);
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when pan changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolTopBarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 50, y: 50 });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when foregroundColor changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolTopBarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setForegroundColor("#00ff00");
    });
    expect(renders).toBe(1);
  });

  it("DOES rerender when toolSettings change", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolTopBarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 99 });
    });
    expect(renders).toBe(2);
  });

  it("DOES rerender when activeTool changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolTopBarSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setActiveTool("eraser");
    });
    expect(renders).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pass 2: ConnectedLayersPanel isolation
// ---------------------------------------------------------------------------

describe("ConnectedLayersPanel isolation (pass 2)", () => {
  it("does NOT rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(0.5);
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when pan changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: -10, y: 20 });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when selection changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setSelection({
        width: 50,
        height: 50,
        data: new Uint8ClampedArray(50 * 50)
      });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when toolSettings change", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 12 });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when foregroundColor changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setForegroundColor("#0000ff");
    });
    expect(renders).toBe(1);
  });

  it("DOES rerender when panelsHidden changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().togglePanelsHidden();
    });
    expect(renders).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pass 2: SketchCanvasPane isolation
// ---------------------------------------------------------------------------

describe("SketchCanvasPane isolation (pass 2)", () => {
  it("does NOT rerender when toolSettings change", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCanvasPaneSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 77 });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when panelsHidden changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCanvasPaneSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().togglePanelsHidden();
    });
    expect(renders).toBe(1);
  });

  it("DOES rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCanvasPaneSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(1.5);
    });
    expect(renders).toBe(2);
  });

  it("DOES rerender when pan changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCanvasPaneSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 10, y: 10 });
    });
    expect(renders).toBe(2);
  });

  it("DOES rerender when selection changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCanvasPaneSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setSelection({
        width: 200,
        height: 200,
        data: new Uint8ClampedArray(200 * 200)
      });
    });
    expect(renders).toBe(2);
  });

  it("DOES rerender when mirrorX changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCanvasPaneSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setMirrorX(true);
    });
    expect(renders).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// useResolvedToolSettings memoisation
// ---------------------------------------------------------------------------

describe("useResolvedToolSettings memoisation", () => {
  it("returns the same reference when toolSettings have not changed", () => {
    const refs: unknown[] = [];

    renderHook(() => {
      refs.push(useResolvedToolSettings());
    });

    expect(refs.length).toBe(1);

    // Trigger an unrelated store change (zoom)
    act(() => {
      useSketchStore.getState().setZoom(4);
    });

    // useResolvedToolSettings should NOT have run (no new render for zoom)
    // but even if it did, the result should be referentially stable.
    // Since it's a separate subscription it won't even trigger.
    expect(refs.length).toBe(1);
  });

  it("returns a new reference when toolSettings change", () => {
    const refs: unknown[] = [];

    const { rerender } = renderHook(() => {
      refs.push(useResolvedToolSettings());
    });

    const initialRef = refs[0];

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 50 });
    });

    // Force a rerender to pick up the new value
    rerender();

    // The latest reference should differ because toolSettings changed
    expect(refs[refs.length - 1]).not.toBe(initialRef);
  });
});

// ---------------------------------------------------------------------------
// Document split hardening (Item 2): ConnectedLayersPanel narrow selectors
// ---------------------------------------------------------------------------

describe("ConnectedLayersPanel narrow document selectors", () => {
  it("does NOT rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(0.5);
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when selection changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setSelection({
        width: 50,
        height: 50,
        data: new Uint8ClampedArray(50 * 50).fill(255)
      });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when toolSettings change", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setBrushSettings({ size: 42 });
    });
    expect(renders).toBe(1);
  });

  it("DOES rerender when panelsHidden changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useLayersPanelSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().togglePanelsHidden();
    });
    expect(renders).toBe(2);
  });

  it("returns narrow fields that match the full document", () => {
    const { result } = renderHook(() => useLayersPanelSelectors());
    const doc = useSketchStore.getState().document;

    expect(result.current.layers).toBe(doc.layers);
    expect(result.current.activeLayerId).toBe(doc.activeLayerId);
    expect(result.current.maskLayerId).toBe(doc.maskLayerId);
    expect(result.current.canvasWidth).toBe(doc.canvas.width);
    expect(result.current.canvasHeight).toBe(doc.canvas.height);
  });
});

// ---------------------------------------------------------------------------
// Selection split hardening (Item 3): hasActiveSelection boolean
// ---------------------------------------------------------------------------

describe("hasActiveSelection cached boolean", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().setSelection(null);
    });
  });

  it("is false by default", () => {
    expect(useSketchStore.getState().hasActiveSelection).toBe(false);
  });

  it("becomes true when a selection with pixels is set", () => {
    act(() => {
      const mask = new Uint8ClampedArray(100);
      mask[0] = 255;
      useSketchStore.getState().setSelection({ width: 10, height: 10, data: mask });
    });
    expect(useSketchStore.getState().hasActiveSelection).toBe(true);
  });

  it("becomes false when selection is cleared", () => {
    act(() => {
      const mask = new Uint8ClampedArray(100);
      mask[0] = 255;
      useSketchStore.getState().setSelection({ width: 10, height: 10, data: mask });
    });
    expect(useSketchStore.getState().hasActiveSelection).toBe(true);

    act(() => {
      useSketchStore.getState().setSelection(null);
    });
    expect(useSketchStore.getState().hasActiveSelection).toBe(false);
  });

  it("is true after selectAll", () => {
    act(() => {
      useSketchStore.getState().selectAll();
    });
    expect(useSketchStore.getState().hasActiveSelection).toBe(true);
  });

  it("ConnectedToolTopBar does NOT rerender on full selection mask changes when hasActiveSelection stays the same", () => {
    // First set a selection
    act(() => {
      const mask = new Uint8ClampedArray(100);
      mask[0] = 255;
      useSketchStore.getState().setSelection({ width: 10, height: 10, data: mask });
    });

    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToolTopBarSelectors();
    });
    expect(renders).toBe(1);

    // Set a different selection (hasActiveSelection stays true)
    act(() => {
      const mask = new Uint8ClampedArray(200);
      mask[0] = 255;
      mask[100] = 128;
      useSketchStore.getState().setSelection({ width: 20, height: 10, data: mask });
    });
    // Should NOT rerender because hasActiveSelection is still true (boolean didn't change)
    expect(renders).toBe(1);
  });

  it("ConnectedContextMenu does NOT rerender on full selection mask changes when hasActiveSelection stays the same", () => {
    act(() => {
      const mask = new Uint8ClampedArray(100);
      mask[0] = 255;
      useSketchStore.getState().setSelection({ width: 10, height: 10, data: mask });
    });

    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useContextMenuSelectors();
    });
    expect(renders).toBe(1);

    act(() => {
      const mask = new Uint8ClampedArray(200);
      mask[0] = 255;
      useSketchStore.getState().setSelection({ width: 20, height: 10, data: mask });
    });
    expect(renders).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tool-settings split hardening (Item 4): useActiveToolSettings
// ---------------------------------------------------------------------------

describe("useActiveToolSettings isolation", () => {
  it("does NOT rerender when zoom changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveToolSettings();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setZoom(3);
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when pan changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveToolSettings();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setPan({ x: 100, y: 100 });
    });
    expect(renders).toBe(1);
  });

  it("does NOT rerender when selection changes", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveToolSettings();
    });
    expect(renders).toBe(1);

    act(() => {
      useSketchStore.getState().setSelection({
        width: 10,
        height: 10,
        data: new Uint8ClampedArray(100).fill(255)
      });
    });
    expect(renders).toBe(1);
  });

  it("returns settings for the active tool", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("brush");
    });
    const { result } = renderHook(() => useActiveToolSettings());
    expect(result.current).toBeTruthy();
    expect(result.current).toHaveProperty("size");
  });

  it("returns null for tools without dedicated settings", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("move");
    });
    const { result } = renderHook(() => useActiveToolSettings());
    expect(result.current).toBeNull();
  });
});
