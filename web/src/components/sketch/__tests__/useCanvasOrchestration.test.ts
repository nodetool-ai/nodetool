/**
 * @jest-environment jsdom
 *
 * Tests for useCanvasOrchestration — the hook that wires together
 * compositing, overlay, and pointer handlers with shared refs.
 *
 * We mock all downstream hooks to verify wiring without needing
 * real canvas/GPU infrastructure.
 */
import { renderHook } from "@testing-library/react";
import type { DisplayFrameCoordinator } from "../sketchCanvasHooks/DisplayFrameCoordinator";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCompositing = {
  displayCanvasRef: { current: null },
  bootstrapDisplayRef: { current: null },
  bootstrapPhaseActive: false,
  overlayCanvasRef: { current: null },
  layerCanvasesRef: { current: new Map() },
  runtime: {
    dispose: jest.fn(),
    setSelection: jest.fn(),
    setSelectionOriginOverride: jest.fn()
  },
  backend: "canvas2d" as const,
  getOrCreateLayerCanvas: jest.fn(),
  invalidateLayer: jest.fn(),
  redraw: jest.fn(),
  redrawDirty: jest.fn(),
  requestRedraw: jest.fn(),
  requestDirtyRedraw: jest.fn(),
  drainPendingStrokeCommit: jest.fn(),
  coordinatorRef: { current: { requestFrame: jest.fn() } }
};

const mockOverlay = {
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
  drawGizmo: jest.fn()
};

const mockPointerHandlers = {
  handlePointerDown: jest.fn(),
  handlePointerMove: jest.fn(),
  handlePointerUp: jest.fn(),
  handleDoubleClick: jest.fn(),
  handleWheel: jest.fn(),
  handleMouseMove: jest.fn(),
  handlePointerLeave: jest.fn(),
  handleMouseLeave: jest.fn(),
  handleContextMenu: jest.fn(),
  shiftHeldRef: { current: false },
  altHeldRef: { current: false },
  selectStartRef: { current: null },
  cancelActiveTool: jest.fn(),
  commitPendingCrop: jest.fn()
};

jest.mock("../sketchCanvasHooks", () => {
  const actual = jest.requireActual("../sketchCanvasHooks");
  return {
    ...actual,
    useCompositing: jest.fn(() => mockCompositing),
    useOverlayRenderer: jest.fn(() => mockOverlay),
    usePointerHandlers: jest.fn(() => mockPointerHandlers)
  };
});

import { useCanvasOrchestration } from "../sketchCanvasHooks/useCanvasOrchestration";
import { useCompositing, useOverlayRenderer, usePointerHandlers } from "../sketchCanvasHooks";
import { createDefaultDocument } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeParams() {
  const doc = createDefaultDocument(64, 64);
  return {
    doc,
    docWithTools: doc,
    activeTool: "brush" as const,
    interactionTool: "brush" as const,
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "none",
    symmetryRays: 4,
    selection: null,
    isolatedLayerId: null,
    foregroundColor: "#000000",
    transformPreviewByLayerIdRef: { current: {} },
    requestPreviewRedrawRef: { current: jest.fn() },
    invalidateLayerRef: { current: jest.fn() },
    coordinatorRef: {
      current: { requestFrame: jest.fn() } as unknown as DisplayFrameCoordinator
    } as React.MutableRefObject<DisplayFrameCoordinator | null>,
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onCanvasLeave: jest.fn()
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useCanvasOrchestration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns container and canvas refs", () => {
    const params = makeParams();
    const { result } = renderHook(() => useCanvasOrchestration(params));

    expect(result.current.containerRef).toBeDefined();
    expect(result.current.containerRef.current).toBeNull(); // not mounted
    expect(result.current.selectionCanvasRef).toBeDefined();
    expect(result.current.cursorCanvasRef).toBeDefined();
    expect(result.current.gizmoCanvasRef).toBeDefined();
    expect(result.current.lastPointerClientRef).toBeDefined();
    expect(result.current.lastPointerClientRef.current).toBeNull();
  });

  it("calls useCompositing with doc (not docWithTools)", () => {
    const params = makeParams();
    renderHook(() => useCanvasOrchestration(params));

    expect(useCompositing).toHaveBeenCalledWith(
      expect.objectContaining({
        doc: params.doc,
        coordinatorRef: params.coordinatorRef
      })
    );
  });

  it("calls useOverlayRenderer with docWithTools", () => {
    const params = makeParams();
    renderHook(() => useCanvasOrchestration(params));

    const overlayArgs = (useOverlayRenderer as jest.Mock).mock.calls[0][0];
    expect(overlayArgs).toEqual(
      expect.objectContaining({
        doc: params.docWithTools
      })
    );
    expect(overlayArgs).not.toHaveProperty("committedSelectionAntsOnGpu");
  });

  it("calls usePointerHandlers with docWithTools and overlay callbacks", () => {
    const params = makeParams();
    renderHook(() => useCanvasOrchestration(params));

    expect(usePointerHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        doc: params.docWithTools,
        clearOverlay: mockOverlay.clearOverlay,
        drawCursor: mockOverlay.drawCursor,
        drawGizmo: mockOverlay.drawGizmo
      })
    );
  });

  it("wires requestPreviewRedrawRef to compositing.requestRedraw", () => {
    const params = makeParams();
    renderHook(() => useCanvasOrchestration(params));

    expect(params.requestPreviewRedrawRef.current).toBe(
      mockCompositing.requestRedraw
    );
  });

  it("wires invalidateLayerRef to compositing.invalidateLayer", () => {
    const params = makeParams();
    renderHook(() => useCanvasOrchestration(params));

    expect(params.invalidateLayerRef.current).toBe(
      mockCompositing.invalidateLayer
    );
  });

  it("exposes compositing, overlay, and pointerHandlers in result", () => {
    const params = makeParams();
    const { result } = renderHook(() => useCanvasOrchestration(params));

    expect(result.current.compositing).toBe(mockCompositing);
    expect(result.current.overlay).toBe(mockOverlay);
    expect(result.current.pointerHandlers).toBe(mockPointerHandlers);
  });

  it("refs are stable across re-renders", () => {
    const params = makeParams();
    const { result, rerender } = renderHook(() => useCanvasOrchestration(params));
    const first = result.current;
    rerender();
    const second = result.current;

    expect(first.containerRef).toBe(second.containerRef);
    expect(first.selectionCanvasRef).toBe(second.selectionCanvasRef);
    expect(first.cursorCanvasRef).toBe(second.cursorCanvasRef);
    expect(first.gizmoCanvasRef).toBe(second.gizmoCanvasRef);
    expect(first.lastPointerClientRef).toBe(second.lastPointerClientRef);
  });
});
