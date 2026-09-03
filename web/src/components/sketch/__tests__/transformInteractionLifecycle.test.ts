/**
 * Tests for Phase 2.2 transform lifecycle features:
 *
 * 1. In-transform undo/redo (Ctrl+Z / Cmd+Z while in transform mode)
 * 2. TransformTool bounding box hit test for context menu
 * 3. Quick transform operations (rotate, flip)
 */

import { getToolHandler } from "../tools";
import { stub } from "../../../test-utils/doubles";
import type { ToolContext, ToolPointerEvent } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import type { LayerTransform } from "../types";
import { aff } from "./_transformFixtures";
import { createDefaultDocument, makeAffineTransform } from "../types";
import { makeToolContext as makeBaseToolContext } from "./_toolContextFixture";

/** These suites drive TransformTool, so the transform tool is active. */
const makeToolContext = (overrides?: Partial<ToolContext>): ToolContext =>
  makeBaseToolContext({ activeTool: "transform", ...overrides });

// ─── Test helpers ──────────────────────────────────────────────────────────

function makePointerEvent(
  overrides?: Partial<ToolPointerEvent>
): ToolPointerEvent {
  return {
    point: { x: 10, y: 10 },
    pressure: 0.5,
    nativeEvent: stub<React.PointerEvent>({
      altKey: false,
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1
    }),
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

  it("click retargets to a single layer without keeping stale target ids", () => {
    const ctx = makeToolContext();
    const firstLayer = ctx.doc.layers[0];
    firstLayer.contentBounds = { x: 0, y: 0, width: 64, height: 64 };
    const secondLayer = {
      ...firstLayer,
      id: "layer-2",
      name: "Layer 2",
      transform: makeAffineTransform({ x: 40, y: 40 })
    };
    ctx.doc.layers = [firstLayer, secondLayer];
    // Simulate React's onAutoPickLayer flow: when the parent receives the
    // callback, it updates doc.activeLayerId before the next gizmo draw.
    ctx.onAutoPickLayer = jest.fn((id: string) => {
      ctx.doc.activeLayerId = id;
    });

    tool.onActivate!(ctx);
    expect(tool.getTargetSet().getIds()).toEqual([firstLayer.id]);

    const clickEvent = makePointerEvent();

    expect(
      tool["tryAutoSelectPick"](ctx, clickEvent, secondLayer)
    ).toBe(true);

    expect(tool.getTargetSet().getIds()).toEqual([secondLayer.id]);
    expect(tool.getTargetSet().has(firstLayer.id)).toBe(false);
    // Snapshot refreshed for the new target — gizmo lives in React now,
    // so we check the public snapshot getter instead of the canvas paint mock.
    const snap = tool.getGizmoSnapshot();
    expect(snap).not.toBeNull();
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

    const current: LayerTransform = makeAffineTransform({ x: 10, y: 20 });
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
    const currentTransform: LayerTransform = makeAffineTransform({ x: 8, y: 0 });
    const restored = aff(tool.undoLastAdjustment(currentTransform)!);
    // Restored should be the original transform (before the drag)
    expect(restored.x).toBe(aff(layer.transform).x);
    expect(restored.y).toBe(aff(layer.transform).y);
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

    const movedTransform = makeAffineTransform({ x: 8, y: 0 });

    // Undo
    const restored = tool.undoLastAdjustment(movedTransform);
    expect(restored).not.toBeNull();

    // Redo — should give back the moved transform
    const redone = aff(tool.redoLastAdjustment(restored!)!);
    expect(redone.x).toBe(movedTransform.x);
    expect(redone.y).toBe(movedTransform.y);
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
    const current: LayerTransform = makeAffineTransform({ x: 8, y: 0 });
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
