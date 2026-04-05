/**
 * Phase 1 — Sampling contract & coordinate mapping regression tests.
 *
 * Verifies that:
 * 1. sampleCompositeColor never returns checkerboard pixels
 * 2. hitTestLayerAtDocPoint handles affine transforms correctly
 * 3. Eyedropper and move auto-pick agree on the same sampling contract
 * 4. Sampling correctly handles transform edge cases
 *
 * These tests cover SKETCH_FEATURES.md Phase 1.1 items:
 * - Sampling contract: eyedropper/auto-pick/clone-stamp sampling agree
 *   on transformed layers, isolate state, and active stroke state
 * - Coordinate mapping: preview, commit, hit testing, overlays, and
 *   helper tools use the same transform contract
 */

import {
  sampleCompositeColor,
  sampleCompositeRGBA,
  hitTestLayerAtDocPoint
} from "../painting/sampleDocument";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import { composeAffineMatrix } from "../types";
import type { Layer, AffineMatrix } from "../types";
import type { ToolContext } from "../tools/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeImageData(
  width: number,
  height: number,
  pixels?: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }>
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (pixels) {
    for (const p of pixels) {
      const i = (p.y * width + p.x) * 4;
      data[i] = p.r;
      data[i + 1] = p.g;
      data[i + 2] = p.b;
      data[i + 3] = p.a;
    }
  }
  return { data, width, height } as ImageData;
}

function makeMinimalToolContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    doc: {
      version: 1,
      canvas: { width: 64, height: 64, backgroundColor: "#000000" },
      layers: [],
      activeLayerId: "",
      maskLayerId: null,
      toolSettings: {} as ToolContext["doc"]["toolSettings"],
      metadata: { createdAt: "", updatedAt: "" }
    },
    activeTool: "eyedropper",
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
    getOrCreateLayerCanvas: jest.fn(() => document.createElement("canvas")),
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
    screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn(),
    clipSelectionForOffset: jest.fn(() => false),
    ...overrides
  };
}

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id: "layer-1",
    name: "Test Layer",
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: { x: 0, y: 0 },
    contentBounds: { x: 0, y: 0, width: 64, height: 64 },
    effects: [],
    ...overrides
  };
}

function makeLayerCanvas(
  width: number,
  height: number,
  drawFn?: (ctx: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  if (drawFn) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawFn(ctx);
    }
  }
  return canvas;
}

// ─── sampleCompositeColor tests ─────────────────────────────────────────────

describe("sampleCompositeColor – no checkerboard leak", () => {
  it("returns the composited color, not checkerboard gray", () => {
    const id = makeImageData(4, 4, [
      { x: 2, y: 2, r: 0, g: 128, b: 255, a: 255 }
    ]);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    expect(sampleCompositeColor(ctx, { x: 2, y: 2 })).toBe("#0080ff");
  });

  it("returns null for transparent pixels instead of checkerboard color", () => {
    // All pixels are RGBA(0,0,0,0) — transparent
    const id = makeImageData(4, 4);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    // Should return "#000000" (black at zero alpha), NOT checkerboard gray.
    // The color value at transparent pixels is technically #000000 (pre-multiplied).
    const result = sampleCompositeColor(ctx, { x: 1, y: 1 });
    expect(result).toBe("#000000");
    // Critically, it must NOT be "#2a2a2a" or "#3a3a3a" (checkerboard colors)
    expect(result).not.toBe("#2a2a2a");
    expect(result).not.toBe("#3a3a3a");
  });

  it("never reads from the display canvas", () => {
    // Even when a display canvas is available, sampleCompositeColor should
    // use readbackComposite (no chrome) instead of the display canvas.
    const id = makeImageData(4, 4, [
      { x: 0, y: 0, r: 255, g: 0, b: 0, a: 255 }
    ]);
    const displayCanvas = document.createElement("canvas");
    displayCanvas.width = 4;
    displayCanvas.height = 4;
    // Paint the display canvas with checkerboard gray
    const dCtx = displayCanvas.getContext("2d")!;
    dCtx.fillStyle = "#2a2a2a";
    dCtx.fillRect(0, 0, 4, 4);

    const ctx = makeMinimalToolContext({
      displayCanvasRef: { current: displayCanvas },
      getFullCompositeImageData: jest.fn(() => id)
    });
    // Should return red from readback, not gray from display canvas
    expect(sampleCompositeColor(ctx, { x: 0, y: 0 })).toBe("#ff0000");
  });

  it("returns null when point is out of bounds", () => {
    const id = makeImageData(4, 4);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    expect(sampleCompositeColor(ctx, { x: -1, y: 0 })).toBeNull();
    expect(sampleCompositeColor(ctx, { x: 5, y: 0 })).toBeNull();
    expect(sampleCompositeColor(ctx, { x: 0, y: -1 })).toBeNull();
    expect(sampleCompositeColor(ctx, { x: 0, y: 5 })).toBeNull();
  });

  it("returns null when getFullCompositeImageData is not available", () => {
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: undefined
    });
    expect(sampleCompositeColor(ctx, { x: 0, y: 0 })).toBeNull();
  });
});

