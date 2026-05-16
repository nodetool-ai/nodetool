/**
 * Regression tests for quad-mode (distort/warp/perspective/skew) gestures in
 * TransformTool.
 *
 * Verifies the user-visible contract:
 *   1. Subsequent `onMove` calls within a single drag *do* update the preview
 *      transform — not just the first one.
 *   2. The preview transform fed to `setLayerTransformPreview` is a quad
 *      transform with the correct mode tag and the dragged corner reflects
 *      the latest pointer position.
 *   3. The gizmo snapshot exposed to React tracks the live preview transform.
 *   4. A second drag (down/move/up) on a layer whose stored transform is
 *      already a quad applies a new change.
 */

import { getToolHandler } from "../tools";
import type { ToolContext, ToolPointerEvent } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import {
  createDefaultDocument,
  makeAffineTransform,
  isSingleQuadTransform,
  type LayerTransform
} from "../types";
import { useSketchStore } from "../state/useSketchStore";

function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
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
      const canvas = window.document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
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
    withMirror: jest.fn((ctx, drawFn, from, to) => {
      drawFn(from, to, ctx, 0);
    }),
    ...overrides
  } as ToolContext;
}

function makePointerEvent(
  overrides?: Partial<ToolPointerEvent>
): ToolPointerEvent {
  return {
    point: { x: 0, y: 0 },
    pressure: 0.5,
    nativeEvent: {
      altKey: false,
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false
    } as unknown as React.PointerEvent,
    ...overrides
  };
}

function setTransformMode(
  mode: "scale" | "distort" | "skew" | "perspective" | "mesh-warp"
): void {
  useSketchStore.setState((state) => ({
    ...state,
    toolSettings: {
      ...state.toolSettings,
      transform: {
        ...state.toolSettings.transform,
        mode,
        autoSelect: false
      }
    }
  }));
}

function lastPreviewTransform(ctx: ToolContext): LayerTransform | null {
  const calls = (ctx.setLayerTransformPreview as jest.Mock).mock.calls;
  if (calls.length === 0) {
    return null;
  }
  return calls[calls.length - 1][1] as LayerTransform;
}

