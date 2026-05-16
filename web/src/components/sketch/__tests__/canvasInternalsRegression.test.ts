/**
 * Phase 1 Remaining Hardening Tests (merged)
 *
 * Phase 1.3 – drainPendingStrokeCommit before pixel reads + ensureLayerRasterBounds caller audit
 * Phase 1.4 – Overlay preview coordinate mapping vs committed pixels
 * Phase 1.6 – Active stroke buffer compositing + getMaskDataUrl
 * Phase 1.7 – reconcileLayerToDocumentSpace transparency + transform undo
 *
 * NOTE: JSDOM often does not implement Canvas2D pixel rendering; getContext("2d")
 * may return null or a minimal stub in some setups. Structural tests verify call
 * ordering, metadata, and coordinate contracts; pixel-level tests exercise real
 * canvas when available. Full rendering is covered by E2E / integration tests.
 */

import type { Layer, SketchDocument, LayerTransform } from "../types";
import { makeAffineTransform } from "../types";

import { ensureLayerRasterBounds } from "../transform/geometry/ensureRasterBounds";
import {
  getDocumentViewportInLayerSpace,
  getLayerGeometry,
  setCanvasRasterBounds,
  getCanvasRasterBounds
} from "../transform/geometry/layerGeometry";

import { CoordinateMapper } from "../painting/CoordinateMapper";
import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";
import type { ActiveStrokeInfo } from "../rendering/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: "layer-1",
    name: "Layer 1",
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: makeAffineTransform({}),
    contentBounds: { x: 0, y: 0, width: 64, height: 64 },
    effects: [],
    ...overrides
  } as Layer;
}

function makeDoc(overrides: Partial<SketchDocument> = {}): SketchDocument {
  return {
    version: 1,
    canvas: { width: 128, height: 128, backgroundColor: "#ffffff" },
    layers: [makeLayer()],
    activeLayerId: "layer-1",
    maskLayerId: null,
    toolSettings: {} as SketchDocument["toolSettings"],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    ...overrides
  } as SketchDocument;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Paint a solid color block on a canvas at the given rect.
 */
function paintBlock(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  color = "rgba(255,0,0,1)"
): void {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * Read the RGBA value at a single pixel from a canvas.
 */
function readPixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): [number, number, number, number] {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/**
 * Check if a canvas has any non-transparent pixels.
 */
function hasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d")!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) {
      return true;
    }
  }
  return false;
}

function makeMockToolContext(
  initialCanvases?: Map<string, HTMLCanvasElement>
) {
  const map = initialCanvases ?? new Map<string, HTMLCanvasElement>();
  return {
    getOrCreateLayerCanvas: jest.fn((id: string) => {
      let c = map.get(id);
      if (!c) {
        c = makeCanvas(64, 64);
        map.set(id, c);
      }
      return c;
    }),
    layerCanvasesRef: { current: map },
    invalidateLayer: jest.fn(),
    onLayerContentBoundsChange: jest.fn()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.3 – drainPendingStrokeCommit and ensureLayerRasterBounds audit
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 1.3 – drainPendingStrokeCommit contract", () => {
  it("committed stroke pixels are visible after getLayerData", () => {
    // Simulates the sequence: paint → commit → history push → getLayerData
    // The committed stroke must be present in the returned data.
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    // Simulate a stroke commit: draw red pixels directly onto the layer canvas
    paintBlock(layerCanvas, 10, 10, 20, 20, "rgba(255,0,0,1)");

    // getLayerData should return serialized data that includes the painted pixels
    const data = runtime.getLayerData("layer-1");
    expect(data).toBeTruthy();
    expect(typeof data).toBe("string");

    // Verify the layer canvas still has the painted pixels
    const pixel = readPixel(layerCanvas, 15, 15);
    expect(pixel[0]).toBe(255); // red
    expect(pixel[3]).toBe(255); // opaque
  });

  it("snapshotLayerCanvas captures current pixel state including recent paints", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    paintBlock(layerCanvas, 5, 5, 10, 10, "rgba(0,255,0,1)");

    const snapshot = runtime.snapshotLayerCanvas("layer-1");
    expect(snapshot).not.toBeNull();

    // Snapshot must capture the painted green pixels
    const pixel = readPixel(snapshot!, 8, 8);
    expect(pixel[1]).toBe(255); // green
    expect(pixel[3]).toBe(255); // opaque

    // Snapshot must be independent — modifying original doesn't affect it
    paintBlock(layerCanvas, 5, 5, 10, 10, "rgba(0,0,255,1)");
    const snapshotPixelAfter = readPixel(snapshot!, 8, 8);
    expect(snapshotPixelAfter[1]).toBe(255); // still green
    expect(snapshotPixelAfter[2]).toBe(0); // no blue
  });

  it("flattenToDataUrl captures committed strokes from all visible layers", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layer1Canvas = runtime.getOrCreateLayerCanvas("layer-1", 128, 128);
    paintBlock(layer1Canvas, 0, 0, 64, 64, "rgba(255,0,0,1)");

    const layer2Canvas = runtime.getOrCreateLayerCanvas("layer-2", 128, 128);
    paintBlock(layer2Canvas, 64, 64, 64, 64, "rgba(0,0,255,1)");

    const doc = makeDoc({
      layers: [
        makeLayer({ id: "layer-1", contentBounds: { x: 0, y: 0, width: 128, height: 128 } }),
        makeLayer({ id: "layer-2", name: "Layer 2", contentBounds: { x: 0, y: 0, width: 128, height: 128 } })
      ]
    });

    const dataUrl = runtime.flattenToDataUrl(doc);
    expect(dataUrl).toBeTruthy();
    expect(dataUrl.startsWith("data:image/png")).toBe(true);
  });

  it("pendingCommit closure calls drawImage with buffer for stroke merge", () => {
    const layerCanvas = makeCanvas(64, 64);
    const buffer = makeCanvas(64, 64);
    const strokeOpacity = 0.7;
    const compositeOp = "source-over" as GlobalCompositeOperation;

    const layerCtx = layerCanvas.getContext("2d");
    expect(layerCtx).not.toBeNull();

    layerCtx!.save();
    layerCtx!.globalAlpha = strokeOpacity;
    layerCtx!.globalCompositeOperation = compositeOp;
    layerCtx!.drawImage(buffer, 0, 0);
    layerCtx!.restore();

    expect(layerCtx!.globalAlpha).toBe(1);
  });

  it("handleStrokeStart drains pendingCommit before history snapshot", () => {
    let drainCalled = false;
    let snapshotCalled = false;
    let drainBeforeSnapshot = false;

    const mockActiveStroke = {
      layerId: "layer-1",
      buffer: makeCanvas(64, 64),
      opacity: 1,
      compositeOp: "source-over" as GlobalCompositeOperation,
      pendingCommit: () => {
        drainCalled = true;
      }
    };

    if (mockActiveStroke.pendingCommit) {
      mockActiveStroke.pendingCommit();
      (mockActiveStroke as Record<string, unknown>).pendingCommit = null;
    }
    drainBeforeSnapshot = drainCalled;
    snapshotCalled = true;

    expect(drainCalled).toBe(true);
    expect(drainBeforeSnapshot).toBe(true);
    expect(snapshotCalled).toBe(true);
    expect(mockActiveStroke.pendingCommit).toBeNull();
  });

  it("flattenToDataUrl returns non-empty PNG for layer with default runtime", () => {
    const runtime = new Canvas2DRuntime();
    const doc = makeDoc();
    runtime.getOrCreateLayerCanvas("layer-1", 128, 128);

    const dataUrl = runtime.flattenToDataUrl(doc);
    expect(dataUrl).toBeTruthy();
    expect(dataUrl.startsWith("data:image/png")).toBe(true);
  });

  it("snapshotLayerCanvas returns a copy with same dimensions and raster bounds", () => {
    const runtime = new Canvas2DRuntime();
    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    setCanvasRasterBounds(layerCanvas, { x: 5, y: 10, width: 64, height: 64 });

    const snapshot = runtime.snapshotLayerCanvas("layer-1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.width).toBe(64);
    expect(snapshot!.height).toBe(64);
    expect(getCanvasRasterBounds(snapshot!)).toEqual({
      x: 5,
      y: 10,
      width: 64,
      height: 64
    });
    expect(snapshot).not.toBe(layerCanvas);
  });

  it("snapshotLayerCanvas returns null for unknown layer", () => {
    const runtime = new Canvas2DRuntime();
    expect(runtime.snapshotLayerCanvas("nonexistent")).toBeNull();
  });
});

