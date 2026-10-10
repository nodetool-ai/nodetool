/**
 * @jest-environment jsdom
 */
import type { RefObject } from "react";
import { stub } from "../../../test-utils/doubles";
import { act, renderHook } from "@testing-library/react";
import { useCanvasGeometryActions } from "../hooks/useCanvasGeometryActions";
import type { SketchCanvasRef } from "../SketchCanvas";
import { useSketchStore } from "../state/useSketchStore";

function makeParams() {
  const store = useSketchStore.getState();
  return {
    canvasRef: stub<RefObject<SketchCanvasRef | null>>({
      current: {
        cropCanvas: jest.fn(),
        getLayerData: jest.fn((layerId: string) => {
          const layer = useSketchStore
            .getState()
            .document.layers.find((entry) => entry.id === layerId);
          return layer?.data ?? null;
        })
      }
    }),
    document: store.document,
    pushHistory: store.pushHistory,
    updateLayerData: store.updateLayerData,
    setZoom: store.setZoom,
    setPan: store.setPan,
    resizeCanvas: store.resizeCanvas,
    offsetAllPaintLayersTransform: store.offsetAllPaintLayersTransform,
    commitPixelLayerChange: jest.fn(),
    syncPixelLayerFromCanvas: jest.fn(),
    reconcileAllLayerTransforms: jest.fn(),
    syncSketchOutputsNow: jest.fn()
  };
}

describe("useCanvasGeometryActions history integration", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });
  });

  it("captures resize history as the post-resize state for single-step redo", () => {
    act(() => {
      useSketchStore.getState().pushHistory("initial");
    });

    const { result } = renderHook(() => useCanvasGeometryActions(makeParams()));

    act(() => {
      result.current.handleCanvasResize(640, 480);
    });

    expect(useSketchStore.getState().document.canvas).toEqual({
      width: 640,
      height: 480,
      backgroundColor: "#000000"
    });

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(useSketchStore.getState().document.canvas.width).toBe(512);

    act(() => {
      useSketchStore.getState().redo();
    });
    expect(useSketchStore.getState().document.canvas.width).toBe(640);
    const history = useSketchStore.getState().history;
    expect(history[history.length - 1]?.documentCanvas.width).toBe(640);
  });

  it("captures crop history as the post-crop state for single-step redo", () => {
    const activeLayerId = useSketchStore.getState().document.activeLayerId;

    act(() => {
      useSketchStore.getState().updateLayerData(activeLayerId, "cropped-layer");
      useSketchStore.getState().pushHistory("initial");
    });

    const { result } = renderHook(() => useCanvasGeometryActions(makeParams()));

    act(() => {
      result.current.handleCropComplete(16, 12, 128, 96);
    });

    let state = useSketchStore.getState();
    expect(state.document.canvas).toEqual({
      width: 128,
      height: 96,
      backgroundColor: "#000000"
    });
    expect(state.document.layers[0].contentBounds).toEqual({
      x: 0,
      y: 0,
      width: 128,
      height: 96
    });

    act(() => {
      useSketchStore.getState().undo();
    });
    state = useSketchStore.getState();
    expect(state.document.canvas.width).toBe(512);

    act(() => {
      useSketchStore.getState().redo();
    });
    state = useSketchStore.getState();
    expect(state.document.canvas.width).toBe(128);
    expect(state.document.layers[0].contentBounds).toEqual({
      x: 0,
      y: 0,
      width: 128,
      height: 96
    });
  });
});

describe("useCanvasGeometryActions guides", () => {
  beforeEach(() => {
    act(() => {
      useSketchStore.getState().resetDocument();
      useSketchStore.getState().pushHistory("initial");
      useSketchStore.getState().addGuide("vertical", 100);
      useSketchStore.getState().addGuide("horizontal", 50);
    });
  });

  function positions(): number[] {
    return (useSketchStore.getState().document.guides ?? []).map((g) => g.position);
  }

  it("shifts guides with the content on crop, and undo puts them back", () => {
    const { result } = renderHook(() => useCanvasGeometryActions(makeParams()));

    act(() => {
      result.current.handleCropComplete(16, 12, 128, 96);
    });
    expect(positions()).toEqual([84, 38]);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(positions()).toEqual([100, 50]);
  });

  it("shifts guides when a resize drag moves the canvas origin", () => {
    const { result } = renderHook(() => useCanvasGeometryActions(makeParams()));

    act(() => {
      result.current.handleCanvasResizeStart();
      result.current.handleCanvasResizeDrag(532, 522, {
        translateLayers: { x: 20, y: 10 }
      });
    });
    expect(positions()).toEqual([120, 60]);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(positions()).toEqual([100, 50]);
  });
});
