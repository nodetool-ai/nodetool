/**
 * SelectTool – all selection modes: rect, ellipse, lasso, lasso_polygon,
 * magic_wand, and selection move.
 *
 * Handles modifier keys for combine operations:
 *   Shift = add, Alt = subtract, Shift+Alt = intersect
 * Marquee modifiers (live during drag):
 *   Shift = constrain to square/circle, Alt = draw from center
 */

import type { ToolHandler, ToolContext, ToolPointerEvent, ToolDefinition } from "./types";
import type { Point, Selection } from "../types";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import {
  selectionHitTest,
  selectionHasAnyPixels,
  rectSelectionMask,
  ellipseSelectionMask,
  combineMasks,
  offsetSelectionByDocumentDelta,
  cloneSelectionMask,
  magicWandFromRgba,
  polygonToBinaryMask,
  marqueeAdjustedDocPoints,
  marqueeRectFromDocPoints,
  type SelectionCombineOp,
} from "../selection";

/** Require this much document-space delta before commit. */
const MARQUEE_MIN_DRAG_DOC_PX = 1;
/** Screen-space slop for detecting deliberate drag. */
const MARQUEE_DRAG_MIN_SCREEN_PX = 3;

function selectionCombineMode(shift: boolean, alt: boolean): SelectionCombineOp {
  if (shift && alt) {
    return "intersect";
  }
  if (shift) {
    return "add";
  }
  if (alt) {
    return "subtract";
  }
  return "replace";
}

export class SelectTool implements ToolHandler {
  readonly toolId = "select" as const;

  // Selection move state
  private isMovingSelection = false;
  private moveSelectionOrigin: Point | null = null;
  private selectionAtMoveStart: Selection | null = null;

  // Internal selection state (also synced to ctx refs when available)
  private selectStart: Point | null = null;
  private lassoPoints: Point[] = [];

  // Modifier capture at pointer-down for combine op
  private selectionDragModifiers: { shift: boolean; alt: boolean } | null = null;
  private marqueeCombineAtDown: { shift: boolean; alt: boolean } | null = null;

  // Marquee drag threshold
  private marqueeDocDragSeen = false;
  private marqueePointerDownClient: { x: number; y: number } | null = null;

  /** Clear in-progress polygon (called when selection is reset externally, e.g. Escape). */
  clearPolygon(): void {
    this.lassoPoints = [];
    this.selectionDragModifiers = null;
  }

