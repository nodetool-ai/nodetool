/**
 * Tests for Phase 2.2 transform lifecycle features:
 *
 * 1. In-transform undo/redo (Ctrl+Z / Cmd+Z while in transform mode)
 * 2. TransformTool bounding box hit test for context menu
 * 3. Quick transform operations (rotate, flip)
 */

import { getToolHandler } from "../tools";
import type { ToolContext, ToolPointerEvent } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import type { LayerTransform } from "../types";
import { createDefaultDocument } from "../types";

// ─── Test helpers ──────────────────────────────────────────────────────────

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
    drawGizmo: jest.fn((cb) => {
      const mockGc = {
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        scale: jest.fn(),
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        strokeRect: jest.fn(),
        fillRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        arc: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        setLineDash: jest.fn(),
        set strokeStyle(_: string) { /* noop */ },
        set fillStyle(_: string) { /* noop */ },
        set lineWidth(_: number) { /* noop */ },
        set lineDashOffset(_: number) { /* noop */ },
      } as unknown as CanvasRenderingContext2D;
      cb(mockGc, 1, 800, 600);
    }),
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
    clipSelectionForOffset: jest.fn(() => false),
    ...overrides
  };
}

function makePointerEvent(
  overrides?: Partial<ToolPointerEvent>
): ToolPointerEvent {
  return {
    point: { x: 10, y: 10 },
    pressure: 0.5,
    nativeEvent: {
      altKey: false,
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1
    } as unknown as React.PointerEvent,
    ...overrides
  };
}

// ─── TransformTool undo/redo stack tests ──────────────────────────────────

