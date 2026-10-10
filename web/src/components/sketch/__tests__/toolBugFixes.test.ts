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
import { stub } from "../../../test-utils/doubles";
import { FillTool, floodFill } from "../tools/FillTool";
import { GradientTool } from "../tools/GradientTool";
import { setCanvasRasterBounds } from "../transform/geometry/layerGeometry";
import { applyLayerSourceBySelectionMask } from "../rendering/canvas2d/maskAndExport";
import { MoveTool } from "../tools/MoveTool";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import type { Point } from "../types";
import { createDefaultDocument } from "../types";
import { createEmptyMask, ellipseSelectionMask, fillRectMask } from "../selection";
import { makeToolContext } from "./_toolContextFixture";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNativeEvent(
  overrides: Partial<React.PointerEvent> = {}
): React.PointerEvent {
  return stub<React.PointerEvent>({
    clientX: 100,
    clientY: 100,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  });
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

const makeMinimalCtx = (overrides: Partial<ToolContext> = {}): ToolContext =>
  makeToolContext({ activeTool: "crop", ...overrides });

// ─── CropTool ESC cancel ──────────────────────────────────────────────────

describe("CropTool ESC cancel", () => {
  it("onCancel clears gizmo and resets state during active crop", () => {
    const crop = new CropTool();
    const ctx = makeMinimalCtx();

    // Start a crop drag
    crop.onDown(ctx, makeToolPointerEvent({ x: 10, y: 10 }));
    crop.onMove(ctx, makeToolPointerEvent({ x: 50, y: 50 }), []);

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

describe("FillTool on a layer", () => {
  /** A 64x64 layer with a 1px opaque black square outline from 20 to 40. */
  function outlinedLayerContext(overrides: Partial<ToolContext> = {}): {
    ctx: ToolContext;
    pixel: (x: number, y: number) => number[];
  } {
    const ctx = makeToolContext({ activeTool: "fill", foregroundColor: "#ff0000", ...overrides });
    const layerId = ctx.doc.activeLayerId!;
    const canvas = ctx.getOrCreateLayerCanvas(layerId);
    const c2d = canvas.getContext("2d")!;
    c2d.strokeStyle = "#000000";
    c2d.lineWidth = 1;
    c2d.strokeRect(20.5, 20.5, 20, 20);
    ctx.runtime = stub<NonNullable<ToolContext["runtime"]>>({
      applyLayerSourceBySelectionMask: (id: string, ox: number, oy: number, sel, src) =>
        applyLayerSourceBySelectionMask(ctx.layerCanvasesRef.current, id, ox, oy, sel, src)
    });
    const pixel = (x: number, y: number): number[] =>
      Array.from(
        ctx.getOrCreateLayerCanvas(layerId).getContext("2d")!.getImageData(x, y, 1, 1).data
      );
    return { ctx, pixel };
  }

  it("fills the clicked region when a selection is active", () => {
    const selection = createEmptyMask(64, 64);
    fillRectMask(selection, 0, 0, 64, 64, 255);
    const { ctx, pixel } = outlinedLayerContext({ selection });
    new FillTool().onDown(ctx, makeToolPointerEvent({ x: 30, y: 30 }));
    expect(pixel(30, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(5, 5)).toEqual([0, 0, 0, 0]);
  });

  it("keeps transparent pixels transparent under Lock Transparency", () => {
    const { ctx, pixel } = outlinedLayerContext();
    ctx.doc.layers[0].alphaLock = true;
    new FillTool().onDown(ctx, makeToolPointerEvent({ x: 30, y: 30 }));
    expect(pixel(30, 30)[3]).toBe(0);
  });
});

describe("GradientTool on a trimmed layer", () => {
  it("fills the whole canvas, not only the layer's raster", () => {
    const ctx = makeToolContext({ activeTool: "gradient" });
    const layer = ctx.doc.layers[0];
    const small = document.createElement("canvas");
    small.width = 16;
    small.height = 16;
    setCanvasRasterBounds(small, { x: 0, y: 0, width: 16, height: 16 });
    layer.contentBounds = { x: 0, y: 0, width: 16, height: 16 };
    ctx.layerCanvasesRef.current.set(layer.id, small);

    const tool = new GradientTool();
    tool.onDown(ctx, makeToolPointerEvent({ x: 0, y: 32 }));
    tool.onMove(ctx, makeToolPointerEvent({ x: 64, y: 32 }));
    tool.onUp(ctx, makeToolPointerEvent({ x: 64, y: 32 }));

    const canvas = ctx.getOrCreateLayerCanvas(layer.id);
    expect(canvas.width).toBeGreaterThanOrEqual(64);
    expect(canvas.getContext("2d")!.getImageData(50, 50, 1, 1).data[3]).toBe(255);
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
    doc.layers[0].transform = { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

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
    doc.layers[0].transform = { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

    const clearGizmo = jest.fn();
    const ctx = makeMinimalCtx({ doc, clearGizmo });

    move.onActivate!(ctx);

    expect(clearGizmo).toHaveBeenCalled();
  });

  it("uses layer canvas dimensions when available for gizmo", () => {
    const move = new MoveTool();
    const doc = createDefaultDocument(100, 100);
    doc.layers[0].contentBounds = { x: 0, y: 0, width: 50, height: 50 };
    doc.layers[0].transform = { kind: "affine", x: -20, y: -20, scaleX: 1, scaleY: 1, rotation: 0 };

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
    const ox = mask.originX ?? 0;
    const oy = mask.originY ?? 0;

    // The mask now covers the full ellipse bounding box (including beyond canvas)
    expect(mask.width).toBe(70);
    expect(mask.height).toBe(50);
    expect(ox).toBe(-10);
    expect(oy).toBe(0);

    // Check that pixels near the center are selected (doc coord 25, 25)
    expect(mask.data[(25 - oy) * mask.width + (25 - ox)]).toBe(255);

    // Check that pixels at the left edge (x=0) near the center are selected
    expect(mask.data[(25 - oy) * mask.width + (0 - ox)]).toBe(255);

    // Check that pixels beyond the left canvas edge are also in the mask
    expect(mask.data[(25 - oy) * mask.width + (-5 - ox)]).toBe(255);
  });
});
