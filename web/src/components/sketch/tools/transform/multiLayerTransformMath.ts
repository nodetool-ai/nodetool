/**
 * Document-space affine helpers for transforming multiple layers together.
 *
 * Each layer's raster rectangle maps to the document via an affine matrix.
 * A gesture on the union bbox yields delta D; each layer updates as D × Mᵢ.
 */

import type { AffineMatrix, LayerContentBounds, LayerTransform, Point } from "../../types";
import type { Rect } from "../../types/geometry";
import { matrixToAffine, makeAffineTransform, isQuadTransform } from "../../types";
import { computeTransformedCorners } from "../../transform/geometry/layerGeometry";

/** Multiply two 2D affine matrices (column-vector convention). */
export function affineMultiply(A: AffineMatrix, B: AffineMatrix): AffineMatrix {
  const [a, b, c, d, e, f] = A;
  const [A2, B2, C2, D2, E2, F2] = B;
  return [
    a * A2 + c * B2,
    b * A2 + d * B2,
    a * C2 + c * D2,
    b * C2 + d * D2,
    a * E2 + c * F2 + e,
    b * E2 + d * F2 + f
  ];
}

/** Invert a 2D affine matrix; returns null if singular. */
export function affineInvert(m: AffineMatrix): AffineMatrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    return null;
  }
  const invDet = 1 / det;
  const invA = d * invDet;
  const invB = -b * invDet;
  const invC = -c * invDet;
  const invD = a * invDet;
  const invE = -(invA * e + invC * f);
  const invF = -(invB * e + invD * f);
  return [invA, invB, invC, invD, invE, invF];
}

function solveAffineRow(
  x1: number,
  y1: number,
  u1: number,
  x2: number,
  y2: number,
  u2: number,
  x3: number,
  y3: number,
  u3: number
): [number, number, number] | null {
  const det =
    x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
  if (Math.abs(det) < 1e-12) {
    return null;
  }
  const invDet = 1 / det;
  const a =
    (u1 * (y2 - y3) - u2 * (y1 - y3) + u3 * (y1 - y2)) * invDet;
  const c =
    (x1 * (u2 - u3) - x2 * (u1 - u3) + x3 * (u1 - u2)) * invDet;
  const e =
    (x1 * (y2 * u3 - y3 * u2) -
      x2 * (y1 * u3 - y3 * u1) +
      x3 * (y1 * u2 - y2 * u1)) *
    invDet;
  return [a, c, e];
}

/**
 * Affine matrix mapping raster rectangle corners (TL, TR, BL) to doc corners.
 */
export function fitAffineRectangleCorners(
  ox: number,
  oy: number,
  w: number,
  h: number,
  cornersDoc: [Point, Point, Point, Point]
): AffineMatrix | null {
  const rowU = solveAffineRow(
    ox,
    oy,
    cornersDoc[0].x,
    ox + w,
    oy,
    cornersDoc[1].x,
    ox,
    oy + h,
    cornersDoc[3].x
  );
  const rowV = solveAffineRow(
    ox,
    oy,
    cornersDoc[0].y,
    ox + w,
    oy,
    cornersDoc[1].y,
    ox,
    oy + h,
    cornersDoc[3].y
  );
  if (!rowU || !rowV) {
    return null;
  }
  const [a, c, e] = rowU;
  const [b, d, f] = rowV;
  return [a, b, c, d, e, f];
}

/** Raster-local rectangle → document affine (standard layers only). */
export function rasterSpaceToDocAffine(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): AffineMatrix | null {
  if (isQuadTransform(transform)) {
    return null;
  }
  const cornersDoc = computeTransformedCorners(transform, rasterBounds);
  const { x: ox, y: oy, width: w, height: h } = rasterBounds;
  return fitAffineRectangleCorners(ox, oy, w, h, cornersDoc);
}

export function unionOfDocumentExtents(
  rects: Rect[]
): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/** Build LayerTransform from a document-space affine (TRS decomposition). */
export function layerTransformFromDocAffine(m: AffineMatrix): LayerTransform {
  return makeAffineTransform(matrixToAffine(m));
}
