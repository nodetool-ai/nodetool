/**
 * @jest-environment jsdom
 *
 * Tests for useTransformPreviewBridge — the dedicated hook that owns the
 * transient transform-preview map, redraw/invalidate policy, and active-layer
 * preview bridging previously inline in SketchCanvas.
 */
import { act, renderHook } from "@testing-library/react";
import { useTransformPreviewBridge } from "../sketchCanvasHooks/useTransformPreviewBridge";
import {
  clearActiveLayerTransformPreview,
  setActiveLayerTransformPreview
} from "../activeLayerTransform";
import { DisplayFrameCoordinator } from "../sketchCanvasHooks/DisplayFrameCoordinator";
import type { LayerTransform } from "../types";

// Spy on the active-layer module so we can verify bridging calls.
jest.mock("../activeLayerTransform", () => {
  const actual = jest.requireActual("../activeLayerTransform");
  return {
    ...actual,
    setActiveLayerTransformPreview: jest.fn(actual.setActiveLayerTransformPreview),
    clearActiveLayerTransformPreview: jest.fn(actual.clearActiveLayerTransformPreview)
  };
});

const mockSetPreview = setActiveLayerTransformPreview as jest.MockedFunction<typeof setActiveLayerTransformPreview>;
const mockClearPreview = clearActiveLayerTransformPreview as jest.MockedFunction<typeof clearActiveLayerTransformPreview>;

beforeEach(() => {
  mockSetPreview.mockClear();
  mockClearPreview.mockClear();
});

describe("useTransformPreviewBridge", () => {
  it("returns stable refs and callbacks", () => {
    const { result, rerender } = renderHook(() => useTransformPreviewBridge());
    const first = result.current;
    rerender();
    const second = result.current;

    // Refs should be the same object across renders.
    expect(first.transformPreviewByLayerIdRef).toBe(second.transformPreviewByLayerIdRef);
    expect(first.requestPreviewRedrawRef).toBe(second.requestPreviewRedrawRef);
    expect(first.invalidateLayerRef).toBe(second.invalidateLayerRef);
    // Callbacks should be stable (useCallback with []).
    expect(first.setLayerTransformPreview).toBe(second.setLayerTransformPreview);
    expect(first.clearLayerTransformPreview).toBe(second.clearLayerTransformPreview);
  });

  it("setLayerTransformPreview populates the preview map and bridges to active-layer module", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const transform: LayerTransform = { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 };

    act(() => {
      result.current.setLayerTransformPreview("layer-1", transform);
    });

    expect(result.current.transformPreviewByLayerIdRef.current).toEqual({
      "layer-1": transform
    });
    expect(mockSetPreview).toHaveBeenCalledWith({
      layerId: "layer-1",
      transform
    });
  });

  it("setLayerTransformPreview bails when the value is identical", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    const transform: LayerTransform = { x: 5, y: 5, scaleX: 1, scaleY: 1, rotation: 0 };

    act(() => {
      result.current.setLayerTransformPreview("layer-1", transform);
    });
    expect(redrawSpy).toHaveBeenCalledTimes(1);

    // Same value again — should not trigger another redraw.
    redrawSpy.mockClear();
    act(() => {
      result.current.setLayerTransformPreview("layer-1", { ...transform });
    });
    expect(redrawSpy).not.toHaveBeenCalled();
  });

  it("setLayerTransformPreview fires invalidateLayer on first activation of a layer", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const invalidateSpy = jest.fn();
    const redrawSpy = jest.fn();
    result.current.invalidateLayerRef.current = invalidateSpy;
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    const transform: LayerTransform = { x: 1, y: 2 };

    act(() => {
      result.current.setLayerTransformPreview("layer-A", transform);
    });
    // First activation → invalidate.
    expect(invalidateSpy).toHaveBeenCalledWith("layer-A");

    invalidateSpy.mockClear();
    // Update same layer → no invalidation, just redraw.
    act(() => {
      result.current.setLayerTransformPreview("layer-A", { x: 3, y: 4 });
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(redrawSpy).toHaveBeenCalled();
  });

  it("clearLayerTransformPreview clears a single layer", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    act(() => {
      result.current.setLayerTransformPreview("layer-1", { x: 1, y: 1 });
      result.current.setLayerTransformPreview("layer-2", { x: 2, y: 2 });
    });
    redrawSpy.mockClear();

    act(() => {
      result.current.clearLayerTransformPreview("layer-1");
    });

    expect(result.current.transformPreviewByLayerIdRef.current).toEqual({
      "layer-2": { x: 2, y: 2 }
    });
    expect(redrawSpy).toHaveBeenCalledTimes(1);
    expect(mockClearPreview).toHaveBeenCalled();
  });

  it("clearLayerTransformPreview clears all layers when no id given", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    act(() => {
      result.current.setLayerTransformPreview("layer-1", { x: 1, y: 1 });
    });
    redrawSpy.mockClear();

    act(() => {
      result.current.clearLayerTransformPreview();
    });

    expect(result.current.transformPreviewByLayerIdRef.current).toEqual({});
    expect(redrawSpy).toHaveBeenCalledTimes(1);
    expect(mockClearPreview).toHaveBeenCalled();
  });

  it("clearLayerTransformPreview bails when the map is already empty", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    // Clear all on empty map.
    act(() => {
      result.current.clearLayerTransformPreview();
    });
    expect(redrawSpy).not.toHaveBeenCalled();
  });

  it("clearLayerTransformPreview bails when the layer id is not in the map", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    // Try clearing a layer that was never added.
    act(() => {
      result.current.clearLayerTransformPreview("nonexistent");
    });
    // Should still call clearActiveLayerTransformPreview (bridges to UI),
    // but should NOT call redraw.
    expect(redrawSpy).not.toHaveBeenCalled();
    expect(mockClearPreview).toHaveBeenCalled();
  });

  it("handles rotation comparison within epsilon", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    const t1: LayerTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0.000000001 };
    const t2: LayerTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0.0000000015 };

    act(() => {
      result.current.setLayerTransformPreview("layer-1", t1);
    });
    redrawSpy.mockClear();

    // The two rotation values differ by < 1e-9, so should bail.
    act(() => {
      result.current.setLayerTransformPreview("layer-1", t2);
    });
    expect(redrawSpy).not.toHaveBeenCalled();
  });

  it("routes preview redraws through the shared coordinator when provided", () => {
    const coordinator = new DisplayFrameCoordinator(false);
    const requestFrameSpy = jest.spyOn(coordinator, "requestFrame");
    const coordinatorRef = { current: coordinator };
    const { result } = renderHook(() =>
      useTransformPreviewBridge({ coordinatorRef })
    );
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    act(() => {
      result.current.setLayerTransformPreview("layer-1", { x: 4, y: 5 });
    });

    expect(requestFrameSpy).toHaveBeenCalledWith("transform-preview", "raf");
    expect(redrawSpy).not.toHaveBeenCalled();
  });

  it("treats matrix changes as preview changes even when decomposed fields match", () => {
    const { result } = renderHook(() => useTransformPreviewBridge());
    const redrawSpy = jest.fn();
    result.current.requestPreviewRedrawRef.current = redrawSpy;

    act(() => {
      result.current.setLayerTransformPreview("layer-1", {
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        matrix: [1, 0, 0, 1, 10, 20]
      });
    });
    redrawSpy.mockClear();

    act(() => {
      result.current.setLayerTransformPreview("layer-1", {
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        matrix: [1, 0, 0.25, 1, 10, 20]
      });
    });

    expect(redrawSpy).toHaveBeenCalledTimes(1);
  });
});
