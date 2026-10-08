/**
 * Snapping shared by the tools: collects the lines a drag can snap to from
 * the live editor state, converts the screen-space threshold to document
 * pixels, and publishes the lines a drag snapped to so the guides overlay
 * draws them as smart guides.
 */

import type { ToolContext } from "../tools/types";
import { isLayerCompositeVisible } from "../types";
import {
  getVisualBounds,
  computeTransformedExtents
} from "../transform/geometry/layerGeometry";
import { useSketchStore } from "../state/useSketchStore";
import type { Point } from "../types";
import {
  SNAP_THRESHOLD_SCREEN_PX,
  buildSnapTargets,
  snapMoveDelta,
  snapPoint,
  type SnapLines,
  type SnapRect,
  type SnapTargets
} from "./moveSnap";

/** Whether snapping is switched on (View menu, Ctrl+Shift+;). */
export function isSnapEnabled(): boolean {
  return useSketchStore.getState().snapEnabled;
}

/** The snap distance in document pixels at the current zoom. */
export function snapThreshold(zoom: number): number {
  return SNAP_THRESHOLD_SCREEN_PX / Math.max(zoom, 1e-6);
}

/** A layer's visible extents in document space, or null for groups. */
export function layerExtents(ctx: ToolContext, layerId: string): SnapRect | null {
  const { doc } = ctx;
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer || layer.type === "group") {
    return null;
  }
  const canvas = ctx.layerCanvasesRef.current.get(layerId);
  return computeTransformedExtents(
    layer.transform,
    getVisualBounds(layer, canvas, doc.canvas)
  );
}

/**
 * Target lines: canvas edges and center, visible guides, and the edges and
 * centers of visible layers other than `excludeLayerIds`. Read once when a
 * drag starts, not on every pointer move.
 */
export function collectSnapTargets(
  ctx: ToolContext,
  excludeLayerIds: ReadonlySet<string>
): SnapTargets {
  const { doc } = ctx;
  const { isolatedLayerId, guidesVisible } = useSketchStore.getState();
  const others: SnapRect[] = [];
  for (const layer of doc.layers) {
    if (
      excludeLayerIds.has(layer.id) ||
      layer.type === "group" ||
      layer.type === "mask" ||
      !isLayerCompositeVisible(doc.layers, layer, isolatedLayerId)
    ) {
      continue;
    }
    const r = layerExtents(ctx, layer.id);
    if (r) {
      others.push(r);
    }
  }
  return buildSnapTargets(
    doc.canvas,
    guidesVisible ? (doc.guides ?? []) : [],
    others
  );
}

/** Show the lines a drag snapped to, or clear them with `null`. */
export function showSnapLines(lines: SnapLines | null): void {
  useSketchStore.getState().setActiveSnapLines(lines);
}

/**
 * Snapping for one drag: a drawn rectangle's corners, a dragged handle's
 * edges, or a moved rectangle. Shows the lines the drag lands on. Targets
 * are read on `begin`, and every method is a no-op while snapping is off.
 */
export class DragSnapSession {
  private targets: SnapTargets | null = null;

  begin(ctx: ToolContext, excludeLayerIds: ReadonlySet<string> = new Set()): void {
    this.targets = isSnapEnabled() ? collectSnapTargets(ctx, excludeLayerIds) : null;
  }

  /** Snap a point on both axes. */
  snap(ctx: ToolContext, point: Point): Point {
    if (!this.targets) {
      return point;
    }
    const snapped = snapPoint(point, this.targets, snapThreshold(ctx.zoom));
    showSnapLines(snapped.lines);
    return { x: snapped.x, y: snapped.y };
  }

  /** Snap the edges a handle moves. A `null` axis is left alone. */
  snapEdges(
    ctx: ToolContext,
    x: number | null,
    y: number | null
  ): { x: number | null; y: number | null } {
    if (!this.targets) {
      return { x, y };
    }
    const snapped = snapPoint({ x: x ?? 0, y: y ?? 0 }, this.targets, snapThreshold(ctx.zoom));
    const lines = {
      x: x === null ? null : snapped.lines.x,
      y: y === null ? null : snapped.lines.y
    };
    showSnapLines(lines);
    return { x: x === null ? null : snapped.x, y: y === null ? null : snapped.y };
  }

  /** Snap a moved rectangle's edges and center, adjusting the drag delta. */
  snapRectDelta(
    ctx: ToolContext,
    rect: SnapRect,
    dx: number,
    dy: number
  ): { dx: number; dy: number } {
    if (!this.targets) {
      return { dx, dy };
    }
    const snapped = snapMoveDelta(rect, dx, dy, this.targets, snapThreshold(ctx.zoom));
    showSnapLines({ x: snapped.snappedX, y: snapped.snappedY });
    return { dx: snapped.dx, dy: snapped.dy };
  }

  end(): void {
    if (this.targets) {
      showSnapLines(null);
    }
    this.targets = null;
  }
}
