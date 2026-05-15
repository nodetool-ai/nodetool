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
import { isAffineTransform, isQuadTransform } from "../../types";
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
  // Free-form quads: 4 corners only — no rotate handle (rotation is
  // meaningless on a non-affine quad).
  if (isQuadTransform(transform)) {
    return ["top-left", "top-right", "bottom-left", "bottom-right"];
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
    const rot = isAffineTransform(transform) ? transform.rotation : 0;
    const center = getTransformedCenter(transform, rasterBounds);

    if (isQuadTransform(transform)) {
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
      // Pivot semantics for the renderer:
      //   `null`      → suppress the pivot crosshair entirely (quad-only
      //                  transforms have no meaningful pivot).
      //   `undefined` → render the default pivot at the box center.
      //   Point       → render at the explicit (custom) pivot.
      const pivotScreenPos: Point | null | undefined = isQuadTransform(transform)
        ? null
        : pivotDoc
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
          : undefined;

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

      // Dual-perspective: outline the secondary quad so the user can see
      // both planes. Per-handle editing of the second quad is intentionally
      // not wired here yet — this commit ships the renderer + visual
      // feedback; gesture editing of the second quad lands as a follow-up.
      if (transform.kind === "dual-quad") {
        const secondaryScreen = transform.secondaryQuad.map((corner) =>
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
        gc.save();
        gc.strokeStyle = "rgba(0, 153, 255, 0.85)";
        gc.lineWidth = Math.max(1, dpr);
        gc.setLineDash([6 * dpr, 4 * dpr]);
        gc.beginPath();
        gc.moveTo(secondaryScreen[0].x, secondaryScreen[0].y);
        gc.lineTo(secondaryScreen[1].x, secondaryScreen[1].y);
        gc.lineTo(secondaryScreen[2].x, secondaryScreen[2].y);
        gc.lineTo(secondaryScreen[3].x, secondaryScreen[3].y);
        gc.closePath();
        gc.stroke();
        gc.restore();
      }
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
    // `undefined` here renders the default pivot at the box center; an
    // explicit point renders at the user-set pivot. (Quad-only transforms
    // never reach this branch.)
    const pivotScreenPos: Point | undefined = pivotDoc
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
      : undefined;

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
