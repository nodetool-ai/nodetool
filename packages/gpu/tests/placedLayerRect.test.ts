import { describe, expect, it } from "vitest";
import { placedLayerRect, type InverseAffine } from "../src/compositor/compositor.js";

/** The inverse of placing a source at (`x`, `y`) scaled by `s`: texel = (screen - offset) / s. */
function placedAt(x: number, y: number, s = 1): InverseAffine {
  return { a: 1 / s, b: 0, tx: -x / s, c: 0, d: 1 / s, ty: -y / s };
}

describe("placedLayerRect", () => {
  it("bounds a translated source with a pixel of slack for filtering", () => {
    expect(placedLayerRect(placedAt(200, 300), 100, 50, 1920, 1080)).toEqual({
      x: 199,
      y: 299,
      width: 102,
      height: 52
    });
  });

  it("scales the bounds with the placement", () => {
    expect(placedLayerRect(placedAt(10, 20, 2), 30, 40, 1920, 1080)).toEqual({
      x: 9,
      y: 19,
      width: 62,
      height: 82
    });
  });

  it("clamps a source hanging off the canvas", () => {
    expect(placedLayerRect(placedAt(-40, 1000), 100, 200, 1920, 1080)).toEqual({
      x: 0,
      y: 999,
      width: 61,
      height: 81
    });
  });

  it("answers null for a source entirely off the canvas", () => {
    expect(placedLayerRect(placedAt(2000, 10), 100, 100, 1920, 1080)).toBeNull();
    expect(placedLayerRect(placedAt(10, -300), 100, 100, 1920, 1080)).toBeNull();
  });

  it("bounds a rotated source by its corners", () => {
    // A quarter turn: screen (x, y) reads texel (y, 50 - x), so the 100×50
    // source spans x 0..50 and y 0..100.
    const inv: InverseAffine = { a: 0, b: 1, tx: 0, c: -1, d: 0, ty: 50 };
    expect(placedLayerRect(inv, 100, 50, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 51,
      height: 101
    });
  });

  it("answers the whole canvas when the horizon crosses the quad", () => {
    // The forward placement's w = 1 - u/50 changes sign inside a 100-wide source.
    const inv: InverseAffine = { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0, p: 0.02, q: 0, r: 1 };
    expect(placedLayerRect(inv, 100, 100, 640, 360)).toEqual({ x: 0, y: 0, width: 640, height: 360 });
  });

  it("answers the whole canvas for a singular placement", () => {
    const inv: InverseAffine = { a: 0, b: 0, tx: 0, c: 0, d: 0, ty: 0 };
    expect(placedLayerRect(inv, 100, 100, 640, 360)).toEqual({ x: 0, y: 0, width: 640, height: 360 });
  });
});
