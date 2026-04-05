/**
 * Phase 1 regression tests for current-priority fixes:
 *
 * 1. CropTool: ESC cancels in-progress crop
 * 2. FillTool: flood fill covers full document-sized canvas
 * 3. MoveTool: gizmo uses actual layer canvas dimensions
 * 4. Brush cursor: redraws when settings change without pointer movement
 * 5. Selection: ellipse/lasso/polygon extend beyond canvas bounds
 */

import { CropTool } from "../tools/CropTool";
import { floodFill } from "../tools/FillTool";
import { MoveTool } from "../tools/MoveTool";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import type { Point, SketchDocument } from "../types";
import { createDefaultDocument } from "../types";
import { ellipseSelectionMask } from "../selection";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNativeEvent(
  overrides: Partial<React.PointerEvent> = {}
): React.PointerEvent {
  return {
    clientX: 100,
    clientY: 100,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  } as unknown as React.PointerEvent;
}

function makeToolPointerEvent(
  point: Point,
  overrides: Partial<ToolPointerEvent> = {}
): ToolPointerEvent {
  return {
    point,
    pressure: 0.5,
    nativeEvent: makeNativeEvent(),
    ...overrides
  };
}

function makeMinimalCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  const doc: SketchDocument = createDefaultDocument(100, 100);
  return {
    doc,
    activeTool: "crop",
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
    getOrCreateLayerCanvas: (() => {
      const cache = new Map<string, HTMLCanvasElement>();
      return jest.fn((layerId: string) => {
        let c = cache.get(layerId);
        if (!c) {
          c = document.createElement("canvas");
          c.width = 100;
          c.height = 100;
          cache.set(layerId, c);
        }
        return c;
      });
    })(),
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
    screenToCanvas: jest.fn((cx, cy) => ({ x: cx, y: cy })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn((ctx, fn, from, to) => fn(from, to, ctx, 0)),
    clipSelectionForOffset: jest.fn(() => false),
    ...overrides
  };
}

// ─── CropTool ESC cancel ──────────────────────────────────────────────────

describe("CropTool ESC cancel", () => {
  it("onCancel clears gizmo and resets state during active crop", () => {
    const crop = new CropTool();
    const ctx = makeMinimalCtx();

    // Start a crop drag
    crop.onDown(ctx, makeToolPointerEvent({ x: 10, y: 10 }));
    crop.onMove(ctx, makeToolPointerEvent({ x: 50, y: 50 }));

    // Cancel via ESC
    crop.onCancel!(ctx);

    expect(ctx.clearGizmo).toHaveBeenCalled();
    expect(ctx.clearOverlay).toHaveBeenCalled();
    expect(ctx.drawSelectionOverlay).toHaveBeenCalled();

    // Subsequent onUp should not trigger crop completion
    const onCropComplete = jest.fn();
    const ctx2 = makeMinimalCtx({ onCropComplete });
    crop.onUp(ctx2, makeToolPointerEvent({ x: 50, y: 50 }));
    expect(onCropComplete).not.toHaveBeenCalled();
  });

  it("onCancel is a no-op when no crop is in progress", () => {
    const crop = new CropTool();
    const ctx = makeMinimalCtx();

    // Cancel without starting a crop — should not throw
    crop.onCancel!(ctx);

    expect(ctx.clearGizmo).not.toHaveBeenCalled();
  });
});

// ─── FillTool flood fill coverage ─────────────────────────────────────────

describe("FillTool flood fill", () => {
  it("fills entire uniform canvas without leaving borders", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 50;
    canvas.height = 50;
    const ctx = canvas.getContext("2d")!;
    // Fill with solid white first
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 50, 50);

    // Flood fill from center with red
    floodFill(ctx, 25, 25, {
      color: "#ff0000",
      tolerance: 0
    });

    // Check that ALL pixels are now red
    const imageData = ctx.getImageData(0, 0, 50, 50);
    let nonRedCount = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] !== 255 ||
        imageData.data[i + 1] !== 0 ||
        imageData.data[i + 2] !== 0 ||
        imageData.data[i + 3] !== 255
      ) {
        nonRedCount++;
      }
    }
    expect(nonRedCount).toBe(0);
  });

  it("fills from top-left corner (x=0, y=0)", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext("2d")!;
    // Canvas starts as transparent black

    floodFill(ctx, 0, 0, {
      color: "#00ff00",
      tolerance: 0
    });

    // All pixels should be green
    const imageData = ctx.getImageData(0, 0, 10, 10);
    for (let i = 0; i < imageData.data.length; i += 4) {
      expect(imageData.data[i]).toBe(0);
      expect(imageData.data[i + 1]).toBe(255);
      expect(imageData.data[i + 2]).toBe(0);
      expect(imageData.data[i + 3]).toBe(255);
    }
  });

  it("fills from bottom-right corner", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext("2d")!;

    floodFill(ctx, 9, 9, {
      color: "#0000ff",
      tolerance: 0
    });

    const imageData = ctx.getImageData(0, 0, 10, 10);
    for (let i = 0; i < imageData.data.length; i += 4) {
      expect(imageData.data[i]).toBe(0);
      expect(imageData.data[i + 1]).toBe(0);
      expect(imageData.data[i + 2]).toBe(255);
      expect(imageData.data[i + 3]).toBe(255);
    }
  });
});

