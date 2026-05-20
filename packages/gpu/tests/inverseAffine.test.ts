import { describe, it, expect } from "vitest";
import { forwardClipMatrixToInverseAffine } from "../src/webgpu/compositor.js";

/**
 * Build a column-major 4×4 matrix from the affine 2×2 block (a00,a01,a10,a11)
 * and translation (tx,ty) — the only entries forwardClipMatrixToInverseAffine
 * reads. Mirrors the layout produced by the timeline's buildTransformMatrix.
 */
function clipMatrix(
  a00: number,
  a01: number,
  a10: number,
  a11: number,
  tx: number,
  ty: number
): Float32Array {
  const m = new Float32Array(16);
  m[0] = a00;
  m[1] = a10;
  m[4] = a01;
  m[5] = a11;
  m[12] = tx;
  m[13] = ty;
  m[15] = 1;
  return m;
}

describe("forwardClipMatrixToInverseAffine", () => {
  it("maps an identity contain-fit to the identity inverse-affine", () => {
    // A = I, t = 0; canvas matches source → screen px == texel.
    const inv = forwardClipMatrixToInverseAffine(
      clipMatrix(1, 0, 0, 1, 0, 0),
      200,
      100,
      200,
      100
    );
    expect(inv.a).toBeCloseTo(1, 6);
    expect(inv.b).toBeCloseTo(0, 6);
    expect(inv.tx).toBeCloseTo(0, 6);
    expect(inv.c).toBeCloseTo(0, 6);
    expect(inv.d).toBeCloseTo(1, 6);
    expect(inv.ty).toBeCloseTo(0, 6);
  });

  it("scales by the source/canvas dimension ratio", () => {
    const inv = forwardClipMatrixToInverseAffine(
      clipMatrix(1, 0, 0, 1, 0, 0),
      100,
      50,
      400,
      200
    );
    // texel = (X/cw*sw, Y/ch*sh) → a = sw/cw, d = sh/ch.
    expect(inv.a).toBeCloseTo(0.25, 6);
    expect(inv.d).toBeCloseTo(0.25, 6);
    expect(inv.b).toBeCloseTo(0, 6);
    expect(inv.c).toBeCloseTo(0, 6);
  });

  it("handles a 90° rotation (off-diagonal terms)", () => {
    // A = R(90°) = [[0,-1],[1,0]] (column-major a00=0,a10=1,a01=-1,a11=0).
    const inv = forwardClipMatrixToInverseAffine(
      clipMatrix(0, -1, 1, 0, 0, 0),
      2,
      2,
      2,
      2
    );
    expect(inv.a).toBeCloseTo(0, 6);
    expect(inv.b).toBeCloseTo(-1, 6);
    expect(inv.tx).toBeCloseTo(2, 6);
    expect(inv.c).toBeCloseTo(1, 6);
    expect(inv.d).toBeCloseTo(0, 6);
    expect(inv.ty).toBeCloseTo(0, 6);
  });

  it("reconstructs an exact affine (round-trips a known screen→texel point)", () => {
    // Translate the quad right by +0.5 in clip space.
    const cw = 200;
    const ch = 100;
    const sw = 200;
    const sh = 100;
    const inv = forwardClipMatrixToInverseAffine(
      clipMatrix(1, 0, 0, 1, 0.5, 0),
      sw,
      sh,
      cw,
      ch
    );
    // texel.x(X) = a·X + b·Y + tx. With t shifting clip +0.5, the texture is
    // shifted right by cw·0.25 px on screen → texel.x = (X - 50)/cw·sw.
    const texelX = (X: number, Y: number) => inv.a * X + inv.b * Y + inv.tx;
    expect(texelX(50, 0)).toBeCloseTo(0, 4);
    expect(texelX(250, 0)).toBeCloseTo(sw, 4);
  });

  it("falls back to identity on a degenerate (non-invertible) matrix", () => {
    const inv = forwardClipMatrixToInverseAffine(
      clipMatrix(0, 0, 0, 0, 0, 0),
      100,
      100,
      100,
      100
    );
    expect(inv).toEqual({ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 });
  });

  it("falls back to identity on zero dimensions", () => {
    const inv = forwardClipMatrixToInverseAffine(
      clipMatrix(1, 0, 0, 1, 0, 0),
      0,
      100,
      100,
      100
    );
    expect(inv).toEqual({ a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 });
  });
});
