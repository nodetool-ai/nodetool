/**
 * Sketch Editor — Layer Geometry (canonical bounds & corners)
 *
 * One module, one return shape, one rule per bounds concept. Replaces the
 * eight overlapping bounds helpers that previously lived in `painting/`:
 *   - `getEffectiveRasterBounds`, `getEffectiveLayerRasterBounds`,
 *     `getLayerRasterBounds`, `getCanvasRasterBounds`,
 *     `resolveGizmoBounds`, `getCompositeOffset`,
 *     `getTransformedExtents`, `getTransformedCorners`,
 *     `getTransformedCenter`, `resolveLayerGeometry`, `buildLayerMatrix`,
 *     `getLayerCompositeOffset`, `getLayerGizmoBounds`.
 *
 * Two **distinct** bounds concepts intentionally remain (renderer vs. gizmo):
 *
 *   `getRasterBounds(layer, canvas?, fallback?)`
 *     The pixel allocation in layer-local space. Renderer / reconcile /
 *     hit-test / snapping use this. Single resolution rule:
 *       1. `canvas.__nodetoolRasterBounds` (set after a paint stroke).
 *       2. `canvas.{width,height}` paired with `layer.contentBounds.{x,y}`.
 *       3. `layer.contentBounds`.
 *       4. `fallback` (e.g. document size).
 *
 *   `getVisualBounds(layer, canvas?, fallback?)`
 *     Tight content bounds for the gizmo box. Same as raster bounds, then:
 *       - if `contentBounds` are strictly smaller in both dimensions, use them;
 *       - else opaque-pixel scan when the raster fills its allocation.
 *     Only the gizmo painter / overlay should call this.
 *
 *   `getLayerGeometry(layer, canvas?, fallback?)`
 *     Bundle of raster bounds + transformed corners / center / extents +
 *     composite offset, in document space. Computes everything once so callers
 *     don't recompute the same math four times per frame.
 */

import type {
  LayerContentBounds,
  LayerTransform,
  Quad
} from "../../types";
import type { Point, Rect } from "../../types/geometry";
import { computeLayerOpaquePixelBounds } from "../../painting/opaquePixelBounds";

// ─── Raster-bounds metadata stored on the canvas ─────────────────────────────

type RasterTaggedCanvas = HTMLCanvasElement & {
  __nodetoolRasterBounds?: LayerContentBounds;
};

/** Read raster bounds metadata stored on a layer canvas. */
export function getCanvasRasterBounds(
  canvas: HTMLCanvasElement | null | undefined
): LayerContentBounds | null {
  return (canvas as RasterTaggedCanvas | null | undefined)?.__nodetoolRasterBounds ?? null;
}

/** Store raster bounds metadata on a layer canvas. */
export function setCanvasRasterBounds(
  canvas: HTMLCanvasElement,
  bounds: LayerContentBounds
): void {
  (canvas as RasterTaggedCanvas).__nodetoolRasterBounds = bounds;
}

// ─── Single source of truth for layer-local raster bounds ────────────────────

interface LayerLike {
  contentBounds: LayerContentBounds;
}

interface FallbackSize {
  width: number;
  height: number;
}

/**
 * Layer-local raster bounds — the pixel allocation that the renderer reads.
 *
 * Resolution order (single rule, used by every renderer / hit-test caller):
 *   1. `canvas.__nodetoolRasterBounds` (authoritative after paint expansion).
 *   2. `{ contentBounds.x/y, canvas.width/height }` when canvas is allocated.
 *   3. `layer.contentBounds` when canvas is missing or zero-sized.
 *   4. `{ x: 0, y: 0, ...fallback }` as a final escape hatch.
 */
export function getRasterBounds(
  layer: LayerLike,
  canvas?: HTMLCanvasElement | null,
  fallback?: FallbackSize
): LayerContentBounds {
  const tagged = getCanvasRasterBounds(canvas);
  if (tagged) {
    return tagged;
  }
  const cb = layer.contentBounds;
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    return {
      x: cb.x,
      y: cb.y,
      width: canvas.width,
      height: canvas.height
    };
  }
  if (cb.width > 0 && cb.height > 0) {
    return { ...cb };
  }
  return {
    x: 0,
    y: 0,
    width: fallback?.width ?? 1,
    height: fallback?.height ?? 1
  };
}

/**
 * Tight visual bounds for the transform / move gizmo.
 *
 * Different rule from `getRasterBounds`: prefer `contentBounds` when strictly
 * smaller, then fall through to an opaque-pixel scan when the raster
 * allocation matches the contentBounds (i.e. fresh / canvas-sized layer).
 *
 * Only the gizmo painter / overlay should call this; the renderer always
 * wants the raster allocation, not the visual bounds.
 */
export function getVisualBounds(
  layer: LayerLike,
  canvas?: HTMLCanvasElement | null,
  fallback?: FallbackSize
): LayerContentBounds {
  const raster = getRasterBounds(layer, canvas, fallback);
  const cb = layer.contentBounds;
  if (
    cb.width > 0 &&
    cb.height > 0 &&
    cb.width < raster.width &&
    cb.height < raster.height
  ) {
    return { ...cb };
  }
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    const tagged = getCanvasRasterBounds(canvas) ?? undefined;
    const opaque = computeLayerOpaquePixelBounds(canvas, tagged);
    if (
      opaque &&
      (opaque.width < raster.width || opaque.height < raster.height)
    ) {
      return opaque;
    }
  }
  return raster;
}