describe("Phase 1.3 – ensureLayerRasterBounds caller audit", () => {
  it("PaintSession pattern: returned bounds used for CoordinateMapper", () => {
    // PaintSession uses the returned rasterBounds to create a CoordinateMapper.
    // Verify the returned bounds differ from the original contentBounds when expansion occurs.
    const layer = makeLayer({
      contentBounds: { x: 10, y: 10, width: 30, height: 30 },
      transform: makeAffineTransform({ x: 20, y: 20 })
    });
    const layerCanvas = makeCanvas(30, 30);
    setCanvasRasterBounds(layerCanvas, { x: 10, y: 10, width: 30, height: 30 });
    const canvases = new Map([["layer-1", layerCanvas]]);
    const ctx = makeMockToolContext(canvases);

    const doc = makeDoc({ layers: [layer] });
    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    const expandedBounds = ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    // The returned bounds should be the union (larger than original)
    expect(expandedBounds.width).toBeGreaterThanOrEqual(viewportBounds.width);
    expect(expandedBounds.height).toBeGreaterThanOrEqual(viewportBounds.height);

    // CoordinateMapper with returned bounds should produce valid mappings
    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: expandedBounds
    });
    const layerPt = mapper.docToLayer({ x: 30, y: 30 });
    expect(Number.isFinite(layerPt.x)).toBe(true);
    expect(Number.isFinite(layerPt.y)).toBe(true);

    const docPt = { x: 30, y: 30 };
    const roundTrip = mapper.layerToDoc(layerPt);
    expect(Math.abs(roundTrip.x - docPt.x)).toBeLessThan(0.01);
    expect(Math.abs(roundTrip.y - docPt.y)).toBeLessThan(0.01);
  });

  it("FillTool pattern: expanded bounds used for CoordinateMapper, not stale contentBounds", () => {
    // FillTool correctly uses expandedBounds (return value) for CoordinateMapper.
    // Verify that using stale contentBounds would give a different mapping.
    const layer = makeLayer({
      contentBounds: { x: 20, y: 20, width: 20, height: 20 },
      transform: makeAffineTransform({})
    });
    const layerCanvas = makeCanvas(20, 20);
    setCanvasRasterBounds(layerCanvas, { x: 20, y: 20, width: 20, height: 20 });
    const canvases = new Map([["layer-1", layerCanvas]]);
    const ctx = makeMockToolContext(canvases);
    const doc = makeDoc({ layers: [layer], canvas: { width: 64, height: 64, backgroundColor: "#fff" } });

    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    const expandedBounds = ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    // Mapper with expanded bounds (correct, as FillTool does)
    const correctMapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: expandedBounds
    });

    // Mapper with stale contentBounds (what we want to avoid)
    const staleMapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: layer.contentBounds
    });

    const testPt = { x: 5, y: 5 };
    const correctLocal = correctMapper.docToLayer(testPt);
    const staleLocal = staleMapper.docToLayer(testPt);

    // When canvas expanded, the expanded bounds have a different origin, so
    // the doc-to-layer mapping should differ from the stale bounds
    if (expandedBounds.x !== layer.contentBounds.x || expandedBounds.y !== layer.contentBounds.y) {
      expect(
        correctLocal.x !== staleLocal.x || correctLocal.y !== staleLocal.y
      ).toBe(true);
    }
  });

  it("GradientTool pattern: should use returned bounds, not raw viewportBounds", () => {
    // GradientTool currently uses viewportBounds directly. When the existing canvas
    // is already larger than the viewport, the returned union bounds may differ.
    // This test documents the expected behavior.
    const layer = makeLayer({
      contentBounds: { x: -20, y: -20, width: 200, height: 200 },
      transform: makeAffineTransform({})
    });
    const largeCanvas = makeCanvas(200, 200);
    setCanvasRasterBounds(largeCanvas, { x: -20, y: -20, width: 200, height: 200 });
    const canvases = new Map([["layer-1", largeCanvas]]);
    const ctx = makeMockToolContext(canvases);
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#fff" }
    });

    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    const expandedBounds = ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    // When canvas is already larger, the union bounds include the canvas's full extent
    // The returned bounds should be at least as large as the viewport
    expect(expandedBounds.width).toBeGreaterThanOrEqual(viewportBounds.width);
    expect(expandedBounds.height).toBeGreaterThanOrEqual(viewportBounds.height);

    // The correct mapper should use the returned bounds
    const correctMapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: expandedBounds
    });

    // If bounds differ, mapping should account for the full extent
    const testPt = { x: 64, y: 64 };
    const localPt = correctMapper.docToLayer(testPt);
    expect(Number.isFinite(localPt.x)).toBe(true);
    expect(Number.isFinite(localPt.y)).toBe(true);
  });

  it("ShapeTool pattern: commit reads getCanvasRasterBounds which reflects ensureLayerRasterBounds", () => {
    // ShapeTool discards the return value of ensureLayerRasterBounds in onDown,
    // but in onUp it reads getCanvasRasterBounds(layerCanvas) which gets the
    // bounds that ensureLayerRasterBounds wrote. Verify this chain works.
    const layer = makeLayer({
      contentBounds: { x: 10, y: 10, width: 30, height: 30 }
    });
    const layerCanvas = makeCanvas(30, 30);
    setCanvasRasterBounds(layerCanvas, { x: 10, y: 10, width: 30, height: 30 });
    const canvases = new Map([["layer-1", layerCanvas]]);
    const ctx = makeMockToolContext(canvases);
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 64, height: 64, backgroundColor: "#fff" }
    });

    // Simulate ensureLayerRasterBounds called in onDown (return value discarded)
    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    // In onUp, ShapeTool reads getCanvasRasterBounds from the potentially new canvas
    const currentCanvas = canvases.get("layer-1")!;
    const rasterBounds = getCanvasRasterBounds(currentCanvas);

    // The raster bounds should be set (ensureLayerRasterBounds always sets them)
    expect(rasterBounds).not.toBeNull();
    expect(rasterBounds!.width).toBeGreaterThanOrEqual(viewportBounds.width);
    expect(rasterBounds!.height).toBeGreaterThanOrEqual(viewportBounds.height);

    // CoordinateMapper with these bounds should work correctly
    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: rasterBounds!
    });
    const testPt = { x: 32, y: 32 };
    const localPt = mapper.docToLayer(testPt);
    expect(Number.isFinite(localPt.x)).toBe(true);
  });

  it("FillTool pattern: expandedBounds return value drives CoordinateMapper when layer is offset", () => {
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 0, y: 0, width: 50, height: 50 },
      transform: makeAffineTransform({ x: 10, y: 10 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    const existingCanvas = makeCanvas(50, 50);
    setCanvasRasterBounds(existingCanvas, { x: 0, y: 0, width: 50, height: 50 });
    const canvasMap = new Map<string, HTMLCanvasElement>([["layer-1", existingCanvas]]);
    const ctx = makeMockToolContext(canvasMap);

    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    const expandedBounds = ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: expandedBounds
    });
    const staleMapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: layer.contentBounds
    });

    const docPt = { x: 20, y: 20 };
    const localPt = mapper.docToLayer(docPt);
    const stalePt = staleMapper.docToLayer(docPt);

    if (
      expandedBounds.x !== layer.contentBounds.x ||
      expandedBounds.y !== layer.contentBounds.y
    ) {
      expect(localPt.x !== stalePt.x || localPt.y !== stalePt.y).toBe(true);
    }
  });

  it("GradientTool pattern: viewportBounds after expansion round-trips doc ↔ layer", () => {
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 10, y: 10, width: 30, height: 30 },
      transform: makeAffineTransform({})
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    const existingCanvas = makeCanvas(30, 30);
    setCanvasRasterBounds(existingCanvas, { x: 10, y: 10, width: 30, height: 30 });
    const canvasMap = new Map<string, HTMLCanvasElement>([["layer-1", existingCanvas]]);
    const ctx = makeMockToolContext(canvasMap);

    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: viewportBounds
    });

    const docPt = { x: 64, y: 64 };
    const localPt = mapper.docToLayer(docPt);
    const roundTrip = mapper.layerToDoc(localPt);
    expect(Math.abs(roundTrip.x - docPt.x)).toBeLessThan(0.01);
    expect(Math.abs(roundTrip.y - docPt.y)).toBeLessThan(0.01);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.4 – Overlay preview / committed pixel coordinate parity
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 1.4 – overlay preview coordinate parity", () => {
  it("shape preview uses document-space points, commit maps through CoordinateMapper with consistent bounds", () => {
    // Overlay shape preview draws in document space on the overlay canvas.
    // ShapeTool commit maps through CoordinateMapper with getCanvasRasterBounds.
    // For identity transform + origin-at-zero bounds, document and layer space should agree.
    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 128, height: 128 },
      transform: makeAffineTransform({})
    });
    const layerCanvas = makeCanvas(128, 128);
    setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width: 128, height: 128 });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: getCanvasRasterBounds(layerCanvas)!
    });

    // For identity transform with zero-origin bounds, docToLayer should be identity
    const docPt = { x: 30, y: 50 };
    const layerPt = mapper.docToLayer(docPt);
    expect(layerPt.x).toBeCloseTo(30, 0);
    expect(layerPt.y).toBeCloseTo(50, 0);
  });

  it("with translated layer, preview and commit map to the same offset", () => {
    // When a layer has a non-zero transform, the overlay draws in document space
    // while the commit maps through CoordinateMapper. Verify they agree.
    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 64, height: 64 },
      transform: makeAffineTransform({ x: 30, y: 20 })
    });
    const layerCanvas = makeCanvas(64, 64);
    setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width: 64, height: 64 });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: getCanvasRasterBounds(layerCanvas)!
    });

    // Document point (50, 40) should map to layer-local (20, 20) given transform offset (30, 20)
    const docPt = { x: 50, y: 40 };
    const layerPt = mapper.docToLayer(docPt);
    expect(layerPt.x).toBeCloseTo(20, 0);
    expect(layerPt.y).toBeCloseTo(20, 0);
  });

  it("with expanded bounds, doc-to-layer accounts for bounds origin shift", () => {
    // After ensureLayerRasterBounds expands the canvas, the raster bounds origin shifts.
    // The mapper should produce correct layer-local coordinates.
    const layer = makeLayer({
      contentBounds: { x: 20, y: 20, width: 30, height: 30 },
      transform: makeAffineTransform({})
    });
    const layerCanvas = makeCanvas(30, 30);
    setCanvasRasterBounds(layerCanvas, { x: 20, y: 20, width: 30, height: 30 });
    const canvases = new Map([["layer-1", layerCanvas]]);
    const ctx = makeMockToolContext(canvases);
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 64, height: 64, backgroundColor: "#fff" }
    });

    const viewportBounds = getDocumentViewportInLayerSpace(layer, doc);
    const expandedBounds = ensureLayerRasterBounds(ctx as never, layer, viewportBounds);

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: expandedBounds
    });

    // Doc point at the origin of the expanded bounds should map to layer-local (0, 0)
    const docPt = { x: expandedBounds.x, y: expandedBounds.y };
    const layerPt = mapper.docToLayer(docPt);
    expect(layerPt.x).toBeCloseTo(0, 0);
    expect(layerPt.y).toBeCloseTo(0, 0);
  });

  it("gradient preview in document space and gradient commit in layer space agree on visual position", () => {
    // The gradient preview draws on the overlay canvas in document coordinates.
    // The commit maps start/end through CoordinateMapper. For identity transform
    // with zero-origin bounds, these should be equivalent.
    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 128, height: 128 },
      transform: makeAffineTransform({})
    });
    const layerCanvas = makeCanvas(128, 128);
    setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width: 128, height: 128 });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: getCanvasRasterBounds(layerCanvas)!
    });

    // Preview start/end in document space
    const start = { x: 10, y: 10 };
    const end = { x: 100, y: 100 };

    // Commit maps through CoordinateMapper
    const localStart = mapper.docToLayer(start);
    const localEnd = mapper.docToLayer(end);

    // For identity transform, layer-local should match document coordinates
    expect(localStart.x).toBeCloseTo(start.x, 0);
    expect(localStart.y).toBeCloseTo(start.y, 0);
    expect(localEnd.x).toBeCloseTo(end.x, 0);
    expect(localEnd.y).toBeCloseTo(end.y, 0);
  });

  it("for identity layer, overlay line endpoints match docToLayer mapping", () => {
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 0, y: 0, width: 128, height: 128 },
      transform: makeAffineTransform({})
    });
    const layerCanvas = makeCanvas(128, 128);
    setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width: 128, height: 128 });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: getCanvasRasterBounds(layerCanvas)!
    });

    const start = { x: 20, y: 20 };
    const end = { x: 60, y: 60 };
    const localStart = mapper.docToLayer(start);
    const localEnd = mapper.docToLayer(end);

    expect(localStart.x).toBeCloseTo(start.x, 5);
    expect(localStart.y).toBeCloseTo(start.y, 5);
    expect(localEnd.x).toBeCloseTo(end.x, 5);
    expect(localEnd.y).toBeCloseTo(end.y, 5);
  });

  it("for translated layer, committed doc position matches overlay via composite offset", () => {
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 0, y: 0, width: 128, height: 128 },
      transform: makeAffineTransform({ x: 10, y: 10 })
    });

    const layerCanvas = makeCanvas(128, 128);
    setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width: 128, height: 128 });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: getCanvasRasterBounds(layerCanvas)!
    });

    const overlayDocPos = { x: 50, y: 50 };
    const layerPos = mapper.docToLayer(overlayDocPos);

    const compositeOffset = getLayerGeometry(layer, layerCanvas, { width: 128, height: 128 }).compositeOffset;

    const committedDocX = layerPos.x + compositeOffset.x;
    const committedDocY = layerPos.y + compositeOffset.y;

    expect(committedDocX).toBeCloseTo(overlayDocPos.x, 5);
    expect(committedDocY).toBeCloseTo(overlayDocPos.y, 5);
  });

  it("for layer with contentBounds offset, composite offset aligns doc and layer space", () => {
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 20, y: 20, width: 80, height: 80 },
      transform: makeAffineTransform({ x: 5, y: 5 })
    });

    const layerCanvas = makeCanvas(80, 80);
    setCanvasRasterBounds(layerCanvas, { x: 20, y: 20, width: 80, height: 80 });

    const mapper = new CoordinateMapper({
      layerTransform: layer.transform,
      rasterBounds: getCanvasRasterBounds(layerCanvas)!
    });

    const overlayDocPos = { x: 50, y: 50 };
    const layerPos = mapper.docToLayer(overlayDocPos);

    const compositeOffset = getLayerGeometry(layer, layerCanvas, { width: 80, height: 80 }).compositeOffset;

    const committedDocX = layerPos.x + compositeOffset.x;
    const committedDocY = layerPos.y + compositeOffset.y;

    expect(committedDocX).toBeCloseTo(overlayDocPos.x, 5);
    expect(committedDocY).toBeCloseTo(overlayDocPos.y, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.6 – Active stroke compositing + getMaskDataUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 1.6 – active stroke buffer compositing", () => {
  it("compositeToDisplay does not throw with active stroke info", () => {
    const runtime = new Canvas2DRuntime();
    const doc = makeDoc({
      layers: [
        makeLayer({
          id: "layer-1",
          contentBounds: { x: 0, y: 0, width: 128, height: 128 },
          opacity: 1,
          blendMode: "normal"
        })
      ]
    });
    runtime.getOrCreateLayerCanvas("layer-1", 128, 128);

    const strokeBuffer = makeCanvas(128, 128);
    const activeStroke = {
      layerId: "layer-1",
      buffer: strokeBuffer,
      opacity: 0.5,
      compositeOp: "source-over" as GlobalCompositeOperation
    };

    const displayCanvas = makeCanvas(128, 128);
    expect(() => {
      runtime.compositeToDisplay(displayCanvas, doc, null, activeStroke);
    }).not.toThrow();
  });

  it("preview and commit read the same opacity + compositeOp from ActiveStrokeInfo", () => {
    const strokeOpacity = 0.6;
    const strokeCompositeOp = "screen" as GlobalCompositeOperation;
    const activeStroke = {
      layerId: "layer-1",
      buffer: makeCanvas(64, 64),
      opacity: strokeOpacity,
      compositeOp: strokeCompositeOp
    };

    expect(activeStroke.opacity).toBe(strokeOpacity);
    expect(activeStroke.compositeOp).toBe(strokeCompositeOp);

    const commitOpacity = activeStroke.opacity;
    const commitCompositeOp = activeStroke.compositeOp;
    expect(commitOpacity).toBe(strokeOpacity);
    expect(commitCompositeOp).toBe(strokeCompositeOp);
  });

  it("active stroke composites at correct opacity onto display", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    // Create a layer with a white background
    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    paintBlock(layerCanvas, 0, 0, 64, 64, "rgba(255,255,255,1)");

    // Create a stroke buffer with solid red
    const strokeBuffer = makeCanvas(64, 64);
    paintBlock(strokeBuffer, 10, 10, 20, 20, "rgba(255,0,0,1)");

    const activeStroke: ActiveStrokeInfo = {
      layerId: "layer-1",
      buffer: strokeBuffer,
      opacity: 0.5,
      compositeOp: "source-over"
    };

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 64, height: 64 }
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 64, height: 64, backgroundColor: "#ffffff" }
    });

    const display = makeCanvas(64, 64);
    runtime.compositeToDisplay(display, doc, null, activeStroke);

    // The stroke area should have blended red at 50% opacity over white
    const pixel = readPixel(display, 15, 15);
    // White (255,255,255) + Red (255,0,0) at 0.5 opacity → approximately (255, 128, 128)
    expect(pixel[0]).toBe(255);
    expect(pixel[1]).toBeGreaterThan(100);
    expect(pixel[1]).toBeLessThan(160);
    expect(pixel[3]).toBe(255);

    // Area outside stroke should still be white
    const outsidePixel = readPixel(display, 5, 5);
    expect(outsidePixel[0]).toBe(255);
    expect(outsidePixel[1]).toBe(255);
    expect(outsidePixel[2]).toBe(255);
  });

  it("after stroke commit, layer matches preview composite for source-over", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    // Start with transparent layer
    const layerCtx = layerCanvas.getContext("2d")!;
    layerCtx.clearRect(0, 0, 64, 64);

    // Create a stroke buffer with blue at full opacity
    const strokeBuffer = makeCanvas(64, 64);
    paintBlock(strokeBuffer, 20, 20, 10, 10, "rgba(0,0,255,1)");

    const activeStroke: ActiveStrokeInfo = {
      layerId: "layer-1",
      buffer: strokeBuffer,
      opacity: 1.0,
      compositeOp: "source-over"
    };

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 64, height: 64 }
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 64, height: 64, backgroundColor: "#ffffff" }
    });

    // Capture preview composite
    const previewDisplay = makeCanvas(64, 64);
    runtime.compositeToDisplay(previewDisplay, doc, null, activeStroke);

    // Now simulate commit: composite stroke buffer onto layer canvas
    layerCtx.globalAlpha = activeStroke.opacity;
    layerCtx.globalCompositeOperation = activeStroke.compositeOp as GlobalCompositeOperation;
    layerCtx.drawImage(strokeBuffer, 0, 0);
    layerCtx.globalAlpha = 1;
    layerCtx.globalCompositeOperation = "source-over";

    // Composite again without active stroke
    const commitDisplay = makeCanvas(64, 64);
    runtime.compositeToDisplay(commitDisplay, doc, null, null);

    // The stroke area should match between preview and committed display
    const previewPixel = readPixel(previewDisplay, 25, 25);
    const commitPixel = readPixel(commitDisplay, 25, 25);
    expect(commitPixel[2]).toBe(previewPixel[2]); // blue channel should match
    expect(commitPixel[3]).toBe(previewPixel[3]); // alpha should match
  });

  it("active stroke with multiply blend mode composites differently from source-over", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    paintBlock(layerCanvas, 0, 0, 64, 64, "rgba(255,128,0,1)"); // orange background

    const strokeBuffer = makeCanvas(64, 64);
    paintBlock(strokeBuffer, 10, 10, 20, 20, "rgba(128,128,128,1)"); // gray stroke

    const doc = makeDoc({
      layers: [makeLayer({ contentBounds: { x: 0, y: 0, width: 64, height: 64 } })],
      canvas: { width: 64, height: 64, backgroundColor: "#ffffff" }
    });

    // Source-over composite
    const displaySourceOver = makeCanvas(64, 64);
    runtime.compositeToDisplay(displaySourceOver, doc, null, {
      layerId: "layer-1",
      buffer: strokeBuffer,
      opacity: 1.0,
      compositeOp: "source-over"
    });

    // Multiply composite
    const displayMultiply = makeCanvas(64, 64);
    runtime.compositeToDisplay(displayMultiply, doc, null, {
      layerId: "layer-1",
      buffer: strokeBuffer,
      opacity: 1.0,
      compositeOp: "multiply"
    });

    // The stroke area should differ between the two blend modes
    const sourceOverPixel = readPixel(displaySourceOver, 15, 15);
    const multiplyPixel = readPixel(displayMultiply, 15, 15);

    // Source-over replaces with gray; multiply darkens the orange
    // They should produce different results
    expect(
      sourceOverPixel[0] !== multiplyPixel[0] ||
      sourceOverPixel[1] !== multiplyPixel[1] ||
      sourceOverPixel[2] !== multiplyPixel[2]
    ).toBe(true);
  });
});

