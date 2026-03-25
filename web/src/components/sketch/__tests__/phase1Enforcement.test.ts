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
  isPixelEditTool,
  isPaintingTool,
  createDefaultDocument
} from "../types";
import { getToolHandler } from "../tools";
import type { ToolContext, ToolPointerEvent } from "../tools";
import { FillTool } from "../tools/FillTool";
import { BlurTool } from "../tools/BlurTool";
import { CloneStampTool } from "../tools/CloneStampTool";
import { ShapeTool } from "../tools/ShapeTool";
import { GradientTool } from "../tools/GradientTool";
import { AdjustTool } from "../tools/AdjustTool";

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const doc = createDefaultDocument(64, 64);
  return {
    doc,
    activeTool: "brush",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "off",
    symmetryRays: 6,
    selection: null,
    displayCanvasRef: { current: null },
    overlayCanvasRef: { current: null },
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
    drawOverlaySelection: jest.fn(),
    drawCursor: jest.fn(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
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

  describe("isPixelEditTool", () => {
    it("returns true for fill", () => {
      expect(isPixelEditTool("fill")).toBe(true);
    });

    it("returns false for move", () => {
      expect(isPixelEditTool("move")).toBe(false);
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
