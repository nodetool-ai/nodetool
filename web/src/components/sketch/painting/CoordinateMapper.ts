/**
 * CoordinateMapper — centralized document-space ↔ layer-space mapping.
 *
 * Provides a single place for all coordinate transformations that paint
 * tools need. Layers may have a non-zero transform (offset) from the
 * document origin after being moved with the MoveTool; this mapper
 * accounts for that offset so paint tools always operate in the correct
 * coordinate space.
 */

import type { Point, LayerTransform } from "../types";

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

  constructor(config: CoordinateMapperConfig) {
    this.tx = config.layerTransform.x;
    this.ty = config.layerTransform.y;
    this.rx = config.rasterBounds?.x ?? 0;
    this.ry = config.rasterBounds?.y ?? 0;
  }

  /** Convert a document-space point to backing-raster coordinates. */
  docToLayer(pt: Point): Point {
    return {
      x: pt.x - this.tx - this.rx,
      y: pt.y - this.ty - this.ry
    };
  }

  /** Convert backing-raster coordinates to document-space coordinates. */
  layerToDoc(pt: Point): Point {
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

  /** Shift a dirty rect from layer-space to document-space. */
  dirtyToDoc(rect: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): { x: number; y: number; w: number; h: number } {
    return {
      x: rect.minX + this.tx + this.rx,
      y: rect.minY + this.ty + this.ry,
      w: rect.maxX - rect.minX,
      h: rect.maxY - rect.minY
    };
  }
}