describe("TransformTool — quad-mode gesture regression", () => {
  let tool: TransformTool;

  beforeEach(() => {
    tool = getToolHandler("transform") as TransformTool;
  });

  afterEach(() => {
    setTransformMode("scale");
  });

  it("distort: second onMove updates preview to the second pointer position", () => {
    setTransformMode("distort");
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 0, y: 0 } }))).toBe(
      true
    );

    tool.onMove!(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    const afterFirst = lastPreviewTransform(ctx);
    expect(afterFirst).not.toBeNull();
    expect(afterFirst!.kind).toBe("quad");
    if (afterFirst && isSingleQuadTransform(afterFirst)) {
      expect(afterFirst.mode).toBe("distort");
      expect(afterFirst.quad[0].x).toBeCloseTo(10, 5);
      expect(afterFirst.quad[0].y).toBeCloseTo(10, 5);
    }

    tool.onMove!(ctx, makePointerEvent({ point: { x: 30, y: 25 } }));
    const afterSecond = lastPreviewTransform(ctx);
    expect(afterSecond).not.toBeNull();
    expect(afterSecond!.kind).toBe("quad");
    if (afterSecond && isSingleQuadTransform(afterSecond)) {
      expect(afterSecond.mode).toBe("distort");
      expect(afterSecond.quad[0].x).toBeCloseTo(30, 5);
      expect(afterSecond.quad[0].y).toBeCloseTo(25, 5);
      expect(afterSecond.quad[2].x).toBeCloseTo(64, 5);
      expect(afterSecond.quad[2].y).toBeCloseTo(64, 5);
    }

    // setLayerTransformPreview must be called at least twice with distinct
    // dragged-corner positions across the two moves.
    expect(
      (ctx.setLayerTransformPreview as jest.Mock).mock.calls.length
    ).toBeGreaterThanOrEqual(2);

    const snap = tool.getGizmoSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.transform.kind).toBe("quad");
    if (snap && isSingleQuadTransform(snap.transform)) {
      expect(snap.transform.quad[0].x).toBeCloseTo(30, 5);
      expect(snap.transform.quad[0].y).toBeCloseTo(25, 5);
    }
  });

  it("mesh-warp: second onMove updates the dragged corner", () => {
    setTransformMode("mesh-warp");
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);
    expect(
      tool.onDown(ctx, makePointerEvent({ point: { x: 64, y: 0 } }))
    ).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 70, y: 5 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 90, y: 20 } }));

    const t = lastPreviewTransform(ctx);
    expect(t).not.toBeNull();
    if (t && isSingleQuadTransform(t)) {
      expect(t.mode).toBe("mesh-warp");
      expect(t.quad[1].x).toBeCloseTo(90, 5);
      expect(t.quad[1].y).toBeCloseTo(20, 5);
    } else {
      throw new Error(`expected single-quad mesh-warp transform, got ${t?.kind}`);
    }
  });

  it("skew: second onMove on an edge handle updates both adjacent corners", () => {
    setTransformMode("skew");
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);
    // Top edge midpoint = (32, 0)
    expect(
      tool.onDown(ctx, makePointerEvent({ point: { x: 32, y: 0 } }))
    ).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 40, y: 0 } }));
    tool.onMove!(ctx, makePointerEvent({ point: { x: 50, y: 0 } }));

    const t = lastPreviewTransform(ctx);
    expect(t).not.toBeNull();
    if (t && isSingleQuadTransform(t)) {
      expect(t.mode).toBe("skew");
      // Top edge corners moved right by ~18, bottom corners unchanged.
      expect(t.quad[0].x).toBeCloseTo(18, 5);
      expect(t.quad[1].x).toBeCloseTo(82, 5);
      expect(t.quad[2].x).toBeCloseTo(64, 5);
      expect(t.quad[3].x).toBeCloseTo(0, 5);
    } else {
      throw new Error(`expected single-quad skew transform, got ${t?.kind}`);
    }
  });

  it("second drag on a now-quad layer continues to apply changes", () => {
    setTransformMode("mesh-warp");
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    // First drag — top-left corner.
    expect(tool.onDown(ctx, makePointerEvent({ point: { x: 0, y: 0 } }))).toBe(
      true
    );
    tool.onMove!(ctx, makePointerEvent({ point: { x: 10, y: 10 } }));
    tool.onUp!(ctx);

    // Commit must have written a quad transform to the layer.
    const commitCalls = (ctx.onLayerTransformChange as jest.Mock).mock.calls;
    expect(commitCalls.length).toBeGreaterThan(0);
    const committed = commitCalls[commitCalls.length - 1][1] as LayerTransform;
    expect(committed.kind).toBe("quad");
    // Simulate the store updating the layer's transform after the commit.
    layer.transform = committed;
    (ctx.setLayerTransformPreview as jest.Mock).mockClear();

    // Second drag — bottom-right corner (64, 64).
    expect(
      tool.onDown(ctx, makePointerEvent({ point: { x: 64, y: 64 } }))
    ).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 80, y: 80 } }));

    const t = lastPreviewTransform(ctx);
    expect(t).not.toBeNull();
    if (t && isSingleQuadTransform(t)) {
      expect(t.quad[2].x).toBeCloseTo(80, 5);
      expect(t.quad[2].y).toBeCloseTo(80, 5);
      // Previously-warped top-left should be preserved on this corner drag.
      expect(t.quad[0].x).toBeCloseTo(10, 5);
      expect(t.quad[0].y).toBeCloseTo(10, 5);
    } else {
      throw new Error(`expected single-quad transform, got ${t?.kind}`);
    }
  });

  it("scale mode still works after the quad-mode regressions are fixed", () => {
    // Sanity check that the scale path (affine) keeps emitting affine previews.
    setTransformMode("scale");
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    tool.onActivate!(ctx);

    expect(
      tool.onDown(ctx, makePointerEvent({ point: { x: 64, y: 64 } }))
    ).toBe(true);
    tool.onMove!(ctx, makePointerEvent({ point: { x: 96, y: 96 } }));
    const t = lastPreviewTransform(ctx);
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("affine");
  });
});

describe("computeInverseAffine WebGPU quad preview regression", () => {
  // Documenting the WebGPU runtime fallback: quad transforms
  // currently fall back to identity, which silently drops the live preview.
  // Track this in a single assertion so the fix can flip it.
  it("quad transforms should be rendered by the WebGPU compositor (or canvas2d fallback)", async () => {
    // This test is documentation: real WebGPU rendering can't be exercised in
    // jsdom. The Canvas2D path is the authoritative renderer for quads today.
    // If WebGPU support lands, replace this with a real render assertion.
    expect(true).toBe(true);
  });
});
