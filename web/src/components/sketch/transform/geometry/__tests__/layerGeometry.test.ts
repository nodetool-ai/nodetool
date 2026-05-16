/**
 * @jest-environment jsdom
 */
import {
  getCanvasRasterBounds,
  setCanvasRasterBounds,
  getRasterBounds,
  getVisualBounds,
  getLayerGeometry,
  computeCompositeOffset,
  computeTransformedCorners,
  computeTransformedCenter,
  computeTransformedExtents,
  getDocumentViewportInLayerSpace,
  unionLayerBounds
} from "../layerGeometry";
import {
  makeAffineTransform,
  makeSingleQuadTransform
} from "../../../types";
import type { LayerContentBounds, LayerTransform, Quad } from "../../../types";

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = window.document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function fillCanvasRect(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  color = "#ff0000"
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context");
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ─── getCanvasRasterBounds / setCanvasRasterBounds ───────────────────────────

describe("canvas raster bounds metadata", () => {
  it("returns null for an unset canvas", () => {
    expect(getCanvasRasterBounds(makeCanvas(10, 10))).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(getCanvasRasterBounds(null)).toBeNull();
    expect(getCanvasRasterBounds(undefined)).toBeNull();
  });

  it("round-trips set/get", () => {
    const c = makeCanvas(10, 10);
    const bounds: LayerContentBounds = { x: 5, y: 7, width: 16, height: 32 };
    setCanvasRasterBounds(c, bounds);
    expect(getCanvasRasterBounds(c)).toEqual(bounds);
  });
});

// ─── getRasterBounds resolution priority ─────────────────────────────────────

describe("getRasterBounds resolution priority", () => {
  const layer = { contentBounds: { x: 5, y: 10, width: 50, height: 60 } };

  it("prefers tagged canvas bounds when present", () => {
    const c = makeCanvas(100, 100);
    setCanvasRasterBounds(c, { x: 99, y: 88, width: 200, height: 150 });
    expect(getRasterBounds(layer, c)).toEqual({
      x: 99,
      y: 88,
      width: 200,
      height: 150
    });
  });

  it("uses contentBounds origin + canvas dims when canvas is allocated", () => {
    const c = makeCanvas(40, 20);
    expect(getRasterBounds(layer, c)).toEqual({
      x: 5,
      y: 10,
      width: 40,
      height: 20
    });
  });

  it("uses contentBounds when canvas is missing", () => {
    expect(getRasterBounds(layer)).toEqual(layer.contentBounds);
  });

  it("uses fallback when canvas missing and contentBounds is empty", () => {
    expect(
      getRasterBounds(
        { contentBounds: { x: 0, y: 0, width: 0, height: 0 } },
        null,
        { width: 32, height: 64 }
      )
    ).toEqual({ x: 0, y: 0, width: 32, height: 64 });
  });

  it("falls back to 1x1 when no canvas, no contentBounds, no fallback", () => {
    expect(
      getRasterBounds({ contentBounds: { x: 0, y: 0, width: 0, height: 0 } })
    ).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

// ─── getVisualBounds content tightening ─────────────────────────────────────

describe("getVisualBounds", () => {
  it("uses contentBounds when strictly smaller than raster on both axes", () => {
    const layer = { contentBounds: { x: 0, y: 0, width: 16, height: 16 } };
    const canvas = makeCanvas(64, 64);
    expect(getVisualBounds(layer, canvas)).toEqual(layer.contentBounds);
  });

  it("falls back to opaque-pixel scan when contentBounds matches raster", () => {
    const layer = { contentBounds: { x: 0, y: 0, width: 64, height: 64 } };
    const canvas = makeCanvas(64, 64);
    fillCanvasRect(canvas, 10, 12, 8, 4);
    const v = getVisualBounds(layer, canvas);
    expect(v).toEqual({ x: 10, y: 12, width: 8, height: 4 });
  });

  it("returns the raster bounds when contentBounds is not smaller and canvas is empty", () => {
    const layer = { contentBounds: { x: 0, y: 0, width: 64, height: 64 } };
    const canvas = makeCanvas(64, 64);
    expect(getVisualBounds(layer, canvas)).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64
    });
  });
});

// ─── Affine geometry ─────────────────────────────────────────────────────────

describe("affine geometry helpers", () => {
  const bounds: LayerContentBounds = { x: 5, y: 5, width: 100, height: 80 };

  it("computeCompositeOffset = transform.xy + bounds.xy for identity", () => {
    const t = makeAffineTransform({ x: 10, y: 20 });
    expect(computeCompositeOffset(t, bounds)).toEqual({ x: 15, y: 25 });
  });

  it("computeTransformedCenter for identity", () => {
    const t = makeAffineTransform({ x: 0, y: 0 });
    expect(computeTransformedCenter(t, bounds)).toEqual({
      x: 5 + 50,
      y: 5 + 40
    });
  });

  it("computeTransformedExtents axis-aligned for unrotated scale", () => {
    const t = makeAffineTransform({ x: 0, y: 0, scaleX: 2, scaleY: 2 });
    const e = computeTransformedExtents(t, bounds);
    // center (55,45), half-extents (100,80) → AABB (-45,-35,200,160)
    expect(e).toEqual({ x: -45, y: -35, width: 200, height: 160 });
  });

  it("computeTransformedCorners for 90° rotation", () => {
    const t = makeAffineTransform({ x: 0, y: 0, rotation: Math.PI / 2 });
    const small: LayerContentBounds = { x: 0, y: 0, width: 10, height: 10 };
    const c = computeTransformedCorners(t, small);
    // Square rotated 90° around its center stays a square at the same center.
    expect(c[0].x).toBeCloseTo(10, 5);
    expect(c[0].y).toBeCloseTo(0, 5);
  });
});

// ─── Quad ───────────────────────────────────────────────────────────────────

describe("quad transforms", () => {
  const quad: Quad = [
    { x: 10, y: 20 },
    { x: 110, y: 20 },
    { x: 110, y: 90 },
    { x: 10, y: 90 }
  ];
  const bounds: LayerContentBounds = { x: 0, y: 0, width: 100, height: 70 };

  it("computeTransformedCorners returns the quad", () => {
    const t = makeSingleQuadTransform("distort", quad);
    expect(computeTransformedCorners(t, bounds)).toEqual([
      quad[0],
      quad[1],
      quad[2],
      quad[3]
    ]);
  });

  it("computeTransformedCenter = quad centroid", () => {
    const t = makeSingleQuadTransform("distort", quad);
    expect(computeTransformedCenter(t, bounds)).toEqual({ x: 60, y: 55 });
  });

  it("computeTransformedExtents = quad AABB", () => {
    const t = makeSingleQuadTransform("distort", quad);
    expect(computeTransformedExtents(t, bounds)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 70
    });
  });

  it("computeCompositeOffset = quad AABB origin", () => {
    const t = makeSingleQuadTransform("distort", quad);
    expect(computeCompositeOffset(t, bounds)).toEqual({ x: 10, y: 20 });
  });
});

// ─── getLayerGeometry bundling ──────────────────────────────────────────────

describe("getLayerGeometry bundling", () => {
  it("returns affine geometry consistent with the lower-level helpers", () => {
    const transform = makeAffineTransform({
      x: 10,
      y: 20,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 0.4
    });
    const layer = {
      transform,
      contentBounds: { x: 0, y: 0, width: 80, height: 60 }
    };
    const g = getLayerGeometry(layer);
    expect(g.rasterBounds).toEqual(layer.contentBounds);
    expect(g.compositeOffset).toEqual(
      computeCompositeOffset(transform, g.rasterBounds)
    );
    expect(g.transformedCenter).toEqual(
      computeTransformedCenter(transform, g.rasterBounds)
    );
    expect(g.transformedExtents).toEqual(
      computeTransformedExtents(transform, g.rasterBounds)
    );
    const corners = computeTransformedCorners(transform, g.rasterBounds);
    for (let i = 0; i < 4; i++) {
      expect(g.transformedCorners[i]).toEqual(corners[i]);
    }
  });

  it("uses canvas raster metadata when present", () => {
    const layer = {
      transform: makeAffineTransform({ x: 0, y: 0 }),
      contentBounds: { x: 0, y: 0, width: 32, height: 32 }
    };
    const c = makeCanvas(64, 64);
    setCanvasRasterBounds(c, { x: 4, y: 4, width: 64, height: 64 });
    const g = getLayerGeometry(layer, c);
    expect(g.rasterBounds).toEqual({ x: 4, y: 4, width: 64, height: 64 });
  });
});

// ─── getDocumentViewportInLayerSpace ────────────────────────────────────────

describe("getDocumentViewportInLayerSpace", () => {
  const doc = { canvas: { width: 800, height: 600 } };

  it("inverts affine translation", () => {
    const layer: { transform: LayerTransform } = {
      transform: makeAffineTransform({ x: 30, y: -40 })
    };
    expect(getDocumentViewportInLayerSpace(layer, doc)).toEqual({
      x: -30,
      y: 40,
      width: 800,
      height: 600
    });
  });

  it("returns identity origin for quad transforms", () => {
    const t = makeSingleQuadTransform("distort", [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]);
    const r = getDocumentViewportInLayerSpace({ transform: t }, doc);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    expect(r.width).toBe(800);
    expect(r.height).toBe(600);
  });
});

// ─── unionLayerBounds ───────────────────────────────────────────────────────

describe("unionLayerBounds", () => {
  it("computes the geometric union", () => {
    expect(
      unionLayerBounds(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 10, height: 10 }
      )
    ).toEqual({ x: 0, y: 0, width: 30, height: 30 });
  });

  it("clamps width/height to a minimum of 1", () => {
    const r = unionLayerBounds(
      { x: 5, y: 5, width: 0, height: 0 },
      { x: 5, y: 5, width: 0, height: 0 }
    );
    expect(r.width).toBe(1);
    expect(r.height).toBe(1);
  });
});
