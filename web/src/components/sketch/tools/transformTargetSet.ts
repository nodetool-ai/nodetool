/**
 * transformTargetSet – Manages the set of layers targeted for transform.
 *
 * The transform-target set is **separate** from the layers-panel multi-select
 * (`selectedLayerIds` in the UI slice). This is intentional: layers-panel
 * selection is a general-purpose UI concept, while the transform-target set
 * is a tool-specific concept for "which layers should this transform gesture
 * affect?"
 *
 * Design:
 *   - The target set is owned by the TransformTool instance (not global state).
 *   - When auto-select is enabled, clicking opaque pixels targets the topmost
 *     visible transformable layer.
 *   - Shift+click adds/removes layers from the target set.
 *   - The gizmo, hit-test, and preview all use the union bounds of the
 *     target set as a single shared bounds source.
 *
 * @module tools/transformTargetSet
 */

import type { Layer, LayerContentBounds, LayerTransform, Point } from "../types";
import { isLayerCompositeVisible, layerAllowsTransformWhilePixelLocked } from "../types";
import { hitTestLayerAtDocPoint } from "../painting/sampleDocument";
import { resolveGizmoBounds } from "../painting/resolvedLayerGeometry";
import { getTransformedExtents } from "../painting/resolvedLayerGeometry";

// ─── Target set ──────────────────────────────────────────────────────────────

export interface TransformTargetEntry {
  layerId: string;
  /** Resolved gizmo bounds for this layer (layer-local space). */
  bounds: LayerContentBounds;
}

/**
 * Mutable target set held by the TransformTool.
 */
export class TransformTargetSet {
  private entries: TransformTargetEntry[] = [];

  /** Current target entries (read-only view). */
  getEntries(): readonly TransformTargetEntry[] {
    return this.entries;
  }

  /** All targeted layer IDs. */
  getIds(): string[] {
    return this.entries.map((e) => e.layerId);
  }

  /** Number of targeted layers. */
  get size(): number {
    return this.entries.length;
  }

  /** Whether a specific layer is in the target set. */
  has(layerId: string): boolean {
    return this.entries.some((e) => e.layerId === layerId);
  }

  /** Replace the entire target set with a single layer. */
  setSingle(layerId: string, bounds: LayerContentBounds): void {
    this.entries = [{ layerId, bounds }];
  }

  /** Add a layer to the target set if not already present. */
  add(layerId: string, bounds: LayerContentBounds): void {
    if (!this.has(layerId)) {
      this.entries.push({ layerId, bounds });
    }
  }

  /** Remove a layer from the target set. */
  remove(layerId: string): void {
    this.entries = this.entries.filter((e) => e.layerId !== layerId);
  }

  /** Toggle a layer in the target set (add if absent, remove if present). */
  toggle(layerId: string, bounds: LayerContentBounds): void {
    if (this.has(layerId)) {
      this.remove(layerId);
    } else {
      this.add(layerId, bounds);
    }
  }

  /** Clear all targets. */
  clear(): void {
    this.entries = [];
  }

  /**
   * Compute the union bounds of all targeted layers in document space.
   * Uses each layer's transform to compute the axis-aligned bounding box
   * of the transformed raster, then unions them.
   *
   * @param getLayerTransform  Callback to look up the current transform for
   *                           a given layer ID (may be a preview transform).
   * @returns The union bounds in document space, or null if the set is empty.
   */
  computeUnionExtents(
    getLayerTransform: (layerId: string) => LayerTransform
  ): LayerContentBounds | null {
    if (this.entries.length === 0) {
      return null;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const entry of this.entries) {
      const transform = getLayerTransform(entry.layerId);
      const extents = getTransformedExtents(transform, entry.bounds);
      const ex = extents.x;
      const ey = extents.y;
      const ew = extents.x + extents.width;
      const eh = extents.y + extents.height;
      if (ex < minX) { minX = ex; }
      if (ey < minY) { minY = ey; }
      if (ew > maxX) { maxX = ew; }
      if (eh > maxY) { maxY = eh; }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Compute the union of raster bounds (layer-local space) for single-layer
   * gizmo sizing. When only one layer is targeted, returns that layer's bounds
   * directly. When multiple are targeted, uses the union of resolved gizmo
   * bounds.
   */
  computeUnionRasterBounds(): LayerContentBounds | null {
    if (this.entries.length === 0) {
      return null;
    }
    if (this.entries.length === 1) {
      return { ...this.entries[0].bounds };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const entry of this.entries) {
      const b = entry.bounds;
      if (b.x < minX) { minX = b.x; }
      if (b.y < minY) { minY = b.y; }
      if (b.x + b.width > maxX) { maxX = b.x + b.width; }
      if (b.y + b.height > maxY) { maxY = b.y + b.height; }
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}

// ─── Layer picking ───────────────────────────────────────────────────────────

/**
 * Find the topmost visible transformable layer with an opaque pixel at the
 * given document-space point.
 *
 * Walks the layer stack from top to bottom (highest index first) and
 * returns the first layer that:
 *   - Is visible in the composite (respects isolation, parent visibility)
 *   - Is not fully locked (or is locked with an imageReference, allowing transform)
 *   - Has a non-transparent pixel at the click point
 *
 * @param layers         All layers in the document.
 * @param layerCanvases  Map of layer ID → canvas element.
 * @param docPoint       Click point in document space.
 * @param isolatedLayerId  Currently isolated layer (for visibility check).
 * @returns The picked layer, or null if no hit.
 */
export function pickTopmostTransformableLayer(
  layers: Layer[],
  layerCanvases: Map<string, HTMLCanvasElement>,
  docPoint: Point,
  isolatedLayerId: string | null | undefined
): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    // Skip invisible layers
    if (!isLayerCompositeVisible(layers, layer, isolatedLayerId)) {
      continue;
    }
    // Skip fully locked layers (but allow locked image-reference layers)
    if (layer.locked && !layerAllowsTransformWhilePixelLocked(layer)) {
      continue;
    }
    // Skip group layers (they don't have raster content)
    if (layer.type === "group") {
      continue;
    }
    const layerCanvas = layerCanvases.get(layer.id);
    if (!layerCanvas) {
      continue;
    }
    if (hitTestLayerAtDocPoint(layer, layerCanvas, docPoint)) {
      return layer;
    }
  }
  return null;
}

/**
 * Resolve the gizmo bounds for a layer and create a target entry.
 */
export function resolveTargetEntry(
  layer: Layer,
  layerCanvas: HTMLCanvasElement | undefined | null,
  fallbackSize: { width: number; height: number }
): TransformTargetEntry {
  const bounds = resolveGizmoBounds(layer, layerCanvas, fallbackSize);
  return { layerId: layer.id, bounds };
}