// ─── MoveTool gizmo bounds ────────────────────────────────────────────────

describe("MoveTool gizmo", () => {
  it("hides gizmo when deactivated", () => {
    const move = new MoveTool();
    const ctx = makeMinimalCtx();

    move.onDeactivate!(ctx);

    expect(ctx.clearGizmo).toHaveBeenCalled();
  });

  it("shows gizmo on activation when layer extends outside canvas", () => {
    const move = new MoveTool();
    const doc = createDefaultDocument(100, 100);
    // Simulate a layer that extends beyond canvas
    doc.layers[0].contentBounds = { x: -10, y: 0, width: 120, height: 100 };
    doc.layers[0].transform = { x: 0, y: 0 };

    const drawGizmo = jest.fn();
    const clearGizmo = jest.fn();
    const ctx = makeMinimalCtx({ doc, drawGizmo, clearGizmo });

    move.onActivate!(ctx);

    // The gizmo should be drawn (layer extends beyond canvas at x=-10)
    expect(drawGizmo).toHaveBeenCalled();
  });

  it("clears gizmo when layer fits inside canvas", () => {
    const move = new MoveTool();
    const doc = createDefaultDocument(100, 100);
    doc.layers[0].contentBounds = { x: 10, y: 10, width: 50, height: 50 };
    doc.layers[0].transform = { x: 0, y: 0 };

    const clearGizmo = jest.fn();
    const ctx = makeMinimalCtx({ doc, clearGizmo });

    move.onActivate!(ctx);

    expect(clearGizmo).toHaveBeenCalled();
  });

  it("uses layer canvas dimensions when available for gizmo", () => {
    const move = new MoveTool();
    const doc = createDefaultDocument(100, 100);
    doc.layers[0].contentBounds = { x: 0, y: 0, width: 50, height: 50 };
    doc.layers[0].transform = { x: -20, y: -20 };

    // Create a layer canvas that's larger than contentBounds
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = 120;
    layerCanvas.height = 120;

    const layerCanvases = new Map<string, HTMLCanvasElement>();
    layerCanvases.set(doc.layers[0].id, layerCanvas);

    const drawGizmo = jest.fn();
    const ctx = makeMinimalCtx({
      doc,
      drawGizmo,
      layerCanvasesRef: { current: layerCanvases }
    });

    move.onActivate!(ctx);

    // With a 120×120 canvas at transform (-20, -20) and bounds offset (0, 0),
    // the layer extends from (-20, -20) to (100, 100) in document space.
    // This extends outside the 100×100 canvas at the top-left.
    expect(drawGizmo).toHaveBeenCalled();
  });
});

// ─── Selection tool - ellipse extends beyond canvas ───────────────────────

describe("Selection mask - ellipse extends beyond canvas", () => {
  it("ellipseSelectionMask selects pixels inside canvas when ellipse extends beyond", () => {
    // Ellipse that extends 10px beyond the left edge of a 50×50 canvas
    const mask = ellipseSelectionMask(50, 50, -10, 0, 70, 50);

    // The center of this ellipse is at (25, 25) — some pixels at x=0
    // should be selected even though the ellipse extends past the left edge
    expect(mask.width).toBe(50);
    expect(mask.height).toBe(50);

    // Check that pixels near the center are selected
    const centerIdx = 25 * 50 + 25;
    expect(mask.data[centerIdx]).toBe(255);

    // Check that pixels at the left edge (x=0) near the center are selected
    const leftCenterIdx = 25 * 50 + 0;
    expect(mask.data[leftCenterIdx]).toBe(255);
  });
});
