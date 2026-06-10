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

  describe("aspect-corrected rotation", () => {
    /** Map a quad corner through the matrix and convert NDC → pixels. */
    const cornerPx = (
      m: Float32Array,
      qx: number,
      qy: number,
      w: number,
      h: number
    ) => ({
      x: (m[0] * qx + m[4] * qy + m[12]) * (w / 2),
      y: (m[1] * qx + m[5] * qy + m[13]) * (h / 2),
    });

    it("keeps a square clip square under 90° rotation on a 16:9 canvas", () => {
      const W = 1920;
      const H = 1080;
      // Square source contain-fit on 16:9: 540px half-extent on both axes.
      const base = containBaseScale(1080, 1080, W, H);
      const transform: ClipTransform = {
        ...IDENTITY_TRANSFORM,
        rotation: Math.PI / 2,
      };
      const m = buildTransformMatrix(transform, base, W, H);
      const c = cornerPx(m, 1, 1, W, H);
      // 90° rotation in pixel space: (540, 540) → (-540, 540).
      expect(Math.abs(c.x)).toBeCloseTo(540, 3);
      expect(Math.abs(c.y)).toBeCloseTo(540, 3);
    });

    it("swaps pixel extents of a non-square clip under 90° rotation", () => {
      const W = 1920;
      const H = 1080;
      // Full-frame 16:9 source: base scale {1,1} → half-extents (960, 540).
      const transform: ClipTransform = {
        ...IDENTITY_TRANSFORM,
        rotation: Math.PI / 2,
      };
      const m = buildTransformMatrix(transform, { x: 1, y: 1 }, W, H);
      const right = cornerPx(m, 1, 0, W, H);
      const top = cornerPx(m, 0, 1, W, H);
      // The 960px half-width now spans 960px vertically, and vice versa.
      expect(Math.hypot(right.x, right.y)).toBeCloseTo(960, 3);
      expect(Math.abs(right.y)).toBeCloseTo(960, 3);
      expect(Math.hypot(top.x, top.y)).toBeCloseTo(540, 3);
      expect(Math.abs(top.x)).toBeCloseTo(540, 3);
    });

    it("normalizes position by the provided reference resolution", () => {
      const transform: ClipTransform = {
        ...IDENTITY_TRANSFORM,
        position: { x: 960, y: -540 },
      };
      const m = buildTransformMatrix(transform, { x: 1, y: 1 }, 1920, 1080);
      expect(m[12]).toBeCloseTo(1.0);
      expect(m[13]).toBeCloseTo(1.0);
    });

    it("keeps the anchor point fixed under rotation on a non-square canvas", () => {
      const W = 1920;
      const H = 1080;
      const anchor = { x: 0.25, y: 0.75 };
      const ax = (anchor.x - 0.5) * 2;
      const ay = (anchor.y - 0.5) * 2;
      const still = buildTransformMatrix(
        { ...IDENTITY_TRANSFORM, anchor },
        { x: 1, y: 1 },
        W,
        H
      );
      const rotated = buildTransformMatrix(
        { ...IDENTITY_TRANSFORM, anchor, rotation: 0.7 },
        { x: 1, y: 1 },
        W,
        H
      );
      const before = cornerPx(still, ax, ay, W, H);
      const after = cornerPx(rotated, ax, ay, W, H);
      expect(after.x).toBeCloseTo(before.x, 3);
      expect(after.y).toBeCloseTo(before.y, 3);
    });
  });
});
