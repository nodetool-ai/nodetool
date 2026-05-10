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
import { isQuadTransformMode } from "../../types";
import type { TransformHandle } from "./handleGeometry";
import {
  getTransformedCenter,
  getTransformedCorners
} from "../../painting/resolvedLayerGeometry";
import { docToScreen, scaledHalfExtents } from "./handleGeometry";
import { drawTransformGizmo } from "../gizmo";

function getVisibleHandles(
  transform: LayerTransform
): readonly TransformHandle[] {
  if (transform.mode === "distort") {
    return [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "rotate"
    ];
  }
  if (transform.mode === "skew") {
    return ["top", "bottom", "left", "right", "rotate"];
  }
  if (transform.mode === "warp") {
    return [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "rotate"
    ];
  }
  if (transform.mode === "perspective") {
    return [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "rotate"
    ];
  }
  return [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "top",
    "bottom",
    "left",
    "right",
    "rotate"
  ];
}

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
    const visibleHandles = getVisibleHandles(transform);
    const rot = transform.rotation ?? 0;
    const center = getTransformedCenter(transform, rasterBounds);

    if (
      (transform.matrix && transform.mode && !isQuadTransformMode(transform.mode)) ||
      (isQuadTransformMode(transform.mode) && transform.quad)
    ) {
      const corners = getTransformedCorners(transform, rasterBounds);
      const screenCorners = corners.map((corner) =>
        docToScreen(
          corner.x,
          corner.y,
          ctx.doc.canvas.width,
          ctx.doc.canvas.height,
          ctx.zoom,
          ctx.pan,
          containerW,
          containerH,
          dpr
        )
      ) as [Point, Point, Point, Point];
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
        gc,
        screenCenter,
        null,
        null,
        null,
        activeOrHoveredHandle,
        dpr,
        pivotScreenPos,
        screenCorners,
        visibleHandles
      );
      return;
    }

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
      gc,
      screenCenter,
      screenW,
      screenH,
      rot,
      activeOrHoveredHandle,
      dpr,
      pivotScreenPos,
      null,
      visibleHandles
    );
  });
}

/**
 * Manages batched gizmo redraws via requestAnimationFrame to avoid
 * redundant per-pointer-event paints.
 */
export class GizmoRedrawScheduler {
  private scheduled = false;
  private rafId: number | null = null;
  /** Incremented on cancel so a late/stale rAF closure never runs after `cancelPending`. */
  private callbackGeneration = 0;

  /**
   * Schedule a gizmo redraw on the next animation frame.
   * If a redraw is already scheduled, this is a no-op.
   */
  scheduleRedraw(callback: () => void): void {
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    const generation = this.callbackGeneration;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.scheduled = false;
      if (generation !== this.callbackGeneration) {
        return;
      }
      callback();
    });
  }

  /**
   * Drop any pending redraw (e.g. pointer-up must not let a stale rAF callback
   * run after commit — it would sync from a pre-render `ctx.doc` and repaint
   * the gizmo at the old transform until the next viewport change).
   */
  cancelPending(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.scheduled = false;
    this.callbackGeneration += 1;
  }

  /** Whether a redraw is currently scheduled. */
  get isScheduled(): boolean {
    return this.scheduled;
  }
}