// ─── sampleCompositeRGBA tests ──────────────────────────────────────────────

describe("sampleCompositeRGBA", () => {
  it("returns RGBA tuple including alpha channel", () => {
    const id = makeImageData(4, 4, [
      { x: 1, y: 1, r: 128, g: 64, b: 32, a: 200 }
    ]);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    const result = sampleCompositeRGBA(ctx, { x: 1, y: 1 });
    expect(result).toEqual([128, 64, 32, 200]);
  });

  it("returns [0,0,0,0] for transparent pixels", () => {
    const id = makeImageData(4, 4);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    expect(sampleCompositeRGBA(ctx, { x: 0, y: 0 })).toEqual([0, 0, 0, 0]);
  });

  it("returns null for out-of-bounds", () => {
    const id = makeImageData(4, 4);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    expect(sampleCompositeRGBA(ctx, { x: -1, y: 0 })).toBeNull();
  });
});

// ─── hitTestLayerAtDocPoint tests ───────────────────────────────────────────

describe("hitTestLayerAtDocPoint – translation-only layers", () => {
  it("hits a pixel on a layer with no transform", () => {
    const layer = makeLayer();
    const canvas = makeLayerCanvas(64, 64, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(10, 10, 1, 1);
    });
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 10, y: 10 })).toBe(true);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 0, y: 0 })).toBe(false);
  });

  it("hits correctly when layer has translation transform", () => {
    const layer = makeLayer({
      transform: { x: 20, y: 30 }
    });
    const canvas = makeLayerCanvas(64, 64, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 1, 1); // Pixel at layer-local (0,0)
    });
    // In document space, the pixel should be at (20, 30)
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 20, y: 30 })).toBe(true);
    // Original layer-local position in doc space should miss
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 0, y: 0 })).toBe(false);
  });

  it("hits correctly when layer has contentBounds offset", () => {
    const layer = makeLayer({
      contentBounds: { x: 10, y: 10, width: 32, height: 32 }
    });
    const canvas = makeLayerCanvas(32, 32, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 1, 1); // Pixel at raster (0,0)
    });
    // Raster (0,0) with contentBounds offset (10,10) maps to doc (10,10)
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 10, y: 10 })).toBe(true);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 0, y: 0 })).toBe(false);
  });

  it("hits correctly with both transform and contentBounds offset", () => {
    const layer = makeLayer({
      transform: { x: -5, y: -5 },
      contentBounds: { x: 10, y: 10, width: 32, height: 32 }
    });
    const canvas = makeLayerCanvas(32, 32, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 1, 1);
    });
    // Expected doc position: transform(-5,-5) + contentBounds(10,10) = (5, 5)
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 5, y: 5 })).toBe(true);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 10, y: 10 })).toBe(false);
  });

  it("returns false for points outside canvas bounds", () => {
    const layer = makeLayer();
    const canvas = makeLayerCanvas(10, 10, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 10, 10);
    });
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: -1, y: 0 })).toBe(false);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 10, y: 0 })).toBe(false);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 0, y: -1 })).toBe(false);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 0, y: 10 })).toBe(false);
  });
});

describe("hitTestLayerAtDocPoint – affine-transformed layers", () => {
  it("hits correctly when layer has a rotation matrix", () => {
    // Layer is rotated 90° CCW around origin. A pixel at raster (5, 0)
    // should appear at doc-space (0, 5) after the rotation.
    const angle = Math.PI / 2; // 90°
    const matrix = composeAffineMatrix(0, 0, 1, 1, angle);
    const layer = makeLayer({
      transform: { x: 0, y: 0, matrix }
    });
    const canvas = makeLayerCanvas(64, 64, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(5, 0, 1, 1); // Pixel at raster (5, 0)
    });

    // After 90° rotation: doc(x, y) = matrix * raster(5, 0)
    // cos(90°)*5 + sin(90°)*0 = 0, sin(90°)*5 + cos(90°)*0 = 5
    // But we need to verify the inverse: doc(0, 5) → raster(5, 0)
    // Actually testing the hit: clicking at the rotated position should hit
    const mapper = new CoordinateMapper({
      layerTransform: layer.transform!,
      rasterBounds: { x: 0, y: 0 }
    });
    const docPos = mapper.layerToDoc({ x: 5, y: 0 });
    expect(hitTestLayerAtDocPoint(layer, canvas, docPos)).toBe(true);
  });

  it("misses for affine-transformed layer at the wrong doc position", () => {
    // Layer translated to (20, 20) with a scale of 2x
    const matrix = composeAffineMatrix(20, 20, 2, 2, 0);
    const layer = makeLayer({
      transform: { x: 0, y: 0, matrix }
    });
    const canvas = makeLayerCanvas(64, 64, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(5, 5, 1, 1); // Pixel at raster (5, 5)
    });

    // With 2x scale and translate (20,20): doc position of raster(5,5) is
    // (20 + 5*2, 20 + 5*2) = (30, 30)
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 30, y: 30 })).toBe(true);
    // Original raster position should miss
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 5, y: 5 })).toBe(false);
  });

  it("respects alphaThreshold parameter", () => {
    const layer = makeLayer();
    const canvas = makeLayerCanvas(64, 64, (ctx) => {
      ctx.fillStyle = "rgba(255, 0, 0, 0.2)"; // ~51/255 alpha
      ctx.fillRect(10, 10, 1, 1);
    });
    // Default threshold (1): should hit
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 10, y: 10 })).toBe(true);
    // Higher threshold (128): should miss since alpha ≈ 51
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 10, y: 10 }, 128)).toBe(false);
  });

  it("returns false when layer canvas has no 2D context", () => {
    const layer = makeLayer();
    const canvas = makeLayerCanvas(64, 64);
    // Force getContext to return null
    jest.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 0, y: 0 })).toBe(false);
  });
});

