/**
 * Phase 1 sketch editor enforcement tests.
 *
 * Covers:
 * 1. EditActionKind type system helpers
 * 2. Locked-layer rejection for all pixel-edit tool handlers
 * 3. AdjustTool registration in the tool handler registry
 */

import {
  editActionKindForTool,
  isTransformOnlyTool,
  isPaintingTool,
  createDefaultDocument
} from "../types";
import { stub } from "../../../test-utils/doubles";
import { getToolHandler } from "../tools";
import type { ToolContext, ToolPointerEvent } from "../tools";
import { FillTool } from "../tools/FillTool";
import { BlurTool } from "../tools/BlurTool";
import { CloneStampTool } from "../tools/CloneStampTool";
import { ShapeTool } from "../tools/ShapeTool";
import { GradientTool } from "../tools/GradientTool";
import { AdjustTool } from "../tools/AdjustTool";
import { makeToolContext } from "./_toolContextFixture";

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

/** Build a ToolContext whose active layer is locked. */
function makeLockedLayerContext(): ToolContext {
  const doc = createDefaultDocument(64, 64);
  const active = doc.layers.find((l) => l.id === doc.activeLayerId);
  if (active) {
    active.locked = true;
  }
  return makeToolContext({ doc });
}

// ─── 1. EditActionKind type system ─────────────────────────────────────────

describe("EditActionKind helpers", () => {
  describe("editActionKindForTool", () => {
    it('returns "transform-only" for move', () => {
      expect(editActionKindForTool("move")).toBe("transform-only");
    });

    it('returns "pixel-edit" for brush', () => {
      expect(editActionKindForTool("brush")).toBe("pixel-edit");
    });

    it('returns "none" for eyedropper', () => {
      expect(editActionKindForTool("eyedropper")).toBe("none");
    });
  });

  describe("isTransformOnlyTool", () => {
    it("returns true for move", () => {
      expect(isTransformOnlyTool("move")).toBe(true);
    });

    it("returns false for brush", () => {
      expect(isTransformOnlyTool("brush")).toBe(false);
    });
  });

  describe("isPaintingTool", () => {
    it("returns true for blur", () => {
      expect(isPaintingTool("blur")).toBe(true);
    });

    it("returns false for move", () => {
      expect(isPaintingTool("move")).toBe(false);
    });
  });
});

// ─── 2. Locked layer enforcement ──────────────────────────────────────────

describe("Locked layer rejection for pixel-edit tools", () => {
  it("FillTool rejects stroke on locked layer", () => {
    const tool = new FillTool();
    const ctx = makeLockedLayerContext();
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(false);
    expect(ctx.onStrokeStart).not.toHaveBeenCalled();
  });

  it("BlurTool rejects stroke on locked layer", () => {
    const tool = new BlurTool();
    const ctx = makeLockedLayerContext();
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(false);
    expect(ctx.onStrokeStart).not.toHaveBeenCalled();
  });

  it("CloneStampTool rejects stroke on locked layer", () => {
    const tool = new CloneStampTool();
    // Set a clone source so the tool doesn't bail out early for missing source
    tool.setCloneSource({ x: 0, y: 0 });
    const ctx = makeLockedLayerContext();
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(false);
    expect(ctx.onStrokeStart).not.toHaveBeenCalled();
  });

  it("ShapeTool rejects stroke on locked layer", () => {
    const tool = new ShapeTool();
    const ctx = makeLockedLayerContext();
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(false);
    expect(ctx.onStrokeStart).not.toHaveBeenCalled();
  });

  it("GradientTool rejects stroke on locked layer", () => {
    const tool = new GradientTool();
    const ctx = makeLockedLayerContext();
    const result = tool.onDown(ctx, makePointerEvent());
    expect(result).toBe(false);
    expect(ctx.onStrokeStart).not.toHaveBeenCalled();
  });
});

// ─── 3. AdjustTool registration ───────────────────────────────────────────

describe("AdjustTool registration", () => {
  it('getToolHandler("adjust") returns a valid handler with toolId "adjust"', () => {
    const handler = getToolHandler("adjust");
    expect(handler).toBeDefined();
    expect(handler).toBeInstanceOf(AdjustTool);
    expect(handler.toolId).toBe("adjust");
  });
});
