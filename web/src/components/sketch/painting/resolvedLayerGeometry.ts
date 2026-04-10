/**
 * resolvedLayerGeometry – Shared geometry seam for transformed layers.
 *
 * One place to answer:
 *   - Effective raster bounds in layer-local space
 *   - Composite offset in document space (translation + raster origin)
 *   - Transformed document-space extents (the bounding box of the
 *     scale/rotation-applied raster in document coordinates)
 *   - Visual bounds for gizmos and hit targets
 *
 * After this module lands, tools and overlays should stop recomputing
 * transformed layer extents locally except for trivial presentation-only
 * offsets (e.g. gizmo DPR scaling).
 *
 * Design invariants:
 *   - All geometry queries start from the stored `layer.transform` and
 *     `layer.contentBounds`.  Preview transforms flow through the same
 *     functions by passing the preview transform in place of the stored one.
 *   - Results are in document space unless otherwise noted.
 *   - The module does NOT read from React state, mutable refs, or globals.
 *     Callers pass the data they need.
 *
 * @module painting/resolvedLayerGeometry
 */

import type {
  LayerTransform,
  LayerContentBounds,
  Layer,
  AffineMatrix
} from "../types";
import { composeAffineMatrix } from "../types";
import type { Point } from "../types/geometry";

// ─── Effective raster bounds ─────────────────────────────────────────────────

/**
 * Effective raster bounds of a layer in layer-local space.
 *
 * Prefers the layer canvas dimensions when available (they may be larger
 * than `contentBounds` after a paint stroke expanded the raster), falls
 * back to `layer.contentBounds`, then to the document canvas size.
 */
export function getEffectiveRasterBounds(
  layer: { contentBounds: LayerContentBounds },
  layerCanvas?: HTMLCanvasElement | null,
  fallbackSize?: { width: number; height: number }
): LayerContentBounds {
  if (layerCanvas && layerCanvas.width > 0 && layerCanvas.height > 0) {
    // Check for stored raster bounds on the canvas (set by ensureLayerRasterBounds)
    const stored = (layerCanvas as { __nodetoolRasterBounds?: LayerContentBounds }).__nodetoolRasterBounds;
    if (stored) {
      return stored;
    }
    return {
      x: layer.contentBounds.x,
      y: layer.contentBounds.y,
      width: layerCanvas.width,
      height: layerCanvas.height
    };
  }
  const cb = layer.contentBounds;
  return {
    x: cb.x,
    y: cb.y,
    width: cb.width > 0 ? cb.width : (fallbackSize?.width ?? 1),
    height: cb.height > 0 ? cb.height : (fallbackSize?.height ?? 1)
  };
}

// ─── Resolved gizmo bounds ───────────────────────────────────────────────────

/**
 * Resolve the bounds used for gizmo sizing and handle placement.
 *
 * This is the single explicit contract for how both MoveTool and TransformTool
 * determine visual bounds. The rule:
 *   1. Start from the effective raster bounds (real canvas size, handles
 *      off-canvas content correctly).
 *   2. If the layer's contentBounds are *strictly smaller* in both dimensions
 *      and represent real content (both > 0), use contentBounds instead so
 *      small layers get a tight gizmo rather than a full-canvas outline.
 *   3. Never fall back to document size — callers must provide the layer canvas
 *      or explicit fallback.
 *
 * Both tools, gizmo painters, and hit-test helpers should call this instead of
 * computing their own bounds mix.
 */
export function resolveGizmoBounds(
  layer: { contentBounds: LayerContentBounds },
  layerCanvas?: HTMLCanvasElement | null,
  fallbackSize?: { width: number; height: number }
): LayerContentBounds {
  const rasterBounds = getEffectiveRasterBounds(layer, layerCanvas, fallbackSize);
  const cb = layer.contentBounds;
  // Use contentBounds only when they are strictly smaller in both dimensions
  // and represent actual content (non-zero area). This keeps small layers
  // (e.g. a 50×50 stamp on a 512×512 canvas) with a tight gizmo while
  // layers that fill or exceed the canvas use the full raster bounds.
  if (
    cb.width > 0 &&
    cb.height > 0 &&
    cb.width < rasterBounds.width &&
    cb.height < rasterBounds.height
  ) {
    return { ...cb };
  }
  return rasterBounds;
}

// ─── Composite offset ────────────────────────────────────────────────────────

/**
 * Compute the document-space offset where a layer's top-left raster pixel
 * is drawn during compositing.
 *
 * This combines the layer translation (`transform.x/y`) with the raster
 * origin (`contentBounds.x/y`).  Scale and rotation do NOT affect this
 * offset — they are applied around the raster center during drawing.
 */