// ─── Quad / AABB helpers (private) ───────────────────────────────────────────

function aabbOfQuad(quad: Quad): Rect {
  const xs = [quad[0].x, quad[1].x, quad[2].x, quad[3].x];
  const ys = [quad[0].y, quad[1].y, quad[2].y, quad[3].y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ─── Bundled geometry ────────────────────────────────────────────────────────

export interface LayerGeometry {
  /** Layer-local pixel allocation (for the renderer). */
  rasterBounds: LayerContentBounds;
  /** Document-space top-left where the raster's top-left pixel is drawn. */
  compositeOffset: Point;
  /** Document-space corners: top-left, top-right, bottom-right, bottom-left. */
  transformedCorners: [Point, Point, Point, Point];
  /** Document-space center of the transformed rectangle. */
  transformedCenter: Point;
  /** Document-space axis-aligned bounding box of the transformed corners. */
  transformedExtents: Rect;
}

/**
 * Resolve every geometry value for a layer in one call. Use this when you
 * need more than one of `rasterBounds` / corners / center / extents — it
 * computes all of them once and shares the intermediate raster bounds.
 *
 * For renderers that only need raster bounds, call `getRasterBounds` directly.
 * For gizmo painters that want tight visual bounds, call `getVisualBounds`.
 */
export function getLayerGeometry(
  layer: { transform: LayerTransform; contentBounds: LayerContentBounds },
  canvas?: HTMLCanvasElement | null,
  fallback?: FallbackSize
): LayerGeometry {
  const rasterBounds = getRasterBounds(layer, canvas, fallback);
  return {
    rasterBounds,
    compositeOffset: computeCompositeOffset(layer.transform, rasterBounds),
    transformedCorners: computeTransformedCorners(layer.transform, rasterBounds),
    transformedCenter: computeTransformedCenter(layer.transform, rasterBounds),
    transformedExtents: computeTransformedExtents(layer.transform, rasterBounds)
  };
}

// ─── Lower-level helpers (when you already have raster bounds) ───────────────

/** Document-space top-left where the raster is composited. */
export function computeCompositeOffset(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Point {
  switch (transform.kind) {
    case "affine":
      return {
        x: transform.x + rasterBounds.x,
        y: transform.y + rasterBounds.y
      };
    case "quad": {
      const aabb = aabbOfQuad(transform.quad);
      return { x: aabb.x, y: aabb.y };
    }
  }
}

/** Document-space corners of the transformed rectangle (TL, TR, BR, BL). */
export function computeTransformedCorners(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): [Point, Point, Point, Point] {
  if (transform.kind === "quad") {
    return [
      { ...transform.quad[0] },
      { ...transform.quad[1] },
      { ...transform.quad[2] },
      { ...transform.quad[3] }
    ];
  }
  const { scaleX, scaleY, rotation } = transform;
  const cx = transform.x + rasterBounds.x + rasterBounds.width / 2;
  const cy = transform.y + rasterBounds.y + rasterBounds.height / 2;
  const hw = (rasterBounds.width * scaleX) / 2;
  const hh = (rasterBounds.height * scaleY) / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rotate = (lx: number, ly: number): Point => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos
  });
  return [
    rotate(-hw, -hh),
    rotate(hw, -hh),
    rotate(hw, hh),
    rotate(-hw, hh)
  ];
}

/** Document-space center of the transformed rectangle. */
export function computeTransformedCenter(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Point {
  if (transform.kind === "quad") {
    const q = transform.quad;
    return {
      x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
      y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4
    };
  }
  return {
    x: transform.x + rasterBounds.x + rasterBounds.width / 2,
    y: transform.y + rasterBounds.y + rasterBounds.height / 2
  };
}

/** Document-space axis-aligned bounding box of the transformed rectangle. */
export function computeTransformedExtents(
  transform: LayerTransform,
  rasterBounds: LayerContentBounds
): Rect {
  if (transform.kind === "quad") {
    return aabbOfQuad(transform.quad);
  }
  if (transform.rotation === 0) {
    const cx = transform.x + rasterBounds.x + rasterBounds.width / 2;
    const cy = transform.y + rasterBounds.y + rasterBounds.height / 2;
    const hw = (rasterBounds.width * transform.scaleX) / 2;
    const hh = (rasterBounds.height * transform.scaleY) / 2;
    return { x: cx - hw, y: cy - hh, width: hw * 2, height: hh * 2 };
  }
  return aabbOfQuad(computeTransformedCorners(transform, rasterBounds));
}

// ─── Misc helpers used by the painting pipeline ──────────────────────────────

/** Inverse-transform the document viewport into layer-local space. */
export function getDocumentViewportInLayerSpace(
  layer: { transform: LayerTransform },
  doc: { canvas: { width: number; height: number } }
): Rect {
  const tx = layer.transform.kind === "affine" ? layer.transform.x : 0;
  const ty = layer.transform.kind === "affine" ? layer.transform.y : 0;
  return { x: -tx, y: -ty, width: doc.canvas.width, height: doc.canvas.height };
}

/** Geometric union of two rects, with `width >= 1` / `height >= 1`. */
export function unionLayerBounds(
  a: LayerContentBounds,
  b: LayerContentBounds
): LayerContentBounds {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}