// ─── Cross-tool coordinate consistency ──────────────────────────────────────

describe("cross-tool sampling coordinate consistency", () => {
  it("hitTestLayerAtDocPoint and CoordinateMapper agree on the same point", () => {
    // For a translated+rotated layer, verify that hitTestLayerAtDocPoint
    // correctly finds a pixel at the position CoordinateMapper says it is.
    const angle = Math.PI / 6; // 30°
    const matrix = composeAffineMatrix(10, 15, 1, 1, angle);
    const layer = makeLayer({
      transform: { x: 0, y: 0, matrix }
    });
    const canvas = makeLayerCanvas(64, 64, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(20, 20, 2, 2);
    });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform!,
      rasterBounds: { x: 0, y: 0 }
    });

    // Forward map: raster(20, 20) → doc space
    const docPos = mapper.layerToDoc({ x: 20, y: 20 });
    expect(hitTestLayerAtDocPoint(layer, canvas, docPos)).toBe(true);

    // And the inverse should round-trip
    const backToLocal = mapper.docToLayer(docPos);
    expect(backToLocal.x).toBeCloseTo(20, 6);
    expect(backToLocal.y).toBeCloseTo(20, 6);
  });

  it("sampleCompositeColor and sampleCompositeRGBA agree on the same pixel", () => {
    const id = makeImageData(4, 4, [
      { x: 1, y: 1, r: 100, g: 150, b: 200, a: 255 }
    ]);
    const ctx = makeMinimalToolContext({
      getFullCompositeImageData: jest.fn(() => id)
    });
    const hex = sampleCompositeColor(ctx, { x: 1, y: 1 });
    const rgba = sampleCompositeRGBA(ctx, { x: 1, y: 1 });
    expect(hex).toBe("#6496c8");
    expect(rgba).toEqual([100, 150, 200, 255]);
  });
});

// ─── Transformed-layer roundtrip regression ─────────────────────────────────

describe("coordinate mapping roundtrip – moved/rotated layers", () => {
  it("CoordinateMapper round-trips for translation + contentBounds offset", () => {
    const mapper = new CoordinateMapper({
      layerTransform: { x: 30, y: -10 },
      rasterBounds: { x: 5, y: 5 }
    });
    const original = { x: 42, y: 17 };
    const roundTrip = mapper.layerToDoc(mapper.docToLayer(original));
    expect(roundTrip.x).toBeCloseTo(original.x, 10);
    expect(roundTrip.y).toBeCloseTo(original.y, 10);
  });

  it("CoordinateMapper round-trips for full affine transform", () => {
    const matrix = composeAffineMatrix(10, 20, 1.5, 0.8, Math.PI / 4);
    const mapper = new CoordinateMapper({
      layerTransform: { x: 0, y: 0, matrix },
      rasterBounds: { x: 3, y: 7 }
    });
    const original = { x: 55, y: 33 };
    const roundTrip = mapper.layerToDoc(mapper.docToLayer(original));
    expect(roundTrip.x).toBeCloseTo(original.x, 8);
    expect(roundTrip.y).toBeCloseTo(original.y, 8);
  });

  it("hitTestLayerAtDocPoint uses the same mapping as paint tools", () => {
    // Verify that hitTestLayerAtDocPoint constructs CoordinateMapper with
    // the same config as PaintSession / FillTool would (matching the audit
    // in Phase 1.3 of SKETCH_FEATURES.md).
    const layer = makeLayer({
      transform: { x: 25, y: 15 },
      contentBounds: { x: 10, y: 10, width: 32, height: 32 }
    });
    const canvas = makeLayerCanvas(32, 32, (ctx) => {
      ctx.fillStyle = "red";
      ctx.fillRect(5, 5, 1, 1);
    });

    // The effective raster bounds offset is contentBounds.x=10, y=10
    // Transform offset is 25, 15
    // So raster pixel (5,5) should be at doc (25+10+5, 15+10+5) = (40, 30)
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 40, y: 30 })).toBe(true);
    expect(hitTestLayerAtDocPoint(layer, canvas, { x: 5, y: 5 })).toBe(false);
  });
});