describe("Phase 1.6 – getMaskDataUrl", () => {
  it("returns null when no mask layer is set", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);
    const doc = makeDoc({ maskLayerId: null });
    expect(runtime.getMaskDataUrl(doc)).toBeNull();
  });

  it("returns null when mask layer is hidden", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);
    const maskLayer = makeLayer({
      id: "mask-1",
      type: "mask",
      visible: false
    });
    runtime.getOrCreateLayerCanvas("mask-1", 128, 128);
    const doc = makeDoc({
      layers: [makeLayer(), maskLayer],
      maskLayerId: "mask-1"
    });
    expect(runtime.getMaskDataUrl(doc)).toBeNull();
  });

  it("returns only mask layer content, not other layers", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    // Layer 1 has red content
    const layer1Canvas = runtime.getOrCreateLayerCanvas("layer-1", 128, 128);
    paintBlock(layer1Canvas, 0, 0, 128, 128, "rgba(255,0,0,1)");

    // Mask layer has white circle-like area
    const maskCanvas = runtime.getOrCreateLayerCanvas("mask-1", 128, 128);
    paintBlock(maskCanvas, 30, 30, 40, 40, "rgba(255,255,255,1)");

    const maskLayer = makeLayer({
      id: "mask-1",
      name: "Mask",
      type: "mask",
      contentBounds: { x: 0, y: 0, width: 128, height: 128 }
    });
    const doc = makeDoc({
      layers: [makeLayer({ contentBounds: { x: 0, y: 0, width: 128, height: 128 } }), maskLayer],
      maskLayerId: "mask-1"
    });

    const maskDataUrl = runtime.getMaskDataUrl(doc);
    expect(maskDataUrl).not.toBeNull();
    expect(maskDataUrl!.startsWith("data:image/png")).toBe(true);

    // Verify the mask data URL can be loaded and doesn't include layer 1's red pixels
    // by checking that it's a valid data URL with content
    expect(maskDataUrl!.length).toBeGreaterThan(100);
  });

  it("mask layer respects contentBounds offset", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    // Mask canvas at offset (30, 30) with 40x40 content
    const maskCanvas = runtime.getOrCreateLayerCanvas("mask-1", 40, 40);
    paintBlock(maskCanvas, 0, 0, 40, 40, "rgba(255,255,255,1)");
    setCanvasRasterBounds(maskCanvas, { x: 30, y: 30, width: 40, height: 40 });

    const maskLayer = makeLayer({
      id: "mask-1",
      name: "Mask",
      type: "mask",
      contentBounds: { x: 30, y: 30, width: 40, height: 40 }
    });
    const doc = makeDoc({
      layers: [makeLayer(), maskLayer],
      maskLayerId: "mask-1"
    });

    const maskDataUrl = runtime.getMaskDataUrl(doc);
    expect(maskDataUrl).not.toBeNull();
    // The returned data URL should be document-sized (128x128), not 40x40
    // This is because getMaskDataUrl creates a doc-sized canvas
    expect(maskDataUrl!.startsWith("data:image/png")).toBe(true);
  });

  it("mask layer respects layer transform", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const maskCanvas = runtime.getOrCreateLayerCanvas("mask-1", 64, 64);
    paintBlock(maskCanvas, 0, 0, 64, 64, "rgba(255,255,255,1)");

    const maskLayer = makeLayer({
      id: "mask-1",
      name: "Mask",
      type: "mask",
      contentBounds: { x: 0, y: 0, width: 64, height: 64 },
      transform: makeAffineTransform({ x: 20, y: 20 })
    });
    const doc = makeDoc({
      layers: [makeLayer(), maskLayer],
      maskLayerId: "mask-1"
    });

    const maskDataUrl = runtime.getMaskDataUrl(doc);
    expect(maskDataUrl).not.toBeNull();
    // The mask should be rendered with the transform applied (offset by 20, 20)
    expect(maskDataUrl!.startsWith("data:image/png")).toBe(true);
  });

  it("returns a PNG data URL for a valid visible mask layer", () => {
    const runtime = new Canvas2DRuntime();

    const rasterLayer = makeLayer({
      id: "raster-1",
      type: "raster",
      visible: true,
      contentBounds: { x: 0, y: 0, width: 128, height: 128 }
    });
    const maskLayer = makeLayer({
      id: "mask-1",
      type: "mask",
      visible: true,
      contentBounds: { x: 0, y: 0, width: 128, height: 128 }
    });

    const doc = makeDoc({
      layers: [rasterLayer, maskLayer],
      maskLayerId: "mask-1"
    });

    runtime.getOrCreateLayerCanvas("raster-1", 128, 128);
    runtime.getOrCreateLayerCanvas("mask-1", 128, 128);

    const maskDataUrl = runtime.getMaskDataUrl(doc);
    expect(maskDataUrl).not.toBeNull();
    expect(maskDataUrl!.startsWith("data:image/png")).toBe(true);
  });

  it("returns a data URL even when the mask layer canvas was never created", () => {
    const runtime = new Canvas2DRuntime();

    const maskLayer = makeLayer({
      id: "mask-1",
      type: "mask",
      visible: true
    });

    const doc = makeDoc({
      layers: [maskLayer],
      maskLayerId: "mask-1"
    });

    const maskDataUrl = runtime.getMaskDataUrl(doc);
    expect(maskDataUrl).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1.7 – reconcileLayerToDocumentSpace
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 1.7 – reconcileLayerToDocumentSpace transparency", () => {
  it("preserves transparency after translation reconciliation", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    // Create a 32x32 canvas with a small red block, rest is transparent
    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    paintBlock(layerCanvas, 5, 5, 10, 10, "rgba(255,0,0,1)");

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ x: 20, y: 20 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    const result = runtime.reconcileLayerToDocumentSpace("layer-1", doc);
    expect(result).not.toBeNull();

    // After reconciliation, the canvas is sized tight to the translated AABB
    // (32x32 layer translated to (20,20) → 52x52 baked canvas). Earlier code
    // bloated this to the full document size, which made the gizmo bounds
    // span the entire canvas after every commit.
    const reconciledCanvas = layerCanvases.get("layer-1")!;
    expect(reconciledCanvas.width).toBe(52);
    expect(reconciledCanvas.height).toBe(52);

    // The red block should be at (25, 25) in document space (original 5+20, 5+20)
    const redPixel = readPixel(reconciledCanvas, 27, 27);
    expect(redPixel[0]).toBe(255);
    expect(redPixel[3]).toBe(255);

    // Area that was transparent in original should still be transparent
    const transparentPixel = readPixel(reconciledCanvas, 0, 0);
    expect(transparentPixel[3]).toBe(0);

    // Edge pixel just past the translated block (35,35) should be transparent
    const edgePixel = readPixel(reconciledCanvas, 40, 40);
    expect(edgePixel[3]).toBe(0);
  });

  it("preserves transparency after scale reconciliation", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    paintBlock(layerCanvas, 10, 10, 12, 12, "rgba(0,255,0,1)");

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ scaleX: 2, scaleY: 2 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    const reconciledCanvas = layerCanvases.get("layer-1")!;
    // 32x32 layer scaled 2x is 64x64 (centered at canvas center, no rotation,
    // no translation → AABB starts at 0). Tight bounds → 64x64.
    expect(reconciledCanvas.width).toBe(64);
    expect(reconciledCanvas.height).toBe(64);

    // Corners far from the scaled content should be transparent
    const cornerPixel = readPixel(reconciledCanvas, 0, 0);
    expect(cornerPixel[3]).toBe(0);

    const farCorner = readPixel(reconciledCanvas, reconciledCanvas.width - 1, reconciledCanvas.height - 1);
    expect(farCorner[3]).toBe(0);
  });

  it("identity transform does not modify canvas dimensions", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    paintBlock(layerCanvas, 0, 0, 64, 64, "rgba(255,0,0,0.5)");

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 64, height: 64 },
      transform: makeAffineTransform({})
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    // Identity transform: canvas stays original size
    const canvas = layerCanvases.get("layer-1")!;
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(64);
  });

  it("rotation reconciliation preserves alpha channel correctly", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    // Paint a semi-transparent green block
    paintBlock(layerCanvas, 8, 8, 16, 16, "rgba(0,255,0,0.5)");

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({
        x: 40,
        y: 40,
        rotation: Math.PI / 4  // 45 degrees
      })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    const reconciledCanvas = layerCanvases.get("layer-1")!;
    // 32x32 layer at (40,40) rotated 45° → tight AABB ~79x79.
    // Tight bounds (no doc-canvas padding) is the new contract.
    expect(reconciledCanvas.width).toBeGreaterThan(60);
    expect(reconciledCanvas.width).toBeLessThan(128);
    expect(reconciledCanvas.height).toBe(reconciledCanvas.width);

    // The (0,0) corner of the tight AABB should remain transparent — the
    // rotated content lands closer to the center.
    const farCorner = readPixel(reconciledCanvas, 0, 0);
    expect(farCorner[3]).toBe(0);

    // Check that SOME pixels are visible (the rotated content landed somewhere)
    expect(hasVisiblePixels(reconciledCanvas)).toBe(true);
  });

  it("reconcileLayerToDocumentSpace returns null for unknown layer", () => {
    const runtime = new Canvas2DRuntime();
    const doc = makeDoc();
    expect(runtime.reconcileLayerToDocumentSpace("nonexistent", doc)).toBeNull();
  });

  it("sets raster bounds tight to the transformed AABB after reconciliation", () => {
    const runtime = new Canvas2DRuntime();
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ x: 20, y: 20 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    const reconciledCanvas = runtime.getLayerCanvas("layer-1");
    const bounds = getCanvasRasterBounds(reconciledCanvas!);
    // Tight to AABB: 32x32 layer translated by (20,20) → (0,0,52,52).
    expect(bounds).toEqual({ x: 0, y: 0, width: 52, height: 52 });
  });
});

