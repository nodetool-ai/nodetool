import { describe, expect, it } from "@jest/globals";
import { containBaseScale, buildTransformMatrix, IDENTITY_TRANSFORM } from "../transform";

interface ClipTransform {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  anchor: { x: number; y: number };
}

describe("containBaseScale", () => {
  it("returns 1:1 when layer matches canvas aspect ratio", () => {
    const result = containBaseScale(1920, 1080, 1920, 1080);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(1);
  });

  it("letterboxes a wide layer on a tall canvas", () => {
    const result = containBaseScale(200, 100, 100, 100);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0.5);
  });

  it("pillarboxes a tall layer on a wide canvas", () => {
    const result = containBaseScale(100, 200, 100, 100);
    expect(result.x).toBeCloseTo(0.5);
    expect(result.y).toBeCloseTo(1);
  });

  it("returns 1:1 for zero canvas dimensions", () => {
    expect(containBaseScale(100, 100, 0, 100)).toEqual({ x: 1, y: 1 });
    expect(containBaseScale(100, 100, 100, 0)).toEqual({ x: 1, y: 1 });
  });

  it("returns 1:1 for zero layer dimensions", () => {
    expect(containBaseScale(0, 100, 100, 100)).toEqual({ x: 1, y: 1 });
    expect(containBaseScale(100, 0, 100, 100)).toEqual({ x: 1, y: 1 });
  });

  it("handles non-square canvas with wider layer", () => {
    const result = containBaseScale(400, 100, 1920, 1080);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo((1920 / 1080) / (400 / 100));
  });
});

describe("buildTransformMatrix", () => {
  it("produces identity-like matrix for IDENTITY_TRANSFORM on a square canvas", () => {
    const base = { x: 1, y: 1 };
    const m = buildTransformMatrix(IDENTITY_TRANSFORM, base, 100, 100);
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
    expect(m[0]).toBeCloseTo(1);
    expect(m[5]).toBeCloseTo(1);
    expect(m[10]).toBeCloseTo(1);
    expect(m[15]).toBeCloseTo(1);
    expect(m[1]).toBeCloseTo(0);
    expect(m[4]).toBeCloseTo(0);
    expect(m[12]).toBeCloseTo(0);
    expect(m[13]).toBeCloseTo(0);
  });

  it("applies position offset in clip space", () => {
    const transform: ClipTransform = {
      ...IDENTITY_TRANSFORM,
      position: { x: 50, y: 0 },
    };
    const m = buildTransformMatrix(transform, { x: 1, y: 1 }, 100, 100);
    expect(m[12]).toBeCloseTo(1.0);
    expect(m[13]).toBeCloseTo(0);
  });

  it("flips Y for position (canvas Y down, clip Y up)", () => {
    const transform: ClipTransform = {
      ...IDENTITY_TRANSFORM,
      position: { x: 0, y: 50 },
    };
    const m = buildTransformMatrix(transform, { x: 1, y: 1 }, 100, 100);
    expect(m[12]).toBeCloseTo(0);
    expect(m[13]).toBeCloseTo(-1.0);
  });

  it("applies scale through the base scale", () => {
    const transform: ClipTransform = {
      ...IDENTITY_TRANSFORM,
      scale: { x: 2, y: 0.5 },
    };
    const m = buildTransformMatrix(transform, { x: 1, y: 1 }, 100, 100);
    expect(m[0]).toBeCloseTo(2);
    expect(m[5]).toBeCloseTo(0.5);
  });

  it("applies 90-degree rotation", () => {
    const transform: ClipTransform = {
      ...IDENTITY_TRANSFORM,
      rotation: Math.PI / 2,
    };
    const m = buildTransformMatrix(transform, { x: 1, y: 1 }, 100, 100);
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(-1);
    expect(m[5]).toBeCloseTo(0);
  });

  it("handles zero canvas dimensions without NaN", () => {
    const m = buildTransformMatrix(IDENTITY_TRANSFORM, { x: 1, y: 1 }, 0, 0);
    for (let i = 0; i < 16; i++) {
      expect(Number.isNaN(m[i])).toBe(false);
    }
  });
});
