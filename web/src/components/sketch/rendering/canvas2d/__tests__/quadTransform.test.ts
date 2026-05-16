import { getQuadExtents, translateQuad } from "../quadTransform";
import type { Point } from "../../../types/geometry";

type Quad = readonly [Point, Point, Point, Point];

describe("getQuadExtents", () => {
  it("returns correct extents for a unit square", () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];
    const extents = getQuadExtents(quad);
    expect(extents.minX).toBe(0);
    expect(extents.minY).toBe(0);
    expect(extents.maxX).toBe(1);
    expect(extents.maxY).toBe(1);
  });

  it("returns correct extents for an offset quad", () => {
    const quad: Quad = [
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 10, y: 80 }
    ];
    const extents = getQuadExtents(quad);
    expect(extents.minX).toBe(10);
    expect(extents.minY).toBe(20);
    expect(extents.maxX).toBe(50);
    expect(extents.maxY).toBe(80);
  });

  it("handles quads with negative coordinates", () => {
    const quad: Quad = [
      { x: -5, y: -10 },
      { x: 15, y: -3 },
      { x: 20, y: 25 },
      { x: -8, y: 18 }
    ];
    const extents = getQuadExtents(quad);
    expect(extents.minX).toBe(-8);
    expect(extents.minY).toBe(-10);
    expect(extents.maxX).toBe(20);
    expect(extents.maxY).toBe(25);
  });

  it("handles degenerate quad (all points same)", () => {
    const quad: Quad = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 }
    ];
    const extents = getQuadExtents(quad);
    expect(extents.minX).toBe(5);
    expect(extents.maxX).toBe(5);
    expect(extents.minY).toBe(5);
    expect(extents.maxY).toBe(5);
  });

  it("handles fractional coordinates", () => {
    const quad: Quad = [
      { x: 0.5, y: 0.1 },
      { x: 3.7, y: 0.2 },
      { x: 4.1, y: 2.9 },
      { x: 0.3, y: 2.8 }
    ];
    const extents = getQuadExtents(quad);
    expect(extents.minX).toBeCloseTo(0.3);
    expect(extents.minY).toBeCloseTo(0.1);
    expect(extents.maxX).toBeCloseTo(4.1);
    expect(extents.maxY).toBeCloseTo(2.9);
  });
});

describe("translateQuad", () => {
  it("translates all points by the given offset", () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ];
    const result = translateQuad(quad, 5, 3);
    expect(result[0]).toEqual({ x: 5, y: 3 });
    expect(result[1]).toEqual({ x: 15, y: 3 });
    expect(result[2]).toEqual({ x: 15, y: 13 });
    expect(result[3]).toEqual({ x: 5, y: 13 });
  });

  it("handles negative translation", () => {
    const quad: Quad = [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 40 },
      { x: 10, y: 40 }
    ];
    const result = translateQuad(quad, -10, -20);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 20, y: 0 });
    expect(result[2]).toEqual({ x: 20, y: 20 });
    expect(result[3]).toEqual({ x: 0, y: 20 });
  });

  it("preserves quad shape with zero translation", () => {
    const quad: Quad = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
      { x: 7, y: 8 }
    ];
    const result = translateQuad(quad, 0, 0);
    expect(result[0]).toEqual({ x: 1, y: 2 });
    expect(result[1]).toEqual({ x: 3, y: 4 });
    expect(result[2]).toEqual({ x: 5, y: 6 });
    expect(result[3]).toEqual({ x: 7, y: 8 });
  });

  it("returns a new array (does not mutate input)", () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];
    const result = translateQuad(quad, 10, 10);
    expect(result).not.toBe(quad);
    expect(quad[0]).toEqual({ x: 0, y: 0 });
  });
});
