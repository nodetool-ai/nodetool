/**
 * transformTargetSet – Tracks transform targets (single layer or multi-layer union).
 *
 * Layers-panel multi-select seeds which raster/mask descendants participate when
 * the transform tool activates. Group layers expand to their transformable
 * descendants. Advanced per-layer modes (distort/skew/perspective/warp/quad) are
 * excluded from multi-target sets.
 *
 * Auto-pick under the pointer still retargets a single layer when only one target
 * is active; it is disabled while a multi-target session is in progress.
 *
 * @module tools/transformTargetSet
 */

import type {
  Layer,
  LayerContentBounds,
  LayerTransform,
  Point,
  SketchDocument
} from "../types";
import {
  getDescendantIds,
  isLayerCompositeVisible,
  isQuadTransformMode,
  layerAllowsTransformWhilePixelLocked
} from "../types";
import { hitTestLayerAtDocPoint } from "../painting/sampleDocument";
import {
  resolveGizmoBounds,
  getTransformedExtents
} from "../painting/resolvedLayerGeometry";

// ─── Target set ──────────────────────────────────────────────────────────────

export interface TransformTargetEntry {
  layerId: string;
  /** Resolved gizmo bounds for this layer (layer-local space). */
  bounds: LayerContentBounds;
}

/** True when the layer can participate in a multi-layer union transform. */
export function isMultiTransformEligibleLayer(layer: Layer): boolean {
  if (layer.type !== "raster" && layer.type !== "mask") {
    return false;
  }
  if (layer.locked && !layerAllowsTransformWhilePixelLocked(layer)) {
    return false;
  }
  const mode = layer.transform.mode;
  if (
    mode === "distort" ||
    mode === "skew" ||
    mode === "perspective" ||
    mode === "warp"
  ) {
    return false;
  }
  if (layer.transform.quad && isQuadTransformMode(mode)) {
    return false;
  }
  if (layer.transform.matrix && mode && !isQuadTransformMode(mode)) {
    return false;
  }
  return true;
}

/**
 * Resolve raster/mask layer IDs for the transform tool from panel selection +
 * active layer. Groups expand to eligible descendants. Order follows document
 * layer stack (bottom → top).
 */
export function resolveTransformTargetLayerIds(
  doc: SketchDocument,
  selectedLayerIds: readonly string[],
  activeLayerId: string | null | undefined
): string[] {
  let seeds: string[];
  if (selectedLayerIds.length >= 2) {
    seeds = [...selectedLayerIds];
  } else if (selectedLayerIds.length === 1) {
    seeds = [selectedLayerIds[0]!];
  } else if (activeLayerId) {
    seeds = [activeLayerId];
  } else {
    return [];
  }

  const expanded = new Set<string>();
  for (const id of seeds) {
    const layer = doc.layers.find((l) => l.id === id);
    if (!layer) {
      continue;
    }
    if (layer.type === "group") {
      for (const descId of getDescendantIds(doc.layers, id)) {
        const child = doc.layers.find((l) => l.id === descId);
        if (child && isMultiTransformEligibleLayer(child)) {
          expanded.add(descId);
        }
      }
    } else if (isMultiTransformEligibleLayer(layer)) {
      expanded.add(id);
    }
  }

  return doc.layers.filter((l) => expanded.has(l.id)).map((l) => l.id);
}

/**
 * Mutable target list held by the TransformTool (one or many layers).
 */
export class TransformTargetSet {
  private entries: TransformTargetEntry[] = [];

  /** Current target entries (read-only shallow copy). */
  getEntries(): readonly TransformTargetEntry[] {
    return this.entries.map((e) => ({
      layerId: e.layerId,
      bounds: { ...e.bounds }
    }));
  }

  /** All targeted layer IDs. */
  getIds(): string[] {
    return this.entries.map((e) => e.layerId);
  }

  /** Number of targeted layers. */
  get size(): number {
    return this.entries.length;
  }

  /** Whether the current targets include a specific layer. */
  has(layerId: string): boolean {
    return this.entries.some((e) => e.layerId === layerId);
  }

  /** Single-target accessor; null when empty or multi-target. */
  getEntry(): TransformTargetEntry | null {
    if (this.entries.length !== 1) {
      return null;
    }
    const e = this.entries[0]!;
    return { layerId: e.layerId, bounds: { ...e.bounds } };
  }

  /** Replace targets with exactly one layer. */
  setSingle(layerId: string, bounds: LayerContentBounds): void {
    this.entries = [{ layerId, bounds: { ...bounds } }];
  }

  /** Replace targets with an ordered list (typically stack order). */
  setTargets(entries: TransformTargetEntry[]): void {
    this.entries = entries.map((e) => ({
      layerId: e.layerId,
      bounds: { ...e.bounds }
    }));
  }

  clear(): void {
    this.entries = [];
  }

  /**
   * Union of targeted extents in document space (axis-aligned),
   * or null if empty.
   */
  computeTargetExtents(
    getLayerTransform: (layerId: string) => LayerTransform
  ): LayerContentBounds | null {
    if (this.entries.length === 0) {
      return null;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of this.entries) {
      const transform = getLayerTransform(e.layerId);
      const ext = getTransformedExtents(transform, e.bounds);
      minX = Math.min(minX, ext.x);
      minY = Math.min(minY, ext.y);
      maxX = Math.max(maxX, ext.x + ext.width);
      maxY = Math.max(maxY, ext.y + ext.height);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * First target raster bounds (layer-local), or null when empty.
   * Multi-target callers should use per-entry bounds instead.
   */
  getRasterBounds(): LayerContentBounds | null {
    const first = this.entries[0];
    return first ? { ...first.bounds } : null;
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
