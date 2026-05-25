/**
 * CoordinateMapper — centralized document-space ↔ layer-space mapping.
 *
 * Provides a single place for all coordinate transformations that paint
 * tools need. Layers may have a non-zero transform (offset) from the
 * document origin after being moved with the MoveTool; this mapper
 * accounts for that offset so paint tools always operate in the correct
 * coordinate space.
 *
 * When a layer has a full affine matrix, the mapper uses it for accurate
 * doc↔layer conversion that accounts for scale and rotation. Otherwise
 * it falls back to translation-only mapping.
 */

import type { Point, LayerTransform, AffineMatrix } from "../types";
import { isAffineTransform, affineToMatrix } from "../types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CoordinateMapperConfig {
  /** Current layer transform (offset from document origin). */
  layerTransform: LayerTransform;
  /** Top-left of the backing raster in layer-local space. */
  rasterBounds?: { x: number; y: number };
}

// ─── CoordinateMapper ───────────────────────────────────────────────────────

export class CoordinateMapper {
  private tx: number;
  private ty: number;
  private rx: number;
  private ry: number;
  /** Forward affine matrix (layer→doc for the translation+raster part). */
  private matrix: AffineMatrix | undefined;
  /** Inverse matrix for doc→layer. Computed lazily. */
  private inverseMatrix: AffineMatrix | undefined;

  constructor(config: CoordinateMapperConfig) {
    const t = config.layerTransform;
    if (isAffineTransform(t)) {
      this.tx = t.x;
      this.ty = t.y;
      // Only store a non-identity matrix; pure translation uses fast path.
      if (t.scaleX !== 1 || t.scaleY !== 1 || t.rotation !== 0) {
        this.matrix = affineToMatrix(t);
      }
    } else {
      this.tx = 0;
      this.ty = 0;
    }
    this.rx = config.rasterBounds?.x ?? 0;
    this.ry = config.rasterBounds?.y ?? 0;
  }

  /**
   * Compute the inverse of a 2D affine matrix.
   */
  private static invertMatrix(m: AffineMatrix): AffineMatrix {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12) {
      // Singular / near-singular matrix (e.g. zero scale); return identity so
      // callers get a no-op mapping instead of NaN/Infinity values.
      return [1, 0, 0, 1, 0, 0];
    }
    const invDet = 1 / det;
    return [
      d * invDet,
      -b * invDet,
      -c * invDet,
      a * invDet,
      (c * f - d * e) * invDet,
      (b * e - a * f) * invDet
    ];
  }

  /** Convert a document-space point to backing-raster coordinates. */
  docToLayer(pt: Point): Point {
    if (this.matrix) {
      if (!this.inverseMatrix) {
        this.inverseMatrix = CoordinateMapper.invertMatrix(this.matrix);
      }
      const [a, b, c, d, e, f] = this.inverseMatrix;
      return {
        x: a * pt.x + c * pt.y + e - this.rx,
        y: b * pt.x + d * pt.y + f - this.ry
      };
    }
    return {
      x: pt.x - this.tx - this.rx,
      y: pt.y - this.ty - this.ry
    };
  }

  /** Convert backing-raster coordinates to document-space coordinates. */
  layerToDoc(pt: Point): Point {
    if (this.matrix) {
      const [a, b, c, d, e, f] = this.matrix;
      const lx = pt.x + this.rx;
      const ly = pt.y + this.ry;
      return {
        x: a * lx + c * ly + e,
        y: b * lx + d * ly + f
      };
    }
    return {
      x: pt.x + this.tx + this.rx,
      y: pt.y + this.ty + this.ry
    };
  }

  /** Return the current document-space offset of the backing raster. */
  get offset(): Point {
    return { x: this.tx + this.rx, y: this.ty + this.ry };
  }

  /** True when the layer has a non-zero transform. */
  get hasOffset(): boolean {
    return this.tx !== 0 || this.ty !== 0 || this.rx !== 0 || this.ry !== 0;
  }

  /**
   * Shift a dirty rect from layer-space to document-space.
   *
   * When the layer has an affine matrix (rotation/scale), the four corners of
   * the layer-space dirty rect are transformed through the forward matrix and
   * then an axis-aligned bounding box is computed in document-space.  This
   * prevents under-invalidation that would occur if only translation offsets
   * were applied to a rotated/scaled layer.
   */
  dirtyToDoc(rect: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): { x: number; y: number; w: number; h: number } {
    if (this.matrix) {
      // Transform all four corners of the layer-space dirty rect through the
      // forward affine matrix, accounting for raster offset.
      const corners = [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.minX, y: rect.maxY },
        { x: rect.maxX, y: rect.maxY }
      ];

      let dMinX = Infinity;
      let dMinY = Infinity;
      let dMaxX = -Infinity;
      let dMaxY = -Infinity;

      for (const c of corners) {
        const docPt = this.layerToDoc(c);
        if (docPt.x < dMinX) { dMinX = docPt.x; }
        if (docPt.y < dMinY) { dMinY = docPt.y; }
        if (docPt.x > dMaxX) { dMaxX = docPt.x; }
        if (docPt.y > dMaxY) { dMaxY = docPt.y; }
      }

      return {
        x: Math.floor(dMinX),
        y: Math.floor(dMinY),
        w: Math.ceil(dMaxX - dMinX),
        h: Math.ceil(dMaxY - dMinY)
      };
    }

    // Translation-only fast path.
    return {
      x: rect.minX + this.tx + this.rx,
      y: rect.minY + this.ty + this.ry,
      w: rect.maxX - rect.minX,
      h: rect.maxY - rect.minY
    };
  }
}