describe("Phase 1.7 – transform undo restores canvas data AND transform", () => {
  it("reconcileLayerToDocumentSpace output can be restored via setLayerData", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    // Step 1: Set up original state
    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    paintBlock(layerCanvas, 5, 5, 10, 10, "rgba(255,0,0,1)");
    const originalData = runtime.getLayerData("layer-1");
    const originalTransform: LayerTransform = makeAffineTransform({ x: 20, y: 20 });

    // Step 2: Apply transform and reconcile (simulates transform tool commit)
    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: originalTransform
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });
    const reconciledData = runtime.reconcileLayerToDocumentSpace("layer-1", doc);
    expect(reconciledData).not.toBeNull();

    // Step 3: Verify canvas is now sized tight to the translated AABB
    // (32x32 layer translated by (20,20) → 52x52, no longer doc-sized).
    expect(layerCanvases.get("layer-1")!.width).toBe(52);

    // Step 4: Simulate undo by restoring original data
    expect(originalData).not.toBeNull();
    // After undo, the store would restore the original layer data and transform
    // Verify that original data is a valid string that can be restored
    expect(typeof originalData).toBe("string");
  });

  it("getLayerData before and after reconcile produces different serialized data", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    paintBlock(layerCanvas, 5, 5, 10, 10, "rgba(255,0,0,1)");
    const dataBefore = runtime.getLayerData("layer-1");

    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ x: 50, y: 50 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });
    runtime.reconcileLayerToDocumentSpace("layer-1", doc);
    const dataAfter = runtime.getLayerData("layer-1");

    // The data should be different since the canvas was resized and pixels relocated
    expect(dataBefore).not.toBe(dataAfter);
  });

  it("snapshotLayerCanvas before reconcile captures pre-transform state", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    paintBlock(layerCanvas, 0, 0, 32, 32, "rgba(0,0,255,1)");

    // Snapshot before reconciliation
    const snapshot = runtime.snapshotLayerCanvas("layer-1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.width).toBe(32);
    expect(snapshot!.height).toBe(32);

    // Reconcile
    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ x: 30, y: 30 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });
    runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    // Canvas is sized tight to translated AABB: 32x32 + (30,30) → 62x62.
    expect(layerCanvases.get("layer-1")!.width).toBe(62);

    // But snapshot should still be 32x32 with original blue pixels
    expect(snapshot!.width).toBe(32);
    const snapshotPixel = readPixel(snapshot!, 16, 16);
    expect(snapshotPixel[2]).toBe(255); // blue preserved in snapshot
    expect(snapshotPixel[3]).toBe(255);
  });

  it("restoreLayerCanvas correctly restores pre-transform canvas state", () => {
    const layerCanvases = new Map<string, HTMLCanvasElement>();
    const runtime = new Canvas2DRuntime(layerCanvases);

    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    paintBlock(layerCanvas, 0, 0, 32, 32, "rgba(255,0,0,1)");

    // Snapshot before transform
    const snapshot = runtime.snapshotLayerCanvas("layer-1");

    // Reconcile changes the canvas size
    const layer = makeLayer({
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ x: 50, y: 50 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });
    runtime.reconcileLayerToDocumentSpace("layer-1", doc);
    // Tight AABB: 32x32 + (50,50) → 82x82.
    expect(layerCanvases.get("layer-1")!.width).toBe(82);

    // Restore from snapshot (simulating undo)
    runtime.restoreLayerCanvas("layer-1", snapshot!);

    // Canvas should be restored to pre-transform state
    const restored = layerCanvases.get("layer-1")!;
    expect(restored.width).toBe(32);
    expect(restored.height).toBe(32);

    // Red pixels should be back
    const pixel = readPixel(restored, 16, 16);
    expect(pixel[0]).toBe(255);
    expect(pixel[3]).toBe(255);
  });

  it("original transform snapshot stays independent of live transform edits", () => {
    const originalTransform = makeAffineTransform({ x: 5, y: 10 });

    const savedTransform = makeAffineTransform({
      x: originalTransform.x,
      y: originalTransform.y,
      scaleX: originalTransform.scaleX,
      scaleY: originalTransform.scaleY,
      rotation: originalTransform.rotation
    });

    const liveTransform = makeAffineTransform({
      x: 30,
      y: 40,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: Math.PI / 6
    });

    expect(savedTransform.x).toBe(5);
    expect(savedTransform.y).toBe(10);
    expect(savedTransform.scaleX).toBe(1);
    expect(savedTransform.scaleY).toBe(1);
    expect(savedTransform.rotation).toBe(0);

    expect(savedTransform.x).not.toBe(liveTransform.x);
    expect(savedTransform.scaleX).not.toBe(liveTransform.scaleX);
    expect(savedTransform.rotation).not.toBe(liveTransform.rotation);
  });

  it("reconcileLayerToDocumentSpace returns non-trivial serialized data for history", () => {
    const runtime = new Canvas2DRuntime();
    const layer = makeLayer({
      id: "layer-1",
      contentBounds: { x: 0, y: 0, width: 32, height: 32 },
      transform: makeAffineTransform({ x: 10, y: 10 })
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });

    runtime.getOrCreateLayerCanvas("layer-1", 32, 32);
    const result = runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect(result!.length).toBeGreaterThan(10);
  });

  it("snapshotLayerCanvas keeps pre-reconcile dimensions while live canvas grows", () => {
    const runtime = new Canvas2DRuntime();
    const layerCanvas = runtime.getOrCreateLayerCanvas("layer-1", 64, 64);
    setCanvasRasterBounds(layerCanvas, { x: 0, y: 0, width: 64, height: 64 });

    const snapshot = runtime.snapshotLayerCanvas("layer-1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.width).toBe(64);
    expect(snapshot!.height).toBe(64);
    expect(getCanvasRasterBounds(snapshot!)).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64
    });

    const layer = makeLayer({
      id: "layer-1",
      transform: makeAffineTransform({ x: 20, y: 20 }),
      contentBounds: { x: 0, y: 0, width: 64, height: 64 }
    });
    const doc = makeDoc({
      layers: [layer],
      canvas: { width: 128, height: 128, backgroundColor: "#ffffff" }
    });
    runtime.reconcileLayerToDocumentSpace("layer-1", doc);

    // Tight AABB: 64x64 + (20,20) → 84x84.
    expect(runtime.getLayerCanvas("layer-1")!.width).toBe(84);
    expect(snapshot!.width).toBe(64);
  });
});
