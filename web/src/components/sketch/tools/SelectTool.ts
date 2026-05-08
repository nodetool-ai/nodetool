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
  rectSelectionMask,
  ellipseSelectionMask,
  offsetSelectionByDocumentDelta,
  cloneSelectionMask,
  polygonToBinaryMask,
  marqueeAdjustedDocPoints,
  marqueeRectFromDocPoints,
} from "../selection";
import { runMagicWandSelectionAsync } from "../selection/magicWandAsync";
import {
  selectionCombineMode,
  captureModifiers,
  type ModifierSnapshot
} from "./modifierIntent";
import {
  applySelectionFinalization,
  scheduleSelectionFinalization
} from "./selectionFinalization";
import { getLayerCompositeOffset } from "../painting/layerBounds";

/** Require this much document-space delta before commit. */
const MARQUEE_MIN_DRAG_DOC_PX = 1;
/** Screen-space slop for detecting deliberate drag. */
const MARQUEE_DRAG_MIN_SCREEN_PX = 3;

export class SelectTool implements ToolHandler {
  readonly toolId = "select" as const;

  // Selection move state
  private isMovingSelection = false;
  private moveSelectionOrigin: Point | null = null;
  private selectionAtMoveStart: Selection | null = null;
  private moveSelectionDx = 0;
  private moveSelectionDy = 0;

  // Internal selection state (also synced to ctx refs when available)
  private selectStart: Point | null = null;
  private lassoPoints: Point[] = [];

  // Modifier capture at pointer-down for combine op
  private selectionDragModifiers: ModifierSnapshot | null = null;
  private marqueeCombineAtDown: ModifierSnapshot | null = null;

  // Marquee drag threshold
  private marqueeDocDragSeen = false;
  private marqueePointerDownClient: { x: number; y: number } | null = null;

  // Deferred selection-clear timer (cancelled on tool switch / deactivate)
  private selectionClearTimer: ReturnType<typeof setTimeout> | null = null;
  private magicWandAbortController: AbortController | null = null;
  private magicWandRequestId = 0;

  /** Clear in-progress polygon (called when selection is reset externally, e.g. Escape). */
  clearPolygon(): void {
    this.lassoPoints = [];
    this.selectionDragModifiers = null;
  }

  /** Cancel any pending deferred selection clear. */
  private cancelDeferredClear(): void {
    if (this.selectionClearTimer !== null) {
      clearTimeout(this.selectionClearTimer);
      this.selectionClearTimer = null;
    }
  }

  private cancelPendingMagicWand(): void {
    this.magicWandRequestId++;
    if (this.magicWandAbortController) {
      this.magicWandAbortController.abort();
      this.magicWandAbortController = null;
    }
  }

  /** Schedule a deferred selection clear for responsive pointer-down. */
  private deferSelectionClear(ctx: ToolContext): void {
    this.cancelDeferredClear();
    this.selectionClearTimer = setTimeout(() => {
      this.selectionClearTimer = null;
      ctx.onSelectionChange?.(null);
    }, 0);
  }

  onDeactivate?(): void {
    this.cancelDeferredClear();
    this.cancelPendingMagicWand();
  }

  onCancel(): void {
    this.cancelPendingMagicWand();
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
      this.moveSelectionDx = 0;
      this.moveSelectionDy = 0;
      return true;
    }

