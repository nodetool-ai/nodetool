/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { usePointerHandlers } from "../sketchCanvasHooks/usePointerHandlers";
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
    selectionMoveAntsRef: { current: null },
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
      } as React.PointerEvent);
    });

    expect(params.containerRef.current?.style.cursor).toBe("grabbing");

    act(() => {
      result.current.handlePointerUp({
        clientX: 100,
        clientY: 120,
        nativeEvent: {} as PointerEvent
      } as React.PointerEvent);
    });

    expect(params.containerRef.current?.style.cursor).toBe("");
  });
});
