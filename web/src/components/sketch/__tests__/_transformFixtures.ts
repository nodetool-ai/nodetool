/**
 * Test-only fixture helpers for the post-refactor LayerTransform API.
 *
 * The legacy positional helpers (matrix compose/decompose, ensure-matrix
 * coercion) were removed from production. These fixture functions reproduce
 * the old positional calling convention against the new discriminated-union
 * API so test call sites can be renamed via a single import change rather
 * than rewritten line by line.
 */

import {
  IDENTITY_AFFINE,
  affineToMatrix,
  isAffineTransform,
  isDualQuadTransform,
  isSingleQuadTransform,
  matrixToAffine,
  makeAffineTransform,
  type AffineMatrix,
  type AffineTransform,
  type DualQuadTransform,
  type LayerTransform,
  type SingleQuadTransform
} from "../types";

/**
 * Test-only narrowing helpers. They throw if the transform is not the
 * expected variant — useful inside `expect(...)` chains where the runtime
 * shape is known but TS cannot infer it from a `LayerTransform` return.
 */
export function aff(t: LayerTransform): AffineTransform {
  if (!isAffineTransform(t)) {
    throw new Error(`expected affine transform, got kind=${t.kind}`);
  }
  return t;
}

export function quadOf(t: LayerTransform): SingleQuadTransform {
  if (!isSingleQuadTransform(t)) {
    throw new Error(`expected single-quad transform, got kind=${t.kind}`);
  }
  return t;
}

export function dualQuadOf(t: LayerTransform): DualQuadTransform {
  if (!isDualQuadTransform(t)) {
    throw new Error(`expected dual-quad transform, got kind=${t.kind}`);
  }
  return t;
}

export function fxComposeMatrix(
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  rotation: number
): AffineMatrix {
  return affineToMatrix({ kind: "affine", x, y, scaleX, scaleY, rotation });
}

export function fxDecomposeMatrix(m: AffineMatrix): {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
} {
  return matrixToAffine(m);
}

/**
 * Drop-in for the removed `ensureTransformMatrix` test helper. Accepts the
 * legacy partial shape (loose x/y/scaleX/scaleY/rotation) and returns a fully
 * canonical `AffineTransform`. The legacy `matrix` and `mode` fields on the
 * input are ignored — both were derived state in the new world.
 */
export function fxEnsureTransform(
  partial?: Partial<{
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  }>
): AffineTransform {
  return makeAffineTransform({
    x: partial?.x ?? 0,
    y: partial?.y ?? 0,
    scaleX: partial?.scaleX ?? 1,
    scaleY: partial?.scaleY ?? 1,
    rotation: partial?.rotation ?? 0
  });
}

export { IDENTITY_AFFINE };
export type { AffineMatrix, AffineTransform, LayerTransform };

// Jest discovers this file via the `__tests__/` convention even though it only
// holds shared helpers. Keep one trivial test so the suite does not fail with
// "must contain at least one test".
describe("transform fixtures sanity", () => {
  it("IDENTITY_AFFINE is canonical", () => {
    expect(IDENTITY_AFFINE.kind).toBe("affine");
    expect(IDENTITY_AFFINE.x).toBe(0);
    expect(IDENTITY_AFFINE.scaleX).toBe(1);
  });
});
