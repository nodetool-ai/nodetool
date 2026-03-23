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
}

// ─── CoordinateMapper ───────────────────────────────────────────────────────

export class CoordinateMapper {
  private tx: number;
  private ty: number;

  constructor(config: CoordinateMapperConfig) {
    this.tx = config.layerTransform.x;
    this.ty = config.layerTransform.y;
  }

  /** Convert a document-space point to layer-local coordinates. */
  docToLayer(pt: Point): Point {
    return { x: pt.x - this.tx, y: pt.y - this.ty };
  }

  /** Convert a layer-local point to document-space coordinates. */
  layerToDoc(pt: Point): Point {
    return { x: pt.x + this.tx, y: pt.y + this.ty };
  }

  /** Return the current layer offset as a Point. */
  get offset(): Point {
    return { x: this.tx, y: this.ty };
  }

  /** True when the layer has a non-zero transform. */
  get hasOffset(): boolean {
    return this.tx !== 0 || this.ty !== 0;
  }

  /** Shift a dirty rect from layer-space to document-space. */
  dirtyToDoc(rect: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): { x: number; y: number; w: number; h: number } {
    return {
      x: rect.minX + this.tx,
      y: rect.minY + this.ty,
      w: rect.maxX - rect.minX,
      h: rect.maxY - rect.minY
    };
  }
}
