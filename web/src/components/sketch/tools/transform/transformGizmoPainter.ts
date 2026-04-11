/**
 * transformGizmoPainter – Gizmo paint and layout for the TransformTool.
 *
 * Separates gizmo rendering concerns from the interaction orchestration
 * in TransformTool.ts. The painter knows how to:
 *   - compute screen-space positions from layer geometry
 *   - call shared gizmo paint primitives
 *   - batch redraws via requestAnimationFrame
 *
 * This module does NOT own any interaction state (active handle, drag
 * position, modifier keys). The TransformTool passes those in as arguments.
 *
 * @module tools/transform/transformGizmoPainter
 */

import type { ToolContext } from "../types";
import type { LayerTransform, LayerContentBounds, Point } from "../../types";
import type { TransformHandle } from "./handleGeometry";
import { getTransformedCenter } from "../../painting/resolvedLayerGeometry";
import { docToScreen, scaledHalfExtents } from "./handleGeometry";
import { drawTransformGizmo } from "../gizmo";

/**
 * Paint the transform gizmo for a given layer state.
 *
 * @param ctx - The tool context (provides doc, zoom, pan, drawGizmo)
 * @param transform - The current (or live-preview) layer transform
 * @param rasterBounds - The layer's raster content bounds
 * @param activeOrHoveredHandle - Handle to highlight (active drag or hover)
 * @param pivotDoc - Optional pivot position in document space. When `null`
 *   or omitted the pivot crosshair is drawn at the box center (default).
 */
export function paintTransformGizmo(
  ctx: ToolContext,
  transform: LayerTransform,
  rasterBounds: LayerContentBounds,
  activeOrHoveredHandle: TransformHandle | null,
  pivotDoc?: Point | null
): void {
  ctx.drawGizmo((gc, dpr, containerW, containerH) => {
    const rot = transform.rotation ?? 0;
    const center = getTransformedCenter(transform, rasterBounds);
    const { hw, hh } = scaledHalfExtents(rasterBounds, transform);

    const screenCenter = docToScreen(
      center.x,
      center.y,
      ctx.doc.canvas.width,
      ctx.doc.canvas.height,
      ctx.zoom,
      ctx.pan,
      containerW,
      containerH,
      dpr
    );

    const screenW = hw * 2 * ctx.zoom * dpr;
    const screenH = hh * 2 * ctx.zoom * dpr;

    // Compute pivot screen position (default: center)
    const pivotScreenPos = pivotDoc
      ? docToScreen(
          pivotDoc.x,
          pivotDoc.y,
          ctx.doc.canvas.width,
          ctx.doc.canvas.height,
          ctx.zoom,
          ctx.pan,
          containerW,
          containerH,
          dpr
        )
      : null;

    drawTransformGizmo(
      gc, screenCenter, screenW, screenH, rot,
      activeOrHoveredHandle, dpr, pivotScreenPos
    );
  });
}

/**
 * Manages batched gizmo redraws via requestAnimationFrame to avoid
 * redundant per-pointer-event paints.
 */
export class GizmoRedrawScheduler {
  private scheduled = false;

  /**
   * Schedule a gizmo redraw on the next animation frame.
   * If a redraw is already scheduled, this is a no-op.
   */
  scheduleRedraw(callback: () => void): void {
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      callback();
    });
  }

  /** Whether a redraw is currently scheduled. */
  get isScheduled(): boolean {
    return this.scheduled;
  }
}