    // Magic wand: defer heavy composite + flood-fill to next frame so the pointer stays responsive.
    if (mode === "magic_wand") {
      const onSelectionChange = ctx.onSelectionChange;
      if (!onSelectionChange) {
        return false;
      }
      this.cancelPendingMagicWand();
      const wandSettings = doc.toolSettings.select;
      const mods = captureModifiers(ctx.shiftHeldRef, ctx.altHeldRef);
      const requestId = ++this.magicWandRequestId;
      const abortController = new AbortController();
      this.magicWandAbortController = abortController;
      requestAnimationFrame(() => {
        if (
          requestId !== this.magicWandRequestId ||
          abortController.signal.aborted
        ) {
          return;
        }
        const tol = wandSettings.magicWandTolerance;

        if (wandSettings.sampleAllLayers) {
          // Composite sampling: pt is already in doc/pixel space, result is doc-sized.
          const id = ctx.getFullCompositeImageData?.() ?? null;
          if (!id) {
            return;
          }
          void runMagicWandSelectionAsync(
            {
              rgba: id.data,
              width: id.width,
              height: id.height,
              seedX: pt.x,
              seedY: pt.y,
              tolerance: tol,
              contiguous: wandSettings.contiguous
            },
            abortController.signal
          )
            .then((bin) => {
              if (
                requestId !== this.magicWandRequestId ||
                abortController.signal.aborted
              ) {
                return;
              }
              const overlay: Selection = { width: cw, height: ch, data: bin };
              applySelectionFinalization({
                overlay,
                modifiers: mods,
                runtime: ctx.runtime,
                currentSelection: selection,
                onSelectionChange,
                drawSelectionOverlay: ctx.drawSelectionOverlay
              });
            })
            .catch((error) => {
              if (error instanceof Error && error.name === "AbortError") {
                return;
              }
              console.error("Magic wand selection failed:", error);
            })
            .finally(() => {
              if (this.magicWandAbortController === abortController) {
                this.magicWandAbortController = null;
              }
            });
          return;
        }

        // Active-layer sampling: convert doc-space pt to canvas-local space.
        const activeLayer = doc.layers.find(l => l.id === doc.activeLayerId);
        const activeCanvas = ctx.layerCanvasesRef.current.get(doc.activeLayerId);
        if (!activeLayer || !activeCanvas) return;
        const offset = getLayerCompositeOffset(activeLayer, undefined, activeCanvas);
        const seedX = pt.x - offset.x;
        const seedY = pt.y - offset.y;
        const actx = activeCanvas.getContext("2d");
        if (!actx) {
          return;
        }
        const id = actx.getImageData(0, 0, activeCanvas.width, activeCanvas.height);
        void runMagicWandSelectionAsync(
          {
            rgba: id.data,
            width: id.width,
            height: id.height,
            seedX,
            seedY,
            tolerance: tol,
            contiguous: wandSettings.contiguous
          },
          abortController.signal
        )
          .then((bin) => {
            if (
              requestId !== this.magicWandRequestId ||
              abortController.signal.aborted
            ) {
              return;
            }
            // Overlay is layer-sized with origin set — combineMasks handles the placement.
            const overlay: Selection = {
              width: activeCanvas.width,
              height: activeCanvas.height,
              data: bin,
              originX: offset.x,
              originY: offset.y
            };
            applySelectionFinalization({
              overlay,
              modifiers: mods,
              runtime: ctx.runtime,
              currentSelection: selection,
              onSelectionChange,
              drawSelectionOverlay: ctx.drawSelectionOverlay
            });
          })
          .catch((error) => {
            if (error instanceof Error && error.name === "AbortError") {
              return;
            }
            console.error("Magic wand selection failed:", error);
          })
          .finally(() => {
            if (this.magicWandAbortController === abortController) {
              this.magicWandAbortController = null;
            }
          });
      });
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
      this.selectionDragModifiers = captureModifiers(ctx.shiftHeldRef, ctx.altHeldRef);
      if (!ctx.shiftHeldRef.current && !ctx.altHeldRef.current) {
        // Defer state update so the pointer-down returns immediately.
        this.deferSelectionClear(ctx);
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
        this.selectionDragModifiers = captureModifiers(ctx.shiftHeldRef, ctx.altHeldRef);
        if (!ctx.shiftHeldRef.current && !ctx.altHeldRef.current) {
          // Defer state update so the pointer-down returns immediately.
          this.deferSelectionClear(ctx);
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
    this.marqueeCombineAtDown = captureModifiers(ctx.shiftHeldRef, ctx.altHeldRef);
    this.selectionDragModifiers = null;
    const marqueeOpAtDown = selectionCombineMode(
      this.marqueeCombineAtDown.shift,
      this.marqueeCombineAtDown.alt
    );
    if (marqueeOpAtDown === "replace") {
      // Defer the state update so the pointer-down returns immediately.
      // The drawOverlaySelection call in onMove clears the overlay visually,
      // and the new selection replaces the old one on commit anyway.
      this.deferSelectionClear(ctx);
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
      this.moveSelectionDx = dx;
      this.moveSelectionDy = dy;
      const start = this.selectionAtMoveStart;
      ctx.setSelectionOriginOverride?.({
        x: (start.originX ?? 0) + dx,
        y: (start.originY ?? 0) + dy
      });
      ctx.requestRedraw();
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
      const start = this.selectionAtMoveStart;
      if (start && ctx.onSelectionChange) {
        ctx.onSelectionChange(offsetSelectionByDocumentDelta(start, this.moveSelectionDx, this.moveSelectionDy));
      }
      ctx.setSelectionOriginOverride?.(null);
      this.isMovingSelection = false;
      this.moveSelectionOrigin = null;
      this.selectionAtMoveStart = null;
      this.moveSelectionDx = 0;
      this.moveSelectionDy = 0;
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
        scheduleSelectionFinalization(
          () => {
            const bin = polygonToBinaryMask(cw, ch, pts);
            return { width: cw, height: ch, data: bin };
          },
          {
            modifiers: mod,
            runtime: ctx.runtime,
            currentSelection: selection,
            onSelectionChange: ctx.onSelectionChange!,
            drawSelectionOverlay: ctx.drawSelectionOverlay
          },
          ctx.clearOverlay
        );
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
        const capturedSelection = selection;
        scheduleSelectionFinalization(
          () =>
            selMode === "ellipse"
              ? ellipseSelectionMask(cw, ch, x, y, w, h)
              : rectSelectionMask(cw, ch, x, y, w, h),
          {
            modifiers: mc,
            runtime: ctx.runtime,
            currentSelection: capturedSelection,
            onSelectionChange: ctx.onSelectionChange!,
            drawSelectionOverlay: ctx.drawSelectionOverlay
          },
          ctx.clearOverlay
        );
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
      // For polygon, use captured modifiers from first vertex, falling back to
      // live modifier state for backwards compatibility.
      const mod = this.selectionDragModifiers ?? captureModifiers(ctx.shiftHeldRef, ctx.altHeldRef);
      this.selectionDragModifiers = null;
      const overlay = (() => {
        const bin = polygonToBinaryMask(cw, ch, pts);
        return { width: cw, height: ch, data: bin } as Selection;
      })();
      applySelectionFinalization({
        overlay,
        modifiers: mod,
        runtime: ctx.runtime,
        currentSelection: ctx.selection,
        onSelectionChange: ctx.onSelectionChange,
        drawSelectionOverlay: ctx.drawSelectionOverlay
      });
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
