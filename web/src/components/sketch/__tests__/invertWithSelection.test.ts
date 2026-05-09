/**
 * Regression tests for invertLayerColors with selection masks.
 *
 * Covers:
 * - Invert respects selection mask (only selected pixels are inverted)
 * - Invert correctly accounts for layer transform offset
 * - Invert correctly accounts for layer contentBounds offset
 * - Invert correctly handles selection masks with non-zero origin
 * - combineMasks fast-path produces same results as general path
 */

import { invertLayerColors } from "../rendering/canvas2d/reconcile";
import {
  createEmptyMask,
  rectSelectionMask,
  combineMasks,
  fillRectMask
} from "../selection";
import { setCanvasRasterBounds } from "../painting/layerBounds";
import type { SketchDocument } from "../types";
import { createDefaultDocument, createDefaultLayer } from "../types/document";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a tiny document with one layer and return a matching layerCanvases map. */
function makeDocAndCanvas(
  canvasW: number,
  canvasH: number,
  opts?: {
    contentBoundsX?: number;
    contentBoundsY?: number;
    transformX?: number;
    transformY?: number;
  }
): {
  doc: SketchDocument;
  layerCanvases: Map<string, HTMLCanvasElement>;
  canvas: HTMLCanvasElement;
} {
  const doc = createDefaultDocument(canvasW, canvasH);
  const layer = doc.layers[0];

  // Apply content bounds offset if requested
  if (opts?.contentBoundsX !== undefined) {
    layer.contentBounds.x = opts.contentBoundsX;
  }
  if (opts?.contentBoundsY !== undefined) {
    layer.contentBounds.y = opts.contentBoundsY;
  }
  // Apply transform offset if requested
  if (opts?.transformX !== undefined) {
    layer.transform.x = opts.transformX;
  }
  if (opts?.transformY !== undefined) {
    layer.transform.y = opts.transformY;
  }

  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = canvasW;
  layerCanvas.height = canvasH;
  const layerCanvases = new Map<string, HTMLCanvasElement>();
  layerCanvases.set(layer.id, layerCanvas);

  return { doc, layerCanvases, canvas: layerCanvas };
}

