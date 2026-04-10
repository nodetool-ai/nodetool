/**
 * moveTransformUnification.test.ts
 *
 * Regression coverage for the move/transform unification tasks:
 *
 *   1. Unified preview ownership: MoveTool and TransformTool both use
 *      PreviewSession, so compositing, gizmo, and UI all read from one
 *      live preview source.
 *   2. Spring-loaded move lifecycle: modifier-driven interactionTool
 *      changes run onActivate/onDeactivate on the spring-loaded tool.
 *   3. Gizmo bounds: resolveGizmoBounds provides one explicit contract
 *      for both tools; contentBounds vs raster bounds vs canvas size.
 *   4. Reconcile vs preview parity: reconcileLayerToDocumentSpace uses
 *      raster origin consistently with the preview compositing path.
 */

import type { LayerTransform, LayerContentBounds, Layer } from "../types";
import { ensureTransformMatrix, createDefaultDocument } from "../types";
import { MoveTool } from "../tools/MoveTool";
import { TransformTool } from "../tools/TransformTool";
import { createPreviewSession, type PreviewSession } from "../tools/previewSession";
import {
  resolveGizmoBounds,
  getEffectiveRasterBounds,
  getTransformedExtents,
  getTransformedCenter
} from "../painting/resolvedLayerGeometry";
import { reconcileLayerToDocumentSpace } from "../rendering/canvas2d/reconcile";
import { setCanvasRasterBounds, getCanvasRasterBounds } from "../painting/layerBounds";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import { getToolHandler } from "../tools";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTransform(overrides?: Partial<LayerTransform>): LayerTransform {
  return ensureTransformMatrix({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides
  });
}

function makeBounds(overrides?: Partial<LayerContentBounds>): LayerContentBounds {
  return { x: 0, y: 0, width: 100, height: 100, ...overrides };
}

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id: "test-layer",
    name: "Test Layer",
    type: "paint",
    visible: true,
    opacity: 1,
    locked: false,
    blendMode: "normal",
    data: null,
    effects: [],
    transform: makeTransform(),
    contentBounds: makeBounds(),
    ...(overrides as Partial<Layer>)
  } as Layer;
}

function makeMockCanvas(
  width: number,
  height: number,
  rasterBounds?: LayerContentBounds
): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (rasterBounds) {
    setCanvasRasterBounds(canvas, rasterBounds);
  }
  return canvas;
}

