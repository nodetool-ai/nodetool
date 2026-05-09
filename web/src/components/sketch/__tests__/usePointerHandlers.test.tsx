/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { usePointerHandlers } from "../sketchCanvasHooks/usePointerHandlers";
import { getToolHandler } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import { MoveTool } from "../tools/MoveTool";
import { createDefaultDocument } from "../types";
import type { UsePointerHandlersParams } from "../sketchCanvasHooks/usePointerHandlers";

function makeParams(): UsePointerHandlersParams {
  const doc = createDefaultDocument(64, 64);
  const container = document.createElement("div");
  const displayCanvas = document.createElement("canvas");
  const overlayCanvas = document.createElement("canvas");
  const cursorCanvas = document.createElement("canvas");
  const gizmoCanvas = document.createElement("canvas");

  return {
    doc,
    activeTool: "brush",
    interactionTool: "brush",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "off",
    symmetryRays: 6,
    selection: null,
    selectStartRef: { current: null },
    lassoPointsRef: { current: [] },
    displayCanvasRef: { current: displayCanvas },
    overlayCanvasRef: { current: overlayCanvas },
    cursorCanvasRef: { current: cursorCanvas },
    gizmoCanvasRef: { current: gizmoCanvas },
    containerRef: { current: container },
    layerCanvasesRef: { current: new Map() },
    mousePositionRef: { current: { x: 0, y: 0 } },
    activeStrokeRef: { current: null },
    runtime: {
      readbackComposite: jest.fn(() => null)
    } as never,
    getOrCreateLayerCanvas: jest.fn(() => document.createElement("canvas")),
    invalidateLayer: jest.fn(),
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: jest.fn(),
    requestDirtyRedraw: jest.fn(),
    clearOverlay: jest.fn(),
    drawSelectionOverlay: jest.fn(),
    appendSelectionOverlay: jest.fn(),
    drawOverlayShape: jest.fn(),
    drawOverlayGradient: jest.fn(),
    drawOverlayCrop: jest.fn(),
    drawOverlaySelection: jest.fn(),
    drawOverlayLassoPreview: jest.fn(),
    drawCursor: jest.fn(),
    clearGizmo: jest.fn(),
    drawGizmo: jest.fn(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
    onLayerContentBoundsChange: jest.fn(),
    onBrushSizeChange: jest.fn(),
    onContextMenu: jest.fn(),
    onTransformContextMenu: jest.fn(),
    onCropComplete: jest.fn(),
    onEyedropperPick: undefined,
    isolatedLayerId: null,
    onSelectionChange: jest.fn(),
    onAutoPickLayer: jest.fn(),
    foregroundColor: "#000000",
    onCanvasLeave: jest.fn(),
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn()
  };
}

describe("usePointerHandlers", () => {
  it("shows grabbing cursor while actively panning", () => {
    const params = makeParams();
    const target = document.createElement("div");
    (target as HTMLElement).setPointerCapture = jest.fn();

    const { result } = renderHook(() => usePointerHandlers(params));

    act(() => {
      result.current.handlePointerDown({
        button: 1,
        clientX: 100,
        clientY: 120,
        pointerId: 1,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        nativeEvent: {} as PointerEvent,
        target
      } as unknown as React.PointerEvent);
    });

    expect(result.current.containerCursor).toBe("grabbing");

    act(() => {
      result.current.handlePointerUp({
        clientX: 100,
        clientY: 120,
        nativeEvent: {} as PointerEvent
      } as unknown as React.PointerEvent);
    });

    expect(result.current.containerCursor).toBe("none");
  });

  it("shows grab cursor while Space is held (before pan drag)", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePointerHandlers(params));

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true })
      );
    });

    expect(result.current.containerCursor).toBe("grab");

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true })
      );
    });

    expect(result.current.containerCursor).toBe("none");
  });

  it("re-syncs TransformTool state when the active layer changes while transform stays active", () => {
    const initialDoc = createDefaultDocument(64, 64);
    initialDoc.layers[0].contentBounds = { x: 0, y: 0, width: 32, height: 32 };

    const nextLayer = {
      ...initialDoc.layers[0],
      id: "layer-2",
      name: "Layer 2",
      transform: { x: 40, y: 12, scaleX: 1, scaleY: 1, rotation: 0 },
      contentBounds: { x: 0, y: 0, width: 20, height: 20 }
    };
    initialDoc.layers = [initialDoc.layers[0], nextLayer];

    const params = makeParams();
    params.doc = initialDoc;

    const { rerender } = renderHook((hookParams: UsePointerHandlersParams) => usePointerHandlers(hookParams), {
      initialProps: params
    });

    rerender({
      ...params,
      activeTool: "transform",
      interactionTool: "transform"
    });

    const transformTool = getToolHandler("transform") as TransformTool;
    expect(transformTool.getOriginalTransform().x).toBe(0);

    (params.drawGizmo as jest.Mock).mockClear();
    const updatedDoc = {
      ...initialDoc,
      activeLayerId: nextLayer.id
    };
    rerender({
      ...params,
      activeTool: "transform",
      interactionTool: "transform",
      doc: updatedDoc
    });

    expect(transformTool.getOriginalTransform().x).toBe(40);
    expect(params.drawGizmo).toHaveBeenCalled();
  });

  it("re-syncs MoveTool gizmo when the active layer changes while move stays active", () => {
    const initialDoc = createDefaultDocument(64, 64);
    const nextLayer = {
      ...initialDoc.layers[0],
      id: "layer-2",
      name: "Layer 2"
    };
    initialDoc.layers = [initialDoc.layers[0], nextLayer];

    const params = makeParams();
    params.doc = initialDoc;

    const { rerender } = renderHook((hookParams: UsePointerHandlersParams) => usePointerHandlers(hookParams), {
      initialProps: params
    });

    rerender({
      ...params,
      activeTool: "move",
      interactionTool: "move"
    });

    const moveTool = getToolHandler("move") as MoveTool;
    expect(moveTool).toBeInstanceOf(MoveTool);

    (params.clearGizmo as jest.Mock).mockClear();
    const updatedDoc = {
      ...initialDoc,
      activeLayerId: nextLayer.id
    };
    rerender({
      ...params,
      activeTool: "move",
      interactionTool: "move",
      doc: updatedDoc
    });

    expect(params.clearGizmo).toHaveBeenCalled();
  });
});
