import { describe, it, expect } from "vitest";
import {
  defaultLayerTransform,
  layerTransformToInverseAffine,
  type LayerTransform2D
} from "../src/compositor/transform.js";
import type { InverseAffine } from "../src/compositor/compositor.js";

/** Apply an InverseAffine (canvas px → texel) to a canvas point. */
function applyInverse(
  m: InverseAffine,
  x: number,
  y: number
): { tx: number; ty: number } {
  return {
    tx: m.a * x + m.b * y + m.tx,
    ty: m.c * x + m.d * y + m.ty
  };
}

describe("layerTransformToInverseAffine", () => {
  it("default transform maps canvas px 1:1 onto texels (top-left at origin)", () => {
    const w = 100;
    const h = 60;
    const m = layerTransformToInverseAffine(
      defaultLayerTransform(w, h),
      w,
      h
    );
    expect(applyInverse(m, 0, 0)).toEqual({ tx: 0, ty: 0 });
    expect(applyInverse(m, 50, 30)).toEqual({ tx: 50, ty: 30 });
    expect(applyInverse(m, w, h)).toEqual({ tx: w, ty: h });
  });

  it("translation moves the sampled region", () => {
    const w = 40;
    const h = 40;
    // Center placed at (100, 100): the layer center (20,20) lives at canvas
    // (100,100), so canvas (100,100) → texel (20,20).
    const t: LayerTransform2D = {
      x: 100,
      y: 100,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    const m = layerTransformToInverseAffine(t, w, h);
    const c = applyInverse(m, 100, 100);
    expect(c.tx).toBeCloseTo(20);
    expect(c.ty).toBeCloseTo(20);
    // Canvas top-left of the placed layer is at (80, 80) → texel (0,0).
    const tl = applyInverse(m, 80, 80);
    expect(tl.tx).toBeCloseTo(0);
    expect(tl.ty).toBeCloseTo(0);
  });

  it("uniform scale shrinks the canvas footprint", () => {
    const w = 100;
    const h = 100;
    // 2× scale, center kept at (50,50). Canvas (50,50) → texel center (50,50);
    // canvas (0,0) maps to texel (50 - 50/2)=25? center at canvas 50, half
    // footprint = w*scale/2 = 100. So texel at canvas 0: (0-50)/2 + 50 = 25.
    const t: LayerTransform2D = {
      x: 50,
      y: 50,
      scaleX: 2,
      scaleY: 2,
      rotation: 0
    };
    const m = layerTransformToInverseAffine(t, w, h);
    expect(applyInverse(m, 50, 50).tx).toBeCloseTo(50);
    expect(applyInverse(m, 0, 0).tx).toBeCloseTo(25);
    expect(applyInverse(m, 250, 50).tx).toBeCloseTo(150); // outside [0,100]
  });

  it("90° rotation maps axes as expected about the center", () => {
    const w = 100;
    const h = 100;
    const t: LayerTransform2D = {
      x: 50,
      y: 50,
      scaleX: 1,
      scaleY: 1,
      rotation: Math.PI / 2
    };
    const m = layerTransformToInverseAffine(t, w, h);
    // Center is invariant.
    const center = applyInverse(m, 50, 50);
    expect(center.tx).toBeCloseTo(50);
    expect(center.ty).toBeCloseTo(50);
    // A point to the right of center in canvas space maps to a point below
    // center in texel space (CCW rotation of the forward placement).
    const right = applyInverse(m, 90, 50);
    expect(right.tx).toBeCloseTo(50);
    expect(right.ty).toBeCloseTo(10);
  });

  it("degenerate (zero) scale falls back to identity", () => {
    const m = layerTransformToInverseAffine(
      { x: 0, y: 0, scaleX: 0, scaleY: 1, rotation: 0 },
      10,
      10
    );
    expect(m).toEqual({ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 });
  });
});
