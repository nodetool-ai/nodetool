/**
 * Sketch Editor — Affine Matrix Helpers
 *
 * Renderers compose / decompose 6-element matrices on demand. The canonical
 * `AffineTransform` stores TRS values; the matrix is never persisted.
 */

import type { AffineTransform } from "../types";

/**
 * 2D affine matrix stored as [a, b, c, d, e, f] matching the DOMMatrix
 * convention:
 *
 *   | a  c  e |
 *   | b  d  f |
 *   | 0  0  1 |
 *
 * a=scaleX, b=skewY, c=skewX, d=scaleY, e=translateX, f=translateY.
 */
export type AffineMatrix = readonly [number, number, number, number, number, number];

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0];

/** Compose a TRS affine transform into a 6-element matrix (translate → rotate → scale). */
export function affineToMatrix(t: AffineTransform): AffineMatrix {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return [
    cos * t.scaleX,
    sin * t.scaleX,
    -sin * t.scaleY,
    cos * t.scaleY,
    t.x,
    t.y
  ];
}

/** Decompose a 6-element matrix into TRS values. Assumes no skew. */
export function matrixToAffine(m: AffineMatrix): Omit<AffineTransform, "kind"> {
  const [a, b, c, d, e, f] = m;
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  const det = a * d - b * c;
  return {
    x: e,
    y: f,
    scaleX,
    scaleY: det < 0 ? -scaleY : scaleY,
    rotation: Math.atan2(b, a)
  };
}