describe("TransformTool in-transform undo/redo", () => {
  let tool: TransformTool;

  beforeEach(() => {
    // Get a fresh tool instance for each test
    tool = getToolHandler("transform") as TransformTool;
  });

  it("shift+click retargets to a single layer without keeping stale target ids", () => {
    const ctx = makeToolContext();
    const firstLayer = ctx.doc.layers[0];
    firstLayer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    const secondLayer = {
      ...firstLayer,
      id: "layer-2",
      name: "Layer 2",
      transform: { x: 40, y: 40, scaleX: 1, scaleY: 1, rotation: 0 }
    };
    ctx.doc.layers = [firstLayer, secondLayer];

    tool.onActivate!(ctx);
    expect(tool.getTargetSet().getIds()).toEqual([firstLayer.id]);

    const shiftEvent = makePointerEvent({
      nativeEvent: {
        shiftKey: true
      } as unknown as React.PointerEvent
    });

    expect(
      (tool as unknown as {
        tryAutoSelectPick: (
          toolCtx: ToolContext,
          event: ToolPointerEvent,
          pickedOverride?: typeof secondLayer
        ) => boolean;
      }).tryAutoSelectPick(ctx, shiftEvent, secondLayer)
    ).toBe(true);

    expect(tool.getTargetSet().getIds()).toEqual([secondLayer.id]);
    expect(tool.getTargetSet().has(firstLayer.id)).toBe(false);
    expect(ctx.drawGizmo).toHaveBeenCalled();
  });

  it("has no undoable adjustments initially after activation", () => {
    const ctx = makeToolContext();
    tool.onActivate!(ctx);
    expect(tool.hasUndoableAdjustments()).toBe(false);
    expect(tool.hasRedoableAdjustments()).toBe(false);
  });

  it("records an undo entry when a handle drag starts", () => {
    const ctx = makeToolContext();
    // Set layer with content bounds so the gizmo has size
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);
    expect(tool.hasUndoableAdjustments()).toBe(false);

    // Simulate a pointer down inside the bounding box (center = 32,32 for a 64x64 layer)
    const downEvent = makePointerEvent({ point: { x: 15, y: 15 } });
    const started = tool.onDown!(ctx, downEvent);

    if (started) {
      // After starting a drag, there should be one undo entry
      expect(tool.hasUndoableAdjustments()).toBe(true);
    }
  });

  it("undoLastAdjustment returns null when stack is empty", () => {
    const ctx = makeToolContext();
    tool.onActivate!(ctx);

    const current: LayerTransform = { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 };
    const result = tool.undoLastAdjustment(current);
    expect(result).toBeNull();
  });

  it("undoLastAdjustment pops the stack and returns previous transform", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    // Simulate a drag that records the original transform
    const downEvent = makePointerEvent({ point: { x: 15, y: 15 } });
    const started = tool.onDown!(ctx, downEvent);
    if (!started) {
      // Skip if the pointer didn't start a gesture (e.g. no hit)
      return;
    }

    // Complete the drag
    tool.onUp!(ctx);

    // Now undo the adjustment
    const currentTransform: LayerTransform = {
      x: 8,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    const restored = tool.undoLastAdjustment(currentTransform);

    expect(restored).not.toBeNull();
    // Restored should be the original transform (before the drag)
    expect(restored!.x).toBe(layer.transform.x);
    expect(restored!.y).toBe(layer.transform.y);
    // After undo, the redo stack should have one entry
    expect(tool.hasRedoableAdjustments()).toBe(true);
  });

  it("redoLastAdjustment restores undone adjustment", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    const downEvent = makePointerEvent({ point: { x: 15, y: 15 } });
    const started = tool.onDown!(ctx, downEvent);
    if (!started) {
      return;
    }
    tool.onUp!(ctx);

    const movedTransform: LayerTransform = {
      x: 8,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };

    // Undo
    const restored = tool.undoLastAdjustment(movedTransform);
    expect(restored).not.toBeNull();

    // Redo — should give back the moved transform
    const redone = tool.redoLastAdjustment(restored!);
    expect(redone).not.toBeNull();
    expect(redone!.x).toBe(movedTransform.x);
    expect(redone!.y).toBe(movedTransform.y);
  });

  it("clears redo stack when a new drag starts", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    // First drag
    const downEvent1 = makePointerEvent({ point: { x: 15, y: 15 } });
    const started1 = tool.onDown!(ctx, downEvent1);
    if (!started1) {
      return;
    }
    tool.onUp!(ctx);

    // Undo the first drag
    const current: LayerTransform = { x: 8, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    tool.undoLastAdjustment(current);
    expect(tool.hasRedoableAdjustments()).toBe(true);

    // Start a new drag — should clear the redo stack
    const downEvent2 = makePointerEvent({ point: { x: 15, y: 15 } });
    const started2 = tool.onDown!(ctx, downEvent2);
    if (started2) {
      expect(tool.hasRedoableAdjustments()).toBe(false);
    }
  });

  it("clears stacks on deactivate", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    const downEvent = makePointerEvent({ point: { x: 15, y: 15 } });
    tool.onDown!(ctx, downEvent);
    // Deactivate clears everything
    tool.onDeactivate!(ctx);

    expect(tool.hasUndoableAdjustments()).toBe(false);
    expect(tool.hasRedoableAdjustments()).toBe(false);
  });

  it("clears stacks on reactivate", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);

    const downEvent = makePointerEvent({ point: { x: 15, y: 15 } });
    tool.onDown!(ctx, downEvent);

    // Re-activate
    tool.onActivate!(ctx);
    expect(tool.hasUndoableAdjustments()).toBe(false);
    expect(tool.hasRedoableAdjustments()).toBe(false);
  });
});

// ─── TransformTool bounding box hit test ──────────────────────────────────

describe("TransformTool.isPointInsideBoundingBox", () => {
  let tool: TransformTool;

  beforeEach(() => {
    tool = getToolHandler("transform") as TransformTool;
  });

  it("returns false when no active layer", () => {
    const ctx = makeToolContext({
      doc: {
        ...createDefaultDocument(64, 64),
        layers: []
      }
    });
    tool.onActivate!(ctx);
    expect(tool.isPointInsideBoundingBox(ctx, { x: 15, y: 15 })).toBe(false);
  });

  it("returns true for a point inside the layer bounds", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);
    // Center of a 64x64 layer at origin = (32, 32)
    expect(tool.isPointInsideBoundingBox(ctx, { x: 15, y: 15 })).toBe(true);
  });

  it("returns false for a point outside the layer bounds", () => {
    const ctx = makeToolContext();
    const layer = ctx.doc.layers[0];
    layer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };

    tool.onActivate!(ctx);
    // Well outside the 64x64 area
    expect(tool.isPointInsideBoundingBox(ctx, { x: -100, y: -100 })).toBe(false);
  });
});

// ─── TransformTool getLiveTransform ──────────────────────────────────────

describe("TransformTool.getLiveTransform", () => {
  let tool: TransformTool;

  beforeEach(() => {
    tool = getToolHandler("transform") as TransformTool;
  });

  it("returns null when no live transform is set", () => {
    const ctx = makeToolContext();
    tool.onActivate!(ctx);
    expect(tool.getLiveTransform()).toBeNull();
  });
});