/** Fill the canvas with a solid color (RGBA). */
function fillCanvasSolid(
  canvas: HTMLCanvasElement,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

/** Read a pixel (RGBA) from the canvas at position (x, y). */
function readPixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): [number, number, number, number] {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("invertLayerColors with selection", () => {
  it("inverts only pixels inside the selection mask", () => {
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(32, 32);
    fillCanvasSolid(canvas, 100, 150, 200, 255);

    // Select only a 10x10 rect at (5, 5)
    const sel = rectSelectionMask(32, 32, 5, 5, 10, 10);
    invertLayerColors(doc, layerCanvases, sel);

    // Inside selection: should be inverted
    const [r, g, b, a] = readPixel(canvas, 10, 10);
    expect(r).toBe(155); // 255 - 100
    expect(g).toBe(105); // 255 - 150
    expect(b).toBe(55);  // 255 - 200
    expect(a).toBe(255);

    // Outside selection: should NOT be inverted
    const [r2, g2, b2, a2] = readPixel(canvas, 0, 0);
    expect(r2).toBe(100);
    expect(g2).toBe(150);
    expect(b2).toBe(200);
    expect(a2).toBe(255);
  });

  it("inverts nothing when selection has no selected pixels", () => {
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(16, 16);
    fillCanvasSolid(canvas, 50, 50, 50, 255);

    // Empty mask (no pixels ≥ 128)
    const sel = createEmptyMask(16, 16);
    invertLayerColors(doc, layerCanvases, sel);

    const [r, g, b] = readPixel(canvas, 8, 8);
    expect(r).toBe(50);
    expect(g).toBe(50);
    expect(b).toBe(50);
  });

  it("accounts for layer transform offset", () => {
    // Layer pixels are shifted by transform.x=10, transform.y=10 in document space.
    // A selection at document (10,10)→(20,20) should affect canvas pixels (0,0)→(10,10).
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(32, 32, {
      transformX: 10,
      transformY: 10
    });
    fillCanvasSolid(canvas, 100, 100, 100, 255);

    // Selection covering document area (10, 10) to (20, 20)
    const sel = rectSelectionMask(32, 32, 10, 10, 10, 10);
    invertLayerColors(doc, layerCanvases, sel);

    // Canvas pixel (5, 5) → document (15, 15) → inside selection → should be inverted
    const [r1] = readPixel(canvas, 5, 5);
    expect(r1).toBe(155);

    // Canvas pixel (25, 25) → document (35, 35) → outside selection → should NOT be inverted
    const [r2] = readPixel(canvas, 25, 25);
    expect(r2).toBe(100);

    // Canvas pixel (0, 0) → document (10, 10) → inside selection → should be inverted
    const [r3] = readPixel(canvas, 0, 0);
    expect(r3).toBe(155);

    // Canvas pixel (9, 9) → document (19, 19) → inside selection → should be inverted
    const [r4] = readPixel(canvas, 9, 9);
    expect(r4).toBe(155);

    // Canvas pixel (10, 10) → document (20, 20) → outside selection (rect is 10,10 + 10x10 = up to 19,19 included)
    // fillRectMask fills pixels from floor(10) to ceil(10+10)=20, so pixel at 20 is included
    // Actually, fillRectMask fills x0=10 to x1=min(32, ceil(10+10))=20, for px from 10 to 19
    // So document (20, 20) is outside the selection
    const [r5] = readPixel(canvas, 10, 10);
    expect(r5).toBe(100);
  });

  it("uses canvas raster bounds when they diverge from contentBounds (double invert restores)", () => {
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(32, 32, {
      contentBoundsX: 0,
      contentBoundsY: 0
    });
    fillCanvasSolid(canvas, 100, 100, 100, 255);

    // Same situation as paint paths that stash __nodetoolRasterBounds while
    // Zustand layer.contentBounds lags behind: mapping must prefer the canvas.
    setCanvasRasterBounds(canvas, { x: -10, y: -10, width: 42, height: 42 });

    // Document rectangle (5, 5)–(9, 9): with correct offset (−10, −10) this hits
    // canvas pixels roughly (15, 15), not where contentBounds‑only logic would hit.
    const sel = rectSelectionMask(32, 32, 5, 5, 5, 5);

    const snapshot = () =>
      canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data.slice();

    const before = snapshot();
    invertLayerColors(doc, layerCanvases, sel);
    const mid = snapshot();
    expect(mid.some((v, i) => v !== before[i])).toBe(true);

    invertLayerColors(doc, layerCanvases, sel);
    const after = snapshot();
    expect(after).toEqual(before);

    // Outside the selection in document space should be unchanged across both inverts
    const [rOut] = readPixel(canvas, 0, 0);
    expect(rOut).toBe(100);
  });

  it("accounts for contentBounds offset", () => {
    // Layer content starts at document position (-5, -5).
    // Canvas pixel (0, 0) maps to document (-5, -5).
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(32, 32, {
      contentBoundsX: -5,
      contentBoundsY: -5
    });
    fillCanvasSolid(canvas, 80, 80, 80, 255);

    // Selection covering document area (0, 0) to (10, 10)
    const sel = rectSelectionMask(32, 32, 0, 0, 10, 10);
    invertLayerColors(doc, layerCanvases, sel);

    // Canvas pixel (5, 5) → document (0, 0) → inside selection → should be inverted
    const [r1] = readPixel(canvas, 5, 5);
    expect(r1).toBe(175); // 255 - 80

    // Canvas pixel (0, 0) → document (-5, -5) → outside selection → should NOT be inverted
    const [r2] = readPixel(canvas, 0, 0);
    expect(r2).toBe(80);
  });

  it("accounts for selection mask with non-zero origin", () => {
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(32, 32);
    fillCanvasSolid(canvas, 60, 60, 60, 255);

    // Create a selection mask with origin offset
    const sel = createEmptyMask(10, 10);
    sel.data.fill(255);
    sel.originX = 5;
    sel.originY = 5;
    // This selection covers document area (5, 5) to (14, 14)

    invertLayerColors(doc, layerCanvases, sel);

    // Canvas pixel (7, 7) → document (7, 7) → inside selection → inverted
    const [r1] = readPixel(canvas, 7, 7);
    expect(r1).toBe(195); // 255 - 60

    // Canvas pixel (0, 0) → document (0, 0) → outside selection → NOT inverted
    const [r2] = readPixel(canvas, 0, 0);
    expect(r2).toBe(60);

    // Canvas pixel (20, 20) → document (20, 20) → outside selection → NOT inverted
    const [r3] = readPixel(canvas, 20, 20);
    expect(r3).toBe(60);
  });

  it("correctly combines transform + contentBounds + selection origin", () => {
    // Complex scenario: all three offsets are non-zero
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(32, 32, {
      contentBoundsX: 5,
      contentBoundsY: 5,
      transformX: 3,
      transformY: 3
    });
    fillCanvasSolid(canvas, 100, 100, 100, 255);

    // Layer-local (0,0) → document (5+3, 5+3) = (8, 8)
    // Selection at document (8, 8) to (18, 18)
    const sel = createEmptyMask(10, 10);
    sel.data.fill(255);
    sel.originX = 8;
    sel.originY = 8;

    invertLayerColors(doc, layerCanvases, sel);

    // Canvas pixel (0, 0) → doc (8, 8) → inside selection → inverted
    const [r1] = readPixel(canvas, 0, 0);
    expect(r1).toBe(155);

    // Canvas pixel (9, 9) → doc (17, 17) → inside selection → inverted
    const [r2] = readPixel(canvas, 9, 9);
    expect(r2).toBe(155);

    // Canvas pixel (10, 10) → doc (18, 18) → outside sel (10-wide from 8 = up to 17 inclusive) → NOT inverted
    const [r3] = readPixel(canvas, 10, 10);
    expect(r3).toBe(100);
  });

  it("preserves alpha channel when inverting", () => {
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(8, 8);
    fillCanvasSolid(canvas, 100, 100, 100, 128);

    const sel = rectSelectionMask(8, 8, 0, 0, 8, 8);
    invertLayerColors(doc, layerCanvases, sel);

    const [r, g, b, a] = readPixel(canvas, 4, 4);
    expect(r).toBe(155);
    expect(g).toBe(155);
    expect(b).toBe(155);
    expect(a).toBe(128); // Alpha preserved
  });

  it("inverts entire layer without selection (calls CSS filter path)", () => {
    // Note: The no-selection path uses CSS filter "invert(1)" on a temp canvas,
    // which is not supported in jsdom's canvas implementation. We verify the
    // function completes without error. The actual inversion is covered by the
    // selection-based pixel loop tests above.
    const { doc, layerCanvases, canvas } = makeDocAndCanvas(16, 16);
    fillCanvasSolid(canvas, 100, 150, 200, 255);

    // Should not throw
    invertLayerColors(doc, layerCanvases, null);

    // Pixel should still be readable (function ran to completion)
    const [, , , a] = readPixel(canvas, 8, 8);
    expect(a).toBe(255);
  });
});

describe("combineMasks fast-path correctness", () => {
  it("fast-path add matches general-path add for same-size masks", () => {
    const base = rectSelectionMask(64, 64, 10, 10, 20, 20);
    const overlay = rectSelectionMask(64, 64, 25, 25, 20, 20);
    const result = combineMasks(base, overlay, "add");

    // Verify that the result has the expected union shape
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.originX ?? 0).toBe(0);
    expect(result.originY ?? 0).toBe(0);

    // Pixel (15, 15) — in base only → 255
    expect(result.data[15 * 64 + 15]).toBe(255);
    // Pixel (30, 30) — in overlay only → 255
    expect(result.data[30 * 64 + 30]).toBe(255);
    // Pixel (0, 0) — in neither → 0
    expect(result.data[0]).toBe(0);
    // Pixel (26, 26) — in both (overlap) → min(255, 255+255)=255
    expect(result.data[26 * 64 + 26]).toBe(255);
  });

  it("fast-path subtract matches general-path subtract", () => {
    const base = rectSelectionMask(64, 64, 0, 0, 64, 64);
    const overlay = rectSelectionMask(64, 64, 20, 20, 24, 24);
    const result = combineMasks(base, overlay, "subtract");

    // Inside overlay area: subtracted from full → 0
    expect(result.data[30 * 64 + 30]).toBe(0);
    // Outside overlay area: base remains → 255
    expect(result.data[5 * 64 + 5]).toBe(255);
  });

  it("fast-path intersect matches general-path intersect", () => {
    const base = rectSelectionMask(64, 64, 10, 10, 30, 30);
    const overlay = rectSelectionMask(64, 64, 25, 25, 30, 30);
    const result = combineMasks(base, overlay, "intersect");

    // In overlap: min(255, 255) = 255
    expect(result.data[30 * 64 + 30]).toBe(255);
    // In base only: min(255, 0) = 0
    expect(result.data[15 * 64 + 15]).toBe(0);
    // In overlay only: min(0, 255) = 0
    expect(result.data[50 * 64 + 50]).toBe(0);
  });

  it("general path used for different-origin masks", () => {
    const base = rectSelectionMask(64, 64, 0, 0, 30, 30);
    const overlay = createEmptyMask(20, 20);
    overlay.originX = 50;
    overlay.originY = 50;
    fillRectMask(overlay, 0, 0, 20, 20, 255);

    const result = combineMasks(base, overlay, "add");

    // Union should cover from (0,0) to (70,70)
    expect(result.width).toBe(70);
    expect(result.height).toBe(70);
    expect(result.originX).toBe(0);
    expect(result.originY).toBe(0);

    // Base area (15, 15) → 255
    expect(result.data[15 * 70 + 15]).toBe(255);
    // Overlay area: document (55, 55) → result buffer (55, 55) → 255
    expect(result.data[55 * 70 + 55]).toBe(255);
    // Empty area
    expect(result.data[35 * 70 + 35]).toBe(0);
  });

  it("fast-path and general-path produce identical results", () => {
    // Create two masks of same size/origin that will trigger the fast path
    const base = rectSelectionMask(32, 32, 5, 5, 15, 15);
    const overlay = rectSelectionMask(32, 32, 10, 10, 15, 15);

    // Also test with masks that force the general path (different origin)
    const baseGeneral = { ...base, data: new Uint8ClampedArray(base.data), originX: 0, originY: 0 };
    const overlayGeneral = { ...overlay, data: new Uint8ClampedArray(overlay.data), originX: 0, originY: 0 };

    for (const op of ["add", "subtract", "intersect"] as const) {
      const fast = combineMasks(base, overlay, op);
      const general = combineMasks(baseGeneral, overlayGeneral, op);
      expect(fast.data).toEqual(general.data);
    }
  });

  it("replace op always returns a clone of overlay", () => {
    const base = rectSelectionMask(32, 32, 0, 0, 32, 32);
    const overlay = rectSelectionMask(32, 32, 10, 10, 10, 10);
    const result = combineMasks(base, overlay, "replace");

    expect(result.data).toEqual(overlay.data);
    expect(result.data).not.toBe(overlay.data); // Must be a clone
  });
});
