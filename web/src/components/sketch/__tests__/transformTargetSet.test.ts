/**
 * Tests for transformTargetSet and opaquePixelBounds modules.
 *
 * Covers:
 *   - TransformTargetSet: add/remove/toggle/clear/has, union bounds computation
 *   - pickTopmostTransformableLayer: visibility, lock, hit-test
 *   - computeOpaquePixelBounds: empty, full, partial canvas
 *   - resolveGizmoBounds: tight pixel bounds for canvas-sized layers
 */

import {
  TransformTargetSet,
  pickTopmostTransformableLayer,
  resolveTargetEntry
} from "../tools/transformTargetSet";
import {
  computeOpaquePixelBounds,
  computeLayerOpaquePixelBounds
} from "../painting/opaquePixelBounds";
import { resolveGizmoBounds } from "../painting/resolvedLayerGeometry";
import type { Layer, LayerContentBounds, LayerTransform } from "../types";
import { setCanvasRasterBounds } from "../painting/layerBounds";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeBounds(
  x = 0,
  y = 0,
  width = 100,
  height = 100
): LayerContentBounds {
  return { x, y, width, height };
}

function makeTransform(x = 0, y = 0): LayerTransform {
  return { x, y, scaleX: 1, scaleY: 1, rotation: 0 };
}

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Layer",
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: makeTransform(),
    contentBounds: makeBounds(),
    exposedAsInput: false,
    exposedAsOutput: false,
    effects: [],
    ...overrides
  };
}

/**
 * Create a test canvas with specific opaque pixel regions.
 * The canvas has `willReadFrequently` set for getImageData compatibility.
 */