export function getCompositeOffset(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Point {
  return {
    x: transform.x + rasterBounds.x,
    y: transform.y + rasterBounds.y
  };
}

// ─── Transformed document-space extents ──────────────────────────────────────

/**
 * Axis-aligned bounding box of a layer after applying its full transform
 * (translation + scale + rotation) in document space.
 *
 * This is the bounding rectangle that the transformed raster occupies on
 * the canvas and is used for:
 *   - Gizmo outline drawing
 *   - Hit testing
 *   - Selection/marquee alignment
 *   - Compositing clipping (future dirty-rect optimisation)
 *
 * @param transform   Layer transform (may be a preview transform).
 * @param rasterBounds  Effective raster bounds in layer-local space.
 * @returns Axis-aligned bounding box in document space.
 */
export interface DocumentExtents {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getTransformedExtents(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): DocumentExtents {
  const sx = transform.scaleX ?? 1;
  const sy = transform.scaleY ?? 1;
  const rot = transform.rotation ?? 0;

  // Raster center in document space
  const cx = transform.x + rasterBounds.x + rasterBounds.width / 2;
  const cy = transform.y + rasterBounds.y + rasterBounds.height / 2;

  // Scaled half-extents
  const hw = (rasterBounds.width * sx) / 2;
  const hh = (rasterBounds.height * sy) / 2;

  if (rot === 0) {
    // Fast path: axis-aligned
    return {
      x: cx - hw,
      y: cy - hh,
      width: hw * 2,
      height: hh * 2
    };
  }

  // Rotate the four corners of the scaled rect around the center
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corners: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const rx = cx + c.x * cos - c.y * sin;
    const ry = cy + c.x * sin + c.y * cos;
    if (rx < minX) { minX = rx; }
    if (ry < minY) { minY = ry; }
    if (rx > maxX) { maxX = rx; }
    if (ry > maxY) { maxY = ry; }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// ─── Visual bounds (gizmo/hit-target corners) ────────────────────────────────

/**
 * Compute the four corners of the transformed layer rectangle in document
 * space. Used by gizmo drawing and precise hit testing (not just AABB).
 *
 * Returns corners in order: top-left, top-right, bottom-right, bottom-left.
 */
export function getTransformedCorners(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): [Point, Point, Point, Point] {
  const sx = transform.scaleX ?? 1;
  const sy = transform.scaleY ?? 1;
  const rot = transform.rotation ?? 0;

  const cx = transform.x + rasterBounds.x + rasterBounds.width / 2;
  const cy = transform.y + rasterBounds.y + rasterBounds.height / 2;

  const hw = (rasterBounds.width * sx) / 2;
  const hh = (rasterBounds.height * sy) / 2;

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const rotate = (lx: number, ly: number): Point => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos
  });

  return [
    rotate(-hw, -hh), // top-left
    rotate(hw, -hh),  // top-right
    rotate(hw, hh),   // bottom-right
    rotate(-hw, hh)   // bottom-left
  ];
}

/**
 * Compute the center point of a transformed layer in document space.
 */
export function getTransformedCenter(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Point {
  return {
    x: transform.x + rasterBounds.x + rasterBounds.width / 2,
    y: transform.y + rasterBounds.y + rasterBounds.height / 2
  };
}

// ─── Full resolved geometry bundle ──────────────────────────────────────────

/**
 * All geometry data for a resolved layer, computed once and shared by
 * compositing, gizmos, overlays, and hit testing.
 */
export interface ResolvedLayerGeometry {
  /** Effective raster bounds in layer-local space. */
  rasterBounds: LayerContentBounds;
  /** Document-space offset for compositing (transform.xy + bounds.xy). */
  compositeOffset: Point;
  /** Axis-aligned bounding box of the transformed raster in document space. */
  extents: DocumentExtents;
  /** Four corners of the transformed rectangle in document space. */
  corners: [Point, Point, Point, Point];
  /** Center of the transformed rectangle in document space. */
  center: Point;
}

/**
 * Resolve all geometry for a layer in one call.
 *
 * @param layer          The layer (or a layer with a preview transform applied).
 * @param layerCanvas    Optional layer canvas for raster size lookup.
 * @param fallbackSize   Fallback dimensions when canvas and contentBounds are empty.
 */
export function resolveLayerGeometry(
  layer: { transform: LayerTransform; contentBounds: LayerContentBounds },
  layerCanvas?: HTMLCanvasElement | null,
  fallbackSize?: { width: number; height: number }
): ResolvedLayerGeometry {
  const rasterBounds = getEffectiveRasterBounds(layer, layerCanvas, fallbackSize);
  const compositeOffset = getCompositeOffset(layer.transform, rasterBounds);
  const extents = getTransformedExtents(layer.transform, rasterBounds);
  const corners = getTransformedCorners(layer.transform, rasterBounds);
  const center = getTransformedCenter(layer.transform, rasterBounds);
  return { rasterBounds, compositeOffset, extents, corners, center };
}

/**
 * Build the affine matrix for a layer transform. Convenience wrapper around
 * `composeAffineMatrix` that handles defaulting optional fields.
 */
export function buildLayerMatrix(transform: LayerTransform): AffineMatrix {
  return composeAffineMatrix(
    transform.x,
    transform.y,
    transform.scaleX ?? 1,
    transform.scaleY ?? 1,
    transform.rotation ?? 0
  );
}