  onDown(ctx: ToolContext, event: ToolPointerEvent): boolean | void {
    const pt = event.point;
    const { selection } = ctx;
    const { doc } = ctx;
    const cw = doc.canvas.width;
    const ch = doc.canvas.height;
    const mode = doc.toolSettings.select.mode;
    const selectStartRef = ctx.selectStartRef;
    const lassoPointsRef = ctx.lassoPointsRef;

    // lasso_polygon in progress? Don't check selection hit.
    const polygonInProgress =
      mode === "lasso_polygon" && this.lassoPoints.length > 0;

    // Check if clicking inside existing selection — start moving it
    if (
      mode !== "magic_wand" &&
      !polygonInProgress &&
      selection &&
      selectionHitTest(selection, pt.x, pt.y) &&
      !ctx.shiftHeldRef.current &&
      !ctx.altHeldRef.current
    ) {
      this.isMovingSelection = true;
      this.moveSelectionOrigin = pt;
      const cloned = cloneSelectionMask(selection);
      this.selectionAtMoveStart = cloned;
      if (ctx.selectionMoveAntsRef) {
        ctx.selectionMoveAntsRef.current = { start: cloned, dx: 0, dy: 0 };
      }
      return true;
    }

    // Magic wand: immediate selection
    if (mode === "magic_wand") {
      if (ctx.onSelectionChange) {
        const id = ctx.getFullCompositeImageData?.();
        if (id) {
          const bin = magicWandFromRgba(
            id,
            pt.x,
            pt.y,
            doc.toolSettings.select.magicWandTolerance
          );
          const overlay: Selection = { width: cw, height: ch, data: bin };
          const op = selectionCombineMode(
            ctx.shiftHeldRef.current,
            ctx.altHeldRef.current
          );
          const base = op === "replace" ? null : selection ?? null;
          ctx.onSelectionChange(combineMasks(base, overlay, op));
        }
      }
      return false;
    }

    // Lasso: start collecting freehand points
    if (mode === "lasso") {
      this.lassoPoints = [pt];
      if (lassoPointsRef) {
        lassoPointsRef.current = [pt];
      }
      this.selectStart = null;
      if (selectStartRef) {
        selectStartRef.current = null;
      }
      this.selectionDragModifiers = {
        shift: ctx.shiftHeldRef.current,
        alt: ctx.altHeldRef.current
      };
      if (!ctx.shiftHeldRef.current && !ctx.altHeldRef.current) {
        ctx.onSelectionChange?.(null);
      }
      return true;
    }

    // Lasso polygon: click to add vertices
    if (mode === "lasso_polygon") {
      this.selectStart = null;
      if (selectStartRef) {
        selectStartRef.current = null;
      }
      const isFirstVertex = this.lassoPoints.length === 0;
      if (isFirstVertex) {
        this.selectionDragModifiers = {
          shift: ctx.shiftHeldRef.current,
          alt: ctx.altHeldRef.current
        };
        if (!ctx.shiftHeldRef.current && !ctx.altHeldRef.current) {
          ctx.onSelectionChange?.(null);
        }
      }
      this.lassoPoints = [...this.lassoPoints, pt];
      if (lassoPointsRef) {
        lassoPointsRef.current = [...this.lassoPoints];
      }
      ctx.drawOverlayLassoPreview(this.lassoPoints, pt);
      // Don't set isDrawing — polygon is built over multiple clicks
      return false;
    }

    // Rectangle / Ellipse marquee
    this.selectStart = pt;
    if (selectStartRef) {
      selectStartRef.current = pt;
    }
    this.lassoPoints = [];
    if (lassoPointsRef) {
      lassoPointsRef.current = [];
    }
    this.marqueeDocDragSeen = false;
    this.marqueePointerDownClient = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY
    };
    this.marqueeCombineAtDown = {
      shift: ctx.shiftHeldRef.current,
      alt: ctx.altHeldRef.current
    };
    this.selectionDragModifiers = null;
    const marqueeOpAtDown = selectionCombineMode(
      this.marqueeCombineAtDown.shift,
      this.marqueeCombineAtDown.alt
    );
    if (marqueeOpAtDown === "replace") {
      ctx.onSelectionChange?.(null);
    }
    return true;
  }

  onMove(ctx: ToolContext, event: ToolPointerEvent, _coalescedPoints?: ToolPointerEvent[]): void {
    const pt = event.point;
    const { doc } = ctx;

    // Moving existing selection
    if (
      this.isMovingSelection &&
      this.moveSelectionOrigin &&
      this.selectionAtMoveStart
    ) {
      const dx = Math.round(pt.x - this.moveSelectionOrigin.x);
      const dy = Math.round(pt.y - this.moveSelectionOrigin.y);
      const start = this.selectionAtMoveStart;
      if (start && ctx.selectionMoveAntsRef) {
        ctx.selectionMoveAntsRef.current = { start, dx, dy };
        ctx.drawSelectionOverlay();
      }
      return;
    }

    // Lasso freehand drawing
    if (this.lassoPoints.length > 0) {
      const selectMode = doc.toolSettings.select.mode;
      if (selectMode === "lasso") {
        const pts = this.lassoPoints;
        const last = pts[pts.length - 1];
        if (!last || last.x !== pt.x || last.y !== pt.y) {
          pts.push(pt);
        }
        // Sync ref
        if (ctx.lassoPointsRef) {
          ctx.lassoPointsRef.current = pts;
        }
        ctx.drawOverlayLassoPreview(pts, pt);
        return;
      }
    }

    // Rectangle/ellipse marquee
    if (this.selectStart) {
      const sm = doc.toolSettings.select.mode;
      if (sm === "rectangle" || sm === "ellipse") {
        const anchor = this.selectStart;
        const downClient = this.marqueePointerDownClient;
        const screenDx = downClient ? event.nativeEvent.clientX - downClient.x : 0;
        const screenDy = downClient ? event.nativeEvent.clientY - downClient.y : 0;
        if (
          Math.abs(pt.x - anchor.x) >= MARQUEE_MIN_DRAG_DOC_PX ||
          Math.abs(pt.y - anchor.y) >= MARQUEE_MIN_DRAG_DOC_PX ||
          screenDx * screenDx + screenDy * screenDy >=
            MARQUEE_DRAG_MIN_SCREEN_PX * MARQUEE_DRAG_MIN_SCREEN_PX
        ) {
          this.marqueeDocDragSeen = true;
        }
        const { start, end } = marqueeAdjustedDocPoints(
          this.selectStart,
          pt,
          {
            fromCenter: ctx.altHeldRef.current,
            constrainSquare: ctx.shiftHeldRef.current
          }
        );
        ctx.drawOverlaySelection(start, end);
      } else {
        ctx.drawOverlaySelection(this.selectStart, pt);
      }
    }
  }

  onUp(ctx: ToolContext, _event?: ToolPointerEvent): void {
    const { doc, selection } = ctx;
    const selectStartRef = ctx.selectStartRef;
    const lassoPointsRef = ctx.lassoPointsRef;
    const cw = doc.canvas.width;
    const ch = doc.canvas.height;

    // Finalize selection movement
    if (this.isMovingSelection) {
      const ants = ctx.selectionMoveAntsRef?.current;
      const start = this.selectionAtMoveStart;
      if (start && ctx.onSelectionChange) {
        const dx = ants?.dx ?? 0;
        const dy = ants?.dy ?? 0;
        ctx.onSelectionChange(offsetSelectionByDocumentDelta(start, dx, dy));
      }
      if (ctx.selectionMoveAntsRef) {
        ctx.selectionMoveAntsRef.current = null;
      }
      this.isMovingSelection = false;
      this.moveSelectionOrigin = null;
      this.selectionAtMoveStart = null;
      ctx.drawSelectionOverlay();
      return;
    }

    // Lasso freehand: close shape and create mask
    if (this.lassoPoints.length > 0) {
      if (doc.toolSettings.select.mode === "lasso_polygon") {
        // Polygon mode: don't close on pointer up, only on double-click
        return;
      }
      const pt = ctx.screenToCanvas(
        ctx.mousePositionRef.current.x +
          (ctx.containerRef.current?.getBoundingClientRect().left ?? 0),
        ctx.mousePositionRef.current.y +
          (ctx.containerRef.current?.getBoundingClientRect().top ?? 0)
      );
      const pts = [...this.lassoPoints];
      this.lassoPoints = [];
      if (lassoPointsRef) {
        lassoPointsRef.current = [];
      }
      const last = pts[pts.length - 1];
      if (!last || last.x !== pt.x || last.y !== pt.y) {
        pts.push(pt);
      }
      // Clear the visual overlay immediately so the UI feels responsive,
      // then schedule the heavy mask generation on the next frame.
      ctx.clearOverlay();
      this.selectStart = null;
      if (selectStartRef) {
        selectStartRef.current = null;
      }
      const mod = this.selectionDragModifiers;
      this.selectionDragModifiers = null;
      if (pts.length >= 3 && ctx.onSelectionChange) {
        requestAnimationFrame(() => {
          const bin = polygonToBinaryMask(cw, ch, pts);
          const overlay: Selection = { width: cw, height: ch, data: bin };
          if (selectionHasAnyPixels(overlay)) {
            const op = selectionCombineMode(
              mod?.shift ?? false,
              mod?.alt ?? false
            );
            const base = op === "replace" ? null : selection ?? null;
            ctx.onSelectionChange!(combineMasks(base, overlay, op));
          }
          ctx.drawSelectionOverlay();
        });
      } else {
        ctx.drawSelectionOverlay();
      }
      return;
    }

    // Rectangle / Ellipse marquee
    if (this.selectStart) {
      const pt = ctx.screenToCanvas(
        ctx.mousePositionRef.current.x +
          (ctx.containerRef.current?.getBoundingClientRect().left ?? 0),
        ctx.mousePositionRef.current.y +
          (ctx.containerRef.current?.getBoundingClientRect().top ?? 0)
      );
      const selMode = doc.toolSettings.select.mode;
      const anchor = this.selectStart;
      const { start: mStart, end: mEnd } =
        selMode === "rectangle" || selMode === "ellipse"
          ? marqueeAdjustedDocPoints(anchor, pt, {
              fromCenter: ctx.altHeldRef.current,
              constrainSquare: ctx.shiftHeldRef.current
            })
          : { start: anchor, end: pt };
      const { x, y, w, h } = marqueeRectFromDocPoints(mStart, mEnd);
      // Clear visual overlay immediately for responsive UI feedback.
      ctx.clearOverlay();
      this.selectStart = null;
      if (selectStartRef) {
        selectStartRef.current = null;
      }
      const mc = this.marqueeCombineAtDown;
      this.marqueeCombineAtDown = null;
      const op: SelectionCombineOp = mc
        ? selectionCombineMode(mc.shift, mc.alt)
        : "replace";
      const isMarqueeShape =
        selMode === "rectangle" || selMode === "ellipse";
      const marqueeDragged = this.marqueeDocDragSeen;
      this.marqueeDocDragSeen = false;
      this.marqueePointerDownClient = null;
      if (
        w >= 1 &&
        h >= 1 &&
        ctx.onSelectionChange &&
        (!isMarqueeShape || marqueeDragged)
      ) {
        // Defer mask generation to the next frame so the browser can
        // paint the cleared overlay before doing the heavy computation.
        const capturedSelection = selection;
        requestAnimationFrame(() => {
          const overlay =
            selMode === "ellipse"
              ? ellipseSelectionMask(cw, ch, x, y, w, h)
              : rectSelectionMask(cw, ch, x, y, w, h);
          if (selectionHasAnyPixels(overlay)) {
            const base = op === "replace" ? null : capturedSelection ?? null;
            ctx.onSelectionChange!(combineMasks(base, overlay, op));
          }
          ctx.drawSelectionOverlay();
        });
      } else {
        ctx.drawSelectionOverlay();
      }
    }
  }

  // ── Polygon lasso: rubber-band preview on hover ──────────────────────

  onHoverMove(ctx: ToolContext, event: ToolPointerEvent): void {
    if (
      ctx.doc.toolSettings.select.mode === "lasso_polygon" &&
      this.lassoPoints.length > 0
    ) {
      ctx.drawOverlayLassoPreview(this.lassoPoints, event.point);
    }
  }

  // ── Polygon lasso: close polygon on double-click ────────────────────

  onDoubleClick(ctx: ToolContext, _point: Point): void {
    if (
      ctx.doc.toolSettings.select.mode !== "lasso_polygon" ||
      this.lassoPoints.length < 3
    ) {
      return;
    }
    const pts = [...this.lassoPoints];
    this.lassoPoints = [];
    if (ctx.lassoPointsRef) {
      ctx.lassoPointsRef.current = [];
    }
    ctx.clearOverlay();
    ctx.drawSelectionOverlay();
    const cw = ctx.doc.canvas.width;
    const ch = ctx.doc.canvas.height;
    if (ctx.onSelectionChange) {
      const bin = polygonToBinaryMask(cw, ch, pts);
      const overlay: Selection = { width: cw, height: ch, data: bin };
      if (selectionHasAnyPixels(overlay)) {
        const mod = this.selectionDragModifiers;
        this.selectionDragModifiers = null;
        const op = selectionCombineMode(
          mod?.shift ?? ctx.shiftHeldRef.current,
          mod?.alt ?? ctx.altHeldRef.current
        );
        const base = op === "replace" ? null : ctx.selection ?? null;
        ctx.onSelectionChange(combineMasks(base, overlay, op));
      }
    }
    this.selectionDragModifiers = null;
  }
}

export const definition: ToolDefinition = {
  tool: "select",
  label: "Select",
  Icon: SelectAllIcon,
  group: "painting"
};