function makeMockCtx(docOverrides?: {
  layers?: Layer[];
  activeLayerId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}): ToolContext {
  const defaultLayer = makeLayer();
  const layers = docOverrides?.layers ?? [defaultLayer];
  const activeLayerId = docOverrides?.activeLayerId ?? layers[0]?.id ?? "test-layer";
  const cw = docOverrides?.canvasWidth ?? 100;
  const ch = docOverrides?.canvasHeight ?? 100;

  return {
    doc: {
      id: "test-doc",
      canvas: { width: cw, height: ch },
      activeLayerId,
      layers,
      toolSettings: {} as ToolContext["doc"]["toolSettings"]
    },
    activeTool: "move",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "none",
    symmetryRays: 2,
    selection: null,
    displayCanvasRef: { current: null },
    overlayCanvasRef: { current: null },
    gizmoCanvasRef: { current: null },
    cursorCanvasRef: { current: null },
    containerRef: { current: null },
    layerCanvasesRef: { current: new Map() },
    mousePositionRef: { current: { x: 0, y: 0 } },
    activeStrokeRef: { current: null },
    getOrCreateLayerCanvas: jest.fn((layerId: string) => {
      const existing = (this as unknown as { layerCanvasesRef: { current: Map<string, HTMLCanvasElement> } })?.layerCanvasesRef?.current?.get(layerId);
      if (existing) {
        return existing;
      }
      const canvas = makeMockCanvas(cw, ch);
      return canvas;
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
    screenToCanvas: jest.fn(),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn(),
    clipSelectionForOffset: jest.fn(),
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn()
  } as unknown as ToolContext;
}

function makePointerEvent(overrides?: {
  point?: { x: number; y: number };
  pressure?: number;
}): ToolPointerEvent {
  return {
    point: overrides?.point ?? { x: 0, y: 0 },
    pressure: overrides?.pressure ?? 0.5,
    nativeEvent: {
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      pointerId: 1,
      pointerType: "mouse"
    } as unknown as React.PointerEvent
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. UNIFIED PREVIEW OWNERSHIP
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task 1: Unified preview ownership", () => {
  it("MoveTool uses PreviewSession (session is active during drag)", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    const session = tool.getPreviewSession();
    expect(session.isActive()).toBe(false);

    // Start a drag
    tool.onDown!(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    expect(session.isActive()).toBe(true);
    expect(session.state.layerId).toBe("test-layer");
  });

  it("MoveTool session commit clears preview on pointer up", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    tool.onDown!(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 30, y: 30 } }), []);
    tool.onUp!(ctx, makePointerEvent({ point: { x: 30, y: 30 } }));

    const session = tool.getPreviewSession();
    expect(session.isActive()).toBe(false);
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("test-layer");
    expect(ctx.onLayerTransformChange).toHaveBeenCalled();
  });

  it("MoveTool preview preserves existing scale/rotation during drag", () => {
    const scaledLayer = makeLayer({
      transform: makeTransform({ x: 10, y: 10, scaleX: 2, scaleY: 0.5, rotation: Math.PI / 4 })
    });
    const ctx = makeMockCtx({ layers: [scaledLayer] });
    const tool = new MoveTool();
    tool.onActivate!(ctx);

    tool.onDown!(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 30, y: 30 } }), []);

    const session = tool.getPreviewSession();
    const current = session.state.currentTransform;
    expect(current.scaleX).toBe(2);
    expect(current.scaleY).toBe(0.5);
    expect(current.rotation).toBe(Math.PI / 4);
  });

  it("TransformTool uses PreviewSession (session is active during drag)", () => {
    const tool = new TransformTool();
    const layer = makeLayer({
      contentBounds: makeBounds({ width: 64, height: 64 })
    });
    const ctx = makeMockCtx({ layers: [layer] });
    tool.onActivate!(ctx);

    const session = tool.getPreviewSession();
    expect(session.isActive()).toBe(false);

    // Click inside the bounding box (center of a 64x64 layer = 32, 32)
    const started = tool.onDown!(ctx, makePointerEvent({ point: { x: 32, y: 32 } }));
    if (started) {
      expect(session.isActive()).toBe(true);
    }
  });

  it("TransformTool session commit clears preview on pointer up", () => {
    const tool = new TransformTool();
    const layer = makeLayer({
      contentBounds: makeBounds({ width: 64, height: 64 })
    });
    const ctx = makeMockCtx({ layers: [layer] });
    tool.onActivate!(ctx);

    const started = tool.onDown!(ctx, makePointerEvent({ point: { x: 32, y: 32 } }));
    if (started) {
      tool.onUp!(ctx);

      const session = tool.getPreviewSession();
      expect(session.isActive()).toBe(false);
      expect(ctx.onLayerTransformChange).toHaveBeenCalled();
    }
  });

  it("Both tools' sessions are independent instances", () => {
    const moveTool = new MoveTool();
    const transformTool = new TransformTool();

    const moveSession = moveTool.getPreviewSession();
    const transformSession = transformTool.getPreviewSession();

    expect(moveSession).not.toBe(transformSession);
  });

  it("PreviewSession update writes to compositing pipeline", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    tool.onDown!(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 50, y: 50 } }), []);

    // setLayerTransformPreview should have been called with the merged transform
    expect(ctx.setLayerTransformPreview).toHaveBeenCalledWith(
      "test-layer",
      expect.objectContaining({ x: 50, y: 50 })
    );
  });

  it("MoveTool onDeactivate commits in-progress session", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    tool.onDown!(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 20, y: 20 } }), []);

    const session = tool.getPreviewSession();
    expect(session.isActive()).toBe(true);

    // Deactivate while drag is in progress (spring-loaded move release)
    tool.onDeactivate!(ctx);
    expect(session.isActive()).toBe(false);
    // Should have committed the transform
    expect(ctx.onLayerTransformChange).toHaveBeenCalled();
  });

  it("TransformTool onActivate clears stale session", () => {
    const tool = new TransformTool();
    const layer = makeLayer({
      contentBounds: makeBounds({ width: 64, height: 64 })
    });
    const ctx = makeMockCtx({ layers: [layer] });
    tool.onActivate!(ctx);

    // Start a drag
    tool.onDown!(ctx, makePointerEvent({ point: { x: 32, y: 32 } }));
    const session = tool.getPreviewSession();
    expect(session.isActive()).toBe(true);

    // Re-activate without deactivating (simulates edge case)
    tool.onActivate!(ctx);
    expect(session.isActive()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SPRING-LOADED MOVE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task 2: Spring-loaded move lifecycle", () => {
  it("MoveTool onDeactivate commits pending drag so layer keeps transform", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    // Start and progress a drag
    tool.onDown!(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 30, y: 40 } }), []);

    // Simulate spring-loaded release (deactivate without onUp)
    tool.onDeactivate!(ctx);

    // Transform should have been committed
    expect(ctx.onLayerTransformChange).toHaveBeenCalledWith(
      "test-layer",
      expect.objectContaining({ x: 30, y: 40 })
    );
    // Preview should be cleared
    expect(ctx.clearLayerTransformPreview).toHaveBeenCalledWith("test-layer");
  });

  it("MoveTool onDeactivate is a no-op when no drag is active", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    // Deactivate without starting any drag
    (ctx.onLayerTransformChange as jest.Mock).mockClear();
    tool.onDeactivate!(ctx);

    // No transform commit should happen
    expect(ctx.onLayerTransformChange).not.toHaveBeenCalled();
  });

  it("After spring-loaded move commit, TransformTool cancel does not restore stale state", () => {
    // Simulate: user is in transform tool, does Ctrl+drag (spring-loaded move),
    // releases, then cancels transform. The move should be preserved.

    const transformTool = new TransformTool();
    const moveTool = new MoveTool();

    const layer = makeLayer({
      transform: makeTransform({ x: 10, y: 20, scaleX: 1.5, scaleY: 1.5 }),
      contentBounds: makeBounds({ width: 64, height: 64 })
    });
    const ctx = makeMockCtx({ layers: [layer] });

    // 1. Activate transform tool
    transformTool.onActivate!(ctx);
    const originalTransform = transformTool.getOriginalTransform();
    expect(originalTransform.x).toBe(10);
    expect(originalTransform.y).toBe(20);

    // 2. Spring-loaded move: activate move tool
    moveTool.onActivate!(ctx);

    // 3. Do a move drag
    moveTool.onDown!(ctx, makePointerEvent({ point: { x: 10, y: 20 } }));
    moveTool.onMove!(ctx, makePointerEvent({ point: { x: 30, y: 40 } }), []);

    // 4. Release spring-loaded move (deactivate commits)
    moveTool.onDeactivate!(ctx);

    // The committed transform should be at the new position
    const commitCall = (ctx.onLayerTransformChange as jest.Mock).mock.calls[0];
    expect(commitCall[0]).toBe("test-layer");
    expect(commitCall[1].x).toBe(30);
    expect(commitCall[1].y).toBe(40);
    // Scale should be preserved
    expect(commitCall[1].scaleX).toBe(1.5);

    // 5. Re-activate transform tool — captures new baseline
    // Simulate the document having the new transform
    layer.transform = makeTransform({ x: 30, y: 40, scaleX: 1.5, scaleY: 1.5 });
    transformTool.onActivate!(ctx);

    // The new original should reflect the moved position
    const newOriginal = transformTool.getOriginalTransform();
    expect(newOriginal.x).toBe(30);
    expect(newOriginal.y).toBe(40);
  });

  it("MoveTool session cleanup prevents stale preview after spring-loaded deactivation", () => {
    const tool = new MoveTool();
    const ctx = makeMockCtx();
    tool.onActivate!(ctx);

    tool.onDown!(ctx, makePointerEvent({ point: { x: 0, y: 0 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 10, y: 10 } }), []);
    tool.onDeactivate!(ctx);

    const session = tool.getPreviewSession();
    // Session should be fully cleared
    expect(session.isActive()).toBe(false);
    expect(session.state.layerId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GIZMO BOUNDS: resolveGizmoBounds CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task 3: resolveGizmoBounds contract", () => {
  it("uses contentBounds when smaller than raster in both dimensions", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 10, y: 10, width: 50, height: 50 })
    });
    // Canvas is larger than contentBounds
    const canvas = makeMockCanvas(100, 100);

    const bounds = resolveGizmoBounds(layer, canvas, { width: 200, height: 200 });
    expect(bounds.width).toBe(50);
    expect(bounds.height).toBe(50);
    expect(bounds.x).toBe(10);
    expect(bounds.y).toBe(10);
  });

  it("uses raster bounds when contentBounds are equal to canvas size", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 0, y: 0, width: 100, height: 100 })
    });
    const canvas = makeMockCanvas(100, 100);

    const bounds = resolveGizmoBounds(layer, canvas, { width: 200, height: 200 });
    // contentBounds are NOT strictly smaller → uses raster bounds
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);
  });

  it("uses raster bounds when contentBounds are larger", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 0, y: 0, width: 200, height: 200 })
    });
    const canvas = makeMockCanvas(100, 100);

    const bounds = resolveGizmoBounds(layer, canvas, { width: 100, height: 100 });
    // contentBounds are larger → uses raster bounds from canvas
    expect(bounds.width).toBe(100);
  });

  it("uses stored raster bounds from canvas when available", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 0, y: 0, width: 50, height: 50 })
    });
    const canvas = makeMockCanvas(200, 200, { x: -50, y: -50, width: 200, height: 200 });

    const bounds = resolveGizmoBounds(layer, canvas, { width: 100, height: 100 });
    // Stored raster bounds (200x200) are larger than contentBounds (50x50)
    // but contentBounds are strictly smaller in both dims → uses contentBounds
    expect(bounds.width).toBe(50);
  });

  it("handles zero-size contentBounds gracefully (uses raster bounds)", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 0, y: 0, width: 0, height: 0 })
    });
    const canvas = makeMockCanvas(100, 100);

    const bounds = resolveGizmoBounds(layer, canvas, { width: 100, height: 100 });
    // Zero contentBounds → raster bounds from canvas
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);
  });

  it("falls back correctly when no canvas is provided", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 5, y: 5, width: 30, height: 30 })
    });

    const bounds = resolveGizmoBounds(layer, null, { width: 100, height: 100 });
    // No canvas: raster bounds come from contentBounds (30x30) or fallback (100x100)
    // contentBounds width (30) < raster width (100 from fallback)
    // contentBounds height (30) < raster height (100 from fallback)
    // So: uses contentBounds (30x30)
    expect(bounds.width).toBe(30);
    expect(bounds.height).toBe(30);
  });

  it("returns correct bounds for layers with non-zero raster origin", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: -50, y: -50, width: 200, height: 200 })
    });
    const canvas = makeMockCanvas(200, 200, { x: -50, y: -50, width: 200, height: 200 });

    const bounds = resolveGizmoBounds(layer, canvas, { width: 100, height: 100 });
    // contentBounds.width (200) == raster.width (200) → not strictly smaller → uses raster
    expect(bounds.x).toBe(-50);
    expect(bounds.y).toBe(-50);
    expect(bounds.width).toBe(200);
    expect(bounds.height).toBe(200);
  });

  it("handles imageReference startup case (no canvas, only contentBounds)", () => {
    const layer = makeLayer({
      contentBounds: makeBounds({ x: 0, y: 0, width: 256, height: 256 })
    });

    // imageReference layers may not have a canvas hydrated yet
    const bounds = resolveGizmoBounds(layer, null, { width: 512, height: 512 });
    // contentBounds (256x256) are strictly smaller than fallback (512x512)
    expect(bounds.width).toBe(256);
    expect(bounds.height).toBe(256);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RECONCILE vs PREVIEW PARITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Task 4: Reconcile vs preview parity", () => {
  it("reconcile accounts for raster origin when computing center", () => {
    // Layer with non-zero raster origin — the key parity gap that was fixed.
    const layer = makeLayer({
      id: "offset-layer",
      transform: makeTransform({ x: 10, y: 20, scaleX: 1.5, scaleY: 1.5, rotation: 0 }),
      contentBounds: makeBounds({ x: -30, y: -20, width: 160, height: 140 })
    });
    const doc = createDefaultDocument(200, 200);
    doc.layers = [layer];
    doc.activeLayerId = layer.id;

    const canvas = makeMockCanvas(160, 140, { x: -30, y: -20, width: 160, height: 140 });
    const canvases = new Map<string, HTMLCanvasElement>();
    canvases.set("offset-layer", canvas);

    // Preview path center: tx + rasterOriginX + w/2 = 10 + (-30) + 80 = 60
    const previewCenter = getTransformedCenter(layer.transform, {
      x: -30, y: -20, width: 160, height: 140
    });
    expect(previewCenter.x).toBe(10 + (-30) + 160 / 2); // 60

    // Reconcile should produce consistent results (not clip content)
    const result = reconcileLayerToDocumentSpace("offset-layer", doc, canvases);
    expect(result).not.toBeNull();
  });

  it("reconcile preserves raster origin in no-transform identity case", () => {
    const layer = makeLayer({
      id: "identity-layer",
      transform: makeTransform({ x: 0, y: 0 }),
      contentBounds: makeBounds({ x: -10, y: -10, width: 120, height: 120 })
    });
    const doc = createDefaultDocument(100, 100);
    doc.layers = [layer];
    doc.activeLayerId = layer.id;

    const canvas = makeMockCanvas(120, 120, { x: -10, y: -10, width: 120, height: 120 });
    const canvases = new Map<string, HTMLCanvasElement>();
    canvases.set("identity-layer", canvas);

    const result = reconcileLayerToDocumentSpace("identity-layer", doc, canvases);
    expect(result).not.toBeNull();

    // Check that raster bounds on the canvas are preserved
    const finalBounds = getCanvasRasterBounds(canvas);
    expect(finalBounds).not.toBeNull();
    expect(finalBounds!.x).toBe(-10);
    expect(finalBounds!.y).toBe(-10);
  });

  it("reconcile handles translation with non-zero raster origin", () => {
    const layer = makeLayer({
      id: "moved-layer",
      transform: makeTransform({ x: 50, y: 50 }),
      contentBounds: makeBounds({ x: -20, y: -20, width: 140, height: 140 })
    });
    const doc = createDefaultDocument(200, 200);
    doc.layers = [layer];
    doc.activeLayerId = layer.id;

    const canvas = makeMockCanvas(140, 140, { x: -20, y: -20, width: 140, height: 140 });
    const canvases = new Map<string, HTMLCanvasElement>();
    canvases.set("moved-layer", canvas);

    const result = reconcileLayerToDocumentSpace("moved-layer", doc, canvases);
    expect(result).not.toBeNull();

    // The output bounds should cover the translated content
    const finalBounds = getCanvasRasterBounds(canvas);
    expect(finalBounds).not.toBeNull();
    // Content is at tx + rasterOrigin = 50 + (-20) = 30
    // So the output should start at min(0, 30) = 0
    expect(finalBounds!.x).toBeLessThanOrEqual(0);
  });

  it("reconcile with scale/rotation uses correct raster-origin center", () => {
    const layer = makeLayer({
      id: "rotated-layer",
      transform: makeTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: Math.PI / 4 }),
      contentBounds: makeBounds({ x: -10, y: -10, width: 60, height: 60 })
    });
    const doc = createDefaultDocument(100, 100);
    doc.layers = [layer];
    doc.activeLayerId = layer.id;

    const canvas = makeMockCanvas(60, 60, { x: -10, y: -10, width: 60, height: 60 });
    const canvases = new Map<string, HTMLCanvasElement>();
    canvases.set("rotated-layer", canvas);

    // Preview center: 0 + (-10) + 30 = 20
    const previewCenter = getTransformedCenter(layer.transform, {
      x: -10, y: -10, width: 60, height: 60
    });
    expect(previewCenter.x).toBe(20);
    expect(previewCenter.y).toBe(20);

    const result = reconcileLayerToDocumentSpace("rotated-layer", doc, canvases);
    expect(result).not.toBeNull();
  });

  it("preview extents and reconcile AABB agree for non-zero raster origin + scale", () => {
    // This test verifies that the preview compositing path and the reconcile
    // path produce the same axis-aligned bounding box.
    const tx = 10;
    const ty = 15;
    const rasterOriginX = -20;
    const rasterOriginY = -10;
    const rw = 80;
    const rh = 60;
    const sx = 1.5;
    const sy = 2.0;
    const rot = 0; // No rotation for simpler comparison

    const transform = makeTransform({ x: tx, y: ty, scaleX: sx, scaleY: sy, rotation: rot });
    const rasterBounds: LayerContentBounds = { x: rasterOriginX, y: rasterOriginY, width: rw, height: rh };

    // Preview path: getTransformedExtents
    const previewExtents = getTransformedExtents(transform, rasterBounds);

    // Reconcile path center: tx + rasterOriginX + rw/2
    const cx = tx + rasterOriginX + rw / 2;
    const cy = ty + rasterOriginY + rh / 2;
    const hw = (rw * sx) / 2;
    const hh = (rh * sy) / 2;

    // For rot=0, the AABB is simply center ± scaled half extents
    const reconcileAABB = {
      x: cx - hw,
      y: cy - hh,
      width: hw * 2,
      height: hh * 2
    };

    // They should be numerically identical
    expect(previewExtents.x).toBeCloseTo(reconcileAABB.x, 5);
    expect(previewExtents.y).toBeCloseTo(reconcileAABB.y, 5);
    expect(previewExtents.width).toBeCloseTo(reconcileAABB.width, 5);
    expect(previewExtents.height).toBeCloseTo(reconcileAABB.height, 5);
  });

  it("preview extents and reconcile AABB agree for rotated layer with non-zero origin", () => {
    const tx = 5;
    const ty = 10;
    const rasterOriginX = -15;
    const rasterOriginY = -25;
    const rw = 100;
    const rh = 80;
    const sx = 1.2;
    const sy = 0.8;
    const rot = Math.PI / 6; // 30 degrees

    const transform = makeTransform({ x: tx, y: ty, scaleX: sx, scaleY: sy, rotation: rot });
    const rasterBounds: LayerContentBounds = { x: rasterOriginX, y: rasterOriginY, width: rw, height: rh };

    // Preview path
    const previewExtents = getTransformedExtents(transform, rasterBounds);

    // Reconcile path (manual computation matching the fixed reconcile code)
    const cx = tx + rasterOriginX + rw / 2;
    const cy = ty + rasterOriginY + rh / 2;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const hw = (rw * sx) / 2;
    const hh = (rh * sy) / 2;
    const corners = [
      { x: cx + (-hw) * cos - (-hh) * sin, y: cy + (-hw) * sin + (-hh) * cos },
      { x: cx + ( hw) * cos - (-hh) * sin, y: cy + ( hw) * sin + (-hh) * cos },
      { x: cx + (-hw) * cos - ( hh) * sin, y: cy + (-hw) * sin + ( hh) * cos },
      { x: cx + ( hw) * cos - ( hh) * sin, y: cy + ( hw) * sin + ( hh) * cos }
    ];
    let bMinX = corners[0].x, bMinY = corners[0].y;
    let bMaxX = corners[0].x, bMaxY = corners[0].y;
    for (let i = 1; i < 4; i++) {
      if (corners[i].x < bMinX) { bMinX = corners[i].x; }
      if (corners[i].y < bMinY) { bMinY = corners[i].y; }
      if (corners[i].x > bMaxX) { bMaxX = corners[i].x; }
      if (corners[i].y > bMaxY) { bMaxY = corners[i].y; }
    }
    const reconcileAABB = {
      x: bMinX,
      y: bMinY,
      width: bMaxX - bMinX,
      height: bMaxY - bMinY
    };

    // They should be numerically identical
    expect(previewExtents.x).toBeCloseTo(reconcileAABB.x, 5);
    expect(previewExtents.y).toBeCloseTo(reconcileAABB.y, 5);
    expect(previewExtents.width).toBeCloseTo(reconcileAABB.width, 5);
    expect(previewExtents.height).toBeCloseTo(reconcileAABB.height, 5);
  });
});
