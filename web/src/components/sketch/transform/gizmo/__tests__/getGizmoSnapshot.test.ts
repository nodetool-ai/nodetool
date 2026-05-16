/**
 * Tests for TransformTool's React/SVG snapshot interface — replaces the
 * imperative canvas-painter contract removed in Step 5.
 *
 * Covers:
 *   - Snapshot is null when no targets are armed
 *   - Snapshot is non-null after activation on a default document
 *   - Repeat reads without an intervening state change return the SAME
 *     reference (referential stability — `useSyncExternalStore` bails on ===)
 *   - State mutations (notifyGizmoChange) invalidate the cache
 *   - Listeners are notified on activate / deactivate / sync
 */

import { TransformTool } from "../../../tools/TransformTool";
import type { ToolContext, ToolPointerEvent } from "../../../tools";
import { createDefaultDocument } from "../../../types";

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  const doc = createDefaultDocument(64, 64);
  return {
    doc,
    activeTool: "transform",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "off",
    symmetryRays: 6,
    selection: null,
    displayCanvasRef: { current: null },
    overlayCanvasRef: { current: null },
    gizmoCanvasRef: { current: null },
    cursorCanvasRef: { current: null },
    containerRef: { current: null },
    layerCanvasesRef: { current: new Map() },
    mousePositionRef: { current: { x: 0, y: 0 } },
    activeStrokeRef: { current: null },
    getOrCreateLayerCanvas: jest.fn(() => {
      const c = window.document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      return c;
    }),
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: jest.fn(),
    requestDirtyRedraw: jest.fn(),
    clearOverlay: jest.fn(),
    drawSelectionOverlay: jest.fn(),
    drawOverlayShape: jest.fn(),
    drawOverlayGradient: jest.fn(),
    drawOverlayCrop: jest.fn(),
    drawOverlayLassoPreview: jest.fn(),
    drawOverlaySelection: jest.fn(),
    drawCursor: jest.fn(),
    clearGizmo: jest.fn(),
    drawGizmo: jest.fn(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn(),
    onLayerContentBoundsChange: jest.fn(),
    onBrushSizeChange: jest.fn(),
    onContextMenu: jest.fn(),
    onCropComplete: jest.fn(),
    onEyedropperPick: jest.fn(),
    onSelectionChange: jest.fn(),
    onAutoPickLayer: jest.fn(),
    screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn((c, fn, from, to) => {
      fn(from, to, c, 0);
    }),
    ...overrides
  };
}

function makeEvent(point = { x: 10, y: 10 }): ToolPointerEvent {
  return {
    point,
    pressure: 0.5,
    nativeEvent: {
      altKey: false,
      button: 0,
      clientX: point.x,
      clientY: point.y,
      pointerId: 1
    } as unknown as React.PointerEvent
  };
}

describe("TransformTool.getGizmoSnapshot", () => {
  it("returns null before the tool has ever been activated", () => {
    const tool = new TransformTool();
    expect(tool.getGizmoSnapshot()).toBeNull();
  });

  it("returns a non-null snapshot after activation on a default document", () => {
    const tool = new TransformTool();
    const ctx = makeCtx();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    tool.onActivate!(ctx);

    const snap = tool.getGizmoSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.rasterBounds.width).toBeGreaterThan(0);
    expect(snap!.rasterBounds.height).toBeGreaterThan(0);
    expect(snap!.transform).toBeDefined();
  });

  it("returns the same reference across reads when nothing has changed", () => {
    const tool = new TransformTool();
    const ctx = makeCtx();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    tool.onActivate!(ctx);

    const a = tool.getGizmoSnapshot();
    const b = tool.getGizmoSnapshot();
    expect(a).toBe(b);
  });

  it("invalidates the cache after a gesture commit", () => {
    const tool = new TransformTool();
    const ctx = makeCtx();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    tool.onActivate!(ctx);
    const before = tool.getGizmoSnapshot();
    tool.onDown!(ctx, makeEvent({ x: 15, y: 15 }));
    tool.onMove!(ctx, makeEvent({ x: 25, y: 20 }));
    tool.onUp!(ctx);
    const after = tool.getGizmoSnapshot();
    expect(after).not.toBe(before);
  });

  it("notifies subscribers on activate and deactivate", () => {
    const tool = new TransformTool();
    const listener = jest.fn();
    const unsubscribe = tool.subscribeGizmo(listener);

    const ctx = makeCtx();
    tool.onActivate!(ctx);
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    tool.onDeactivate!(ctx);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("unsubscribe removes the listener", () => {
    const tool = new TransformTool();
    const listener = jest.fn();
    const unsubscribe = tool.subscribeGizmo(listener);
    unsubscribe();

    const ctx = makeCtx();
    tool.onActivate!(ctx);
    expect(listener).not.toHaveBeenCalled();
  });

  it("snapshot is null again after deactivation", () => {
    const tool = new TransformTool();
    const ctx = makeCtx();
    tool.onActivate!(ctx);
    tool.onDeactivate!(ctx);
    expect(tool.getGizmoSnapshot()).toBeNull();
  });
});