function makeCanvasWithPixels(
  width: number,
  height: number,
  opaqueRegions: Array<{ x: number; y: number; w: number; h: number }>
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Start fully transparent
  ctx.clearRect(0, 0, width, height);
  // Paint opaque regions
  ctx.fillStyle = "rgba(255, 0, 0, 1)";
  for (const r of opaqueRegions) {
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  return canvas;
}

// ─── TransformTargetSet ──────────────────────────────────────────────────────

describe("TransformTargetSet", () => {
  let ts: TransformTargetSet;

  beforeEach(() => {
    ts = new TransformTargetSet();
  });

  it("starts empty", () => {
    expect(ts.size).toBe(0);
    expect(ts.getIds()).toEqual([]);
    expect(ts.has("any")).toBe(false);
  });

  it("setSingle replaces all entries with one", () => {
    ts.add("a", makeBounds(0, 0, 50, 50));
    ts.add("b", makeBounds(10, 10, 60, 60));
    ts.setSingle("c", makeBounds(20, 20, 70, 70));
    expect(ts.size).toBe(1);
    expect(ts.has("c")).toBe(true);
    expect(ts.has("a")).toBe(false);
  });

  it("add does not duplicate entries", () => {
    ts.add("a", makeBounds());
    ts.add("a", makeBounds());
    expect(ts.size).toBe(1);
  });

  it("remove removes the correct entry", () => {
    ts.add("a", makeBounds());
    ts.add("b", makeBounds());
    ts.remove("a");
    expect(ts.size).toBe(1);
    expect(ts.has("a")).toBe(false);
    expect(ts.has("b")).toBe(true);
  });

  it("toggle adds when absent, removes when present", () => {
    const bounds = makeBounds();
    ts.toggle("a", bounds);
    expect(ts.has("a")).toBe(true);
    ts.toggle("a", bounds);
    expect(ts.has("a")).toBe(false);
  });

  it("clear removes all entries", () => {
    ts.add("a", makeBounds());
    ts.add("b", makeBounds());
    ts.clear();
    expect(ts.size).toBe(0);
  });

  it("computeUnionRasterBounds returns null when empty", () => {
    expect(ts.computeUnionRasterBounds()).toBeNull();
  });

  it("computeUnionRasterBounds returns single entry bounds for one entry", () => {
    ts.setSingle("a", makeBounds(10, 20, 100, 200));
    const result = ts.computeUnionRasterBounds();
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it("computeUnionRasterBounds unions multiple entries", () => {
    ts.add("a", makeBounds(0, 0, 50, 50));
    ts.add("b", makeBounds(30, 30, 50, 50));
    const result = ts.computeUnionRasterBounds();
    // Union: (0,0) to (80,80) = width 80, height 80
    expect(result).toEqual({ x: 0, y: 0, width: 80, height: 80 });
  });

  it("computeUnionExtents returns null when empty", () => {
    expect(ts.computeUnionExtents(() => makeTransform())).toBeNull();
  });

  it("computeUnionExtents respects layer transforms", () => {
    ts.add("a", makeBounds(0, 0, 50, 50));
    ts.add("b", makeBounds(0, 0, 50, 50));
    const result = ts.computeUnionExtents((id) => {
      if (id === "a") { return makeTransform(0, 0); }
      return makeTransform(100, 100);
    });
    // Layer a: (0,0) to (50,50) + transform (0,0) = (0,0)→(50,50)
    // Layer b: (0,0) to (50,50) + transform (100,100) = (100,100)→(150,150)
    // Union: (0,0) to (150,150)
    expect(result).not.toBeNull();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(0);
    expect(result!.width).toBe(150);
    expect(result!.height).toBe(150);
  });
});

// ─── computeOpaquePixelBounds ────────────────────────────────────────────────

describe("computeOpaquePixelBounds", () => {
  it("returns null for a fully transparent canvas", () => {
    const canvas = makeCanvasWithPixels(100, 100, []);
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });

  it("returns full bounds for a fully opaque canvas", () => {
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const result = computeOpaquePixelBounds(canvas);
    expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("computes tight bounds for a small opaque region", () => {
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 100, y: 200, w: 50, h: 30 }
    ]);
    const result = computeOpaquePixelBounds(canvas);
    expect(result).toEqual({ x: 100, y: 200, width: 50, height: 30 });
  });

  it("computes tight bounds for multiple opaque regions", () => {
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 10, y: 20, w: 30, h: 30 },
      { x: 400, y: 450, w: 20, h: 20 }
    ]);
    const result = computeOpaquePixelBounds(canvas);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(10);
    expect(result!.y).toBe(20);
    // Right edge: 400 + 20 = 420, so width = 420 - 10 = 410
    expect(result!.width).toBe(410);
    // Bottom edge: 450 + 20 = 470, so height = 470 - 20 = 450
    expect(result!.height).toBe(450);
  });

  it("returns null for a zero-size canvas", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });
});

describe("computeLayerOpaquePixelBounds", () => {
  it("offsets bounds by raster origin", () => {
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 10, y: 20, w: 30, h: 40 }
    ]);
    const result = computeLayerOpaquePixelBounds(
      canvas,
      { x: 50, y: 60 }
    );
    expect(result).toEqual({ x: 60, y: 80, width: 30, height: 40 });
  });

  it("works without raster origin", () => {
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 10, y: 20, w: 30, h: 40 }
    ]);
    const result = computeLayerOpaquePixelBounds(canvas);
    expect(result).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });
});

// ─── resolveGizmoBounds with pixel bounds ────────────────────────────────────

