/**
 * transformTargetSet – Tracks the current single transform target.
 *
 * The transform-target set is **separate** from the layers-panel multi-select
 * (`selectedLayerIds` in the UI slice). This is intentional: layers-panel
 * selection is a general-purpose UI concept, while the transform-target set
 * is a tool-specific concept for "which layers should this transform gesture
 * affect?"
 *
 * Current tool behavior:
 *   - The target state is owned by the TransformTool instance (not global state).
 *   - Only one layer is transformable at a time.
 *   - When auto-select is enabled, clicking opaque pixels retargets the tool to
 *     the topmost visible transformable layer.
 *   - Shift+click follows the same single-target retargeting behavior; it does
 *     not build a multi-layer union gizmo.
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
 * Mutable single-target state held by the TransformTool.
 */
export class TransformTargetSet {
  private entry: TransformTargetEntry | null = null;

  /** Current target entries (read-only view). */
  getEntries(): readonly TransformTargetEntry[] {
    return this.entry ? [this.entry] : [];
  }

  /** All targeted layer IDs. */
  getIds(): string[] {
    return this.entry ? [this.entry.layerId] : [];
  }

  /** Number of targeted layers. */
  get size(): number {
    return this.entry ? 1 : 0;
  }

  /** Whether the current target matches a specific layer. */
  has(layerId: string): boolean {
    return this.entry?.layerId === layerId;
  }

  /** Current target entry, if any. */
  getEntry(): TransformTargetEntry | null {
    return this.entry ? { ...this.entry, bounds: { ...this.entry.bounds } } : null;
  }

  /** Replace the current target with a single layer. */
  setSingle(layerId: string, bounds: LayerContentBounds): void {
    this.entry = { layerId, bounds: { ...bounds } };
  }

  /** Clear the current target. */
  clear(): void {
    this.entry = null;
  }

  /**
   * Resolve the current target extents in document space.
   *
   * @param getLayerTransform  Callback to look up the current transform for
   *                           the targeted layer ID (may be a preview transform).
   * @returns The target bounds in document space, or null if no target exists.
   */
  computeTargetExtents(
    getLayerTransform: (layerId: string) => LayerTransform
  ): LayerContentBounds | null {
    if (!this.entry) {
      return null;
    }
    const transform = getLayerTransform(this.entry.layerId);
    return getTransformedExtents(transform, this.entry.bounds);
  }

  /**
   * Current target raster bounds (layer-local space) for gizmo sizing.
   */
  getRasterBounds(): LayerContentBounds | null {
    return this.entry ? { ...this.entry.bounds } : null;
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
