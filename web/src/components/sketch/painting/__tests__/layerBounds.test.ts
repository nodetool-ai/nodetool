/**
 * @jest-environment node
 */
import {
  getLayerRasterBounds,
  unionLayerBounds,
  getLayerCompositeOffset,
  getDocumentViewportLayerBounds
} from "../layerBounds";

describe("getLayerRasterBounds", () => {
  it("returns content bounds when fully specified", () => {
    const layer = {
      contentBounds: { x: 10, y: 20, width: 100, height: 200 }
    };
    expect(getLayerRasterBounds(layer)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200
    });
  });

  it("rounds fractional coordinates", () => {
    const layer = {
      contentBounds: { x: 10.7, y: 20.3, width: 100.9, height: 200.1 }
    };
    const result = getLayerRasterBounds(layer);
    expect(result.x).toBe(11);
    expect(result.y).toBe(20);
    expect(result.width).toBe(101);
    expect(result.height).toBe(200);
  });

  it("uses fallback dimensions when content bounds are missing", () => {
    const layer = {};
    expect(getLayerRasterBounds(layer, { width: 512, height: 256 })).toEqual({
      x: 0,
      y: 0,
      width: 512,
      height: 256
    });
  });

  it("falls back to 1x1 when no content bounds and no fallback", () => {
    expect(getLayerRasterBounds({})).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1
    });
  });

  it("replaces zero width/height with fallback", () => {
    const layer = { contentBounds: { x: 0, y: 0, width: 0, height: 0 } };
    expect(getLayerRasterBounds(layer, { width: 64, height: 64 })).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64
    });
  });

  it("replaces negative width/height with fallback", () => {
    const layer = { contentBounds: { x: 5, y: 5, width: -10, height: -20 } };
    expect(getLayerRasterBounds(layer, { width: 32, height: 32 })).toEqual({
      x: 5,
      y: 5,
      width: 32,
      height: 32
    });
  });

  it("handles partially undefined content bounds", () => {
    const layer = { contentBounds: { x: 5, width: 100 } };
    const result = getLayerRasterBounds(layer);
    expect(result.x).toBe(5);
    expect(result.y).toBe(0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(1);
  });
});

describe("unionLayerBounds", () => {
  it("computes union of non-overlapping rects", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 20, width: 10, height: 10 };
    expect(unionLayerBounds(a, b)).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30
    });
  });

  it("returns the larger rect when one contains the other", () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    const inner = { x: 10, y: 10, width: 20, height: 20 };
    expect(unionLayerBounds(outer, inner)).toEqual(outer);
  });

  it("handles negative coordinates", () => {
    const a = { x: -50, y: -50, width: 50, height: 50 };
    const b = { x: 0, y: 0, width: 50, height: 50 };
    expect(unionLayerBounds(a, b)).toEqual({
      x: -50,
      y: -50,
      width: 100,
      height: 100
    });
  });

  it("ensures minimum 1px dimensions", () => {
    const a = { x: 5, y: 5, width: 0, height: 0 };
    const b = { x: 5, y: 5, width: 0, height: 0 };
    const result = unionLayerBounds(a, b);
    expect(result.width).toBeGreaterThanOrEqual(1);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it("is commutative", () => {
    const a = { x: 10, y: 20, width: 30, height: 40 };
    const b = { x: 5, y: 25, width: 50, height: 10 };
    expect(unionLayerBounds(a, b)).toEqual(unionLayerBounds(b, a));
  });
});

describe("getLayerCompositeOffset", () => {
  it("adds transform offset to content bounds position", () => {
    const layer = {
      contentBounds: { x: 10, y: 20, width: 100, height: 100 },
      transform: { x: 30, y: 40 }
    };
    expect(getLayerCompositeOffset(layer)).toEqual({ x: 40, y: 60 });
  });

  it("defaults transform to zero", () => {
    const layer = {
      contentBounds: { x: 15, y: 25, width: 50, height: 50 }
    };
    expect(getLayerCompositeOffset(layer)).toEqual({ x: 15, y: 25 });
  });

  it("defaults content bounds to zero", () => {
    const layer = { transform: { x: 5, y: 10 } };
    expect(getLayerCompositeOffset(layer)).toEqual({ x: 5, y: 10 });
  });

  it("returns origin for empty layer", () => {
    expect(getLayerCompositeOffset({})).toEqual({ x: 0, y: 0 });
  });
});

describe("getDocumentViewportLayerBounds", () => {
  it("inverts the layer transform and uses document canvas size", () => {
    const layer = {
      id: "l1",
      name: "Layer 1",
      type: "raster" as const,
      visible: true,
      opacity: 1,
      locked: false,
      alphaLock: false,
      blendMode: "normal" as const,
      data: null,
      transform: { x: 30, y: 50 }
    };
    const doc = {
      canvas: { width: 800, height: 600 }
    };
    expect(getDocumentViewportLayerBounds(layer as any, doc as any)).toEqual({
      x: -30,
      y: -50,
      width: 800,
      height: 600
    });
  });

  it("defaults transform to zero", () => {
    const layer = {
      id: "l1",
      name: "Layer",
      type: "raster" as const,
      visible: true,
      opacity: 1,
      locked: false,
      alphaLock: false,
      blendMode: "normal" as const,
      data: null,
      transform: { x: 0, y: 0 }
    };
    const doc = { canvas: { width: 1024, height: 1024 } };
    const result = getDocumentViewportLayerBounds(layer as any, doc as any);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(Math.abs(result.x)).toBe(0);
    expect(Math.abs(result.y)).toBe(0);
  });
});