describe("resolveGizmoBounds (pixel bounds integration)", () => {
  it("returns tight pixel bounds when canvas is canvas-sized with small content", () => {
    // Layer with contentBounds matching canvas size (512x512)
    const layer = makeLayer({
      contentBounds: makeBounds(0, 0, 512, 512)
    });
    // Canvas is 512x512 but only has a small painted area
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 50, y: 50, w: 100, h: 100 }
    ]);
    setCanvasRasterBounds(canvas, { x: 0, y: 0, width: 512, height: 512 });

    const result = resolveGizmoBounds(layer, canvas, { width: 512, height: 512 });
    // Should return tight pixel bounds, not full 512x512
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it("returns contentBounds when they are smaller than raster bounds", () => {
    const layer = makeLayer({
      contentBounds: makeBounds(10, 10, 50, 50)
    });
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 0, y: 0, w: 512, h: 512 }
    ]);
    setCanvasRasterBounds(canvas, { x: 0, y: 0, width: 512, height: 512 });

    const result = resolveGizmoBounds(layer, canvas, { width: 512, height: 512 });
    // contentBounds are smaller, so use them
    expect(result).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });

  it("returns raster bounds for a fully transparent canvas", () => {
    const layer = makeLayer({
      contentBounds: makeBounds(0, 0, 512, 512)
    });
    const canvas = makeCanvasWithPixels(512, 512, []);
    setCanvasRasterBounds(canvas, { x: 0, y: 0, width: 512, height: 512 });

    const result = resolveGizmoBounds(layer, canvas, { width: 512, height: 512 });
    // No opaque pixels → fall back to raster bounds
    expect(result).toEqual({ x: 0, y: 0, width: 512, height: 512 });
  });
});

// ─── pickTopmostTransformableLayer ───────────────────────────────────────────

describe("pickTopmostTransformableLayer", () => {
  it("returns null when no layers have opaque pixels at the point", () => {
    const layer = makeLayer({ id: "a" });
    const canvas = makeCanvasWithPixels(100, 100, []);
    const canvases = new Map([["a", canvas]]);
    const result = pickTopmostTransformableLayer(
      [layer],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result).toBeNull();
  });

  it("picks the topmost visible layer with opaque pixels", () => {
    const bottom = makeLayer({ id: "bottom" });
    const top = makeLayer({ id: "top" });
    // Only the top layer has pixels at (50,50)
    const bottomCanvas = makeCanvasWithPixels(100, 100, []);
    const topCanvas = makeCanvasWithPixels(100, 100, [
      { x: 40, y: 40, w: 20, h: 20 }
    ]);
    const canvases = new Map([
      ["bottom", bottomCanvas],
      ["top", topCanvas]
    ]);
    const result = pickTopmostTransformableLayer(
      [bottom, top],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result?.id).toBe("top");
  });

  it("skips invisible layers", () => {
    const visible = makeLayer({ id: "visible" });
    const invisible = makeLayer({ id: "invisible", visible: false });
    const visibleCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const invisibleCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const canvases = new Map([
      ["visible", visibleCanvas],
      ["invisible", invisibleCanvas]
    ]);
    const result = pickTopmostTransformableLayer(
      [visible, invisible],
      canvases,
      { x: 50, y: 50 },
      null
    );
    // The invisible layer (higher index = top) is skipped
    expect(result?.id).toBe("visible");
  });

  it("skips locked layers", () => {
    const unlocked = makeLayer({ id: "unlocked" });
    const locked = makeLayer({ id: "locked", locked: true });
    const unlockedCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const lockedCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const canvases = new Map([
      ["unlocked", unlockedCanvas],
      ["locked", lockedCanvas]
    ]);
    const result = pickTopmostTransformableLayer(
      [unlocked, locked],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result?.id).toBe("unlocked");
  });

  it("skips group layers", () => {
    const raster = makeLayer({ id: "raster" });
    const group = makeLayer({ id: "group", type: "group" });
    const rasterCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const canvases = new Map([["raster", rasterCanvas]]);
    const result = pickTopmostTransformableLayer(
      [raster, group],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result?.id).toBe("raster");
  });
});

// ─── resolveTargetEntry ──────────────────────────────────────────────────────

describe("resolveTargetEntry", () => {
  it("creates an entry with resolved gizmo bounds", () => {
    const layer = makeLayer({ id: "test-layer" });
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const entry = resolveTargetEntry(layer, canvas, { width: 512, height: 512 });
    expect(entry.layerId).toBe("test-layer");
    expect(entry.bounds.width).toBeGreaterThan(0);
    expect(entry.bounds.height).toBeGreaterThan(0);
  });
});
