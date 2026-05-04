/**
 * useOverlayRenderer
 *
 * Manages overlay canvas drawing for shape/gradient/crop/selection preview
 * (document-sized bitmap), viewport-layer marching ants + pixel grid on the
 * screen-resolution selection canvas, and cursor canvas rendering.
 */

import { useCallback, useEffect, useRef } from "react";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection
} from "../types";
import { getToolHandler } from "../tools";
import { CloneStampTool } from "../tools/CloneStampTool";
import { drawShapeOnCtx } from "../tools/ShapeTool";
import { drawGradient } from "../tools/GradientTool";
import {
  drawPixelGrid,
  PENCIL_PIXEL_CURSOR_MIN_ZOOM
} from "../drawingUtils";
import { SKETCH_FULL_OPACITY_THRESHOLD } from "../painting/strokeRendering";
import {
  clientToDocumentCanvas,
  documentCanvasToClient
} from "../tools/transform/handleGeometry";
import {
  drawSelectionEllipseOutline,
  drawSelectionPolylineOutline,
  drawSelectionRectOutline,
  marqueeRectFromDocPoints
} from "../selection";

/** While dragging a selection, marching ants use `start` + `translate(dx,dy)` so the outline is not clipped before commit. */
export type SelectionMoveAntsRef = React.MutableRefObject<{
  start: Selection;
  dx: number;
  dy: number;
} | null>;

/**
 * Extra CSS pixels around the sketch viewport for the selection marching-ants bitmap.
 * Outlines can map outside the image; without padding they are clipped at the canvas edge.
 */
export function selectionAntCanvasMarginCssPx(zoom: number): number {
  const z = Math.max(0.02, zoom);
  return Math.min(520, Math.round(32 + z * 120));
}

export interface UseOverlayRendererParams {
  doc: SketchDocument;
  activeTool: SketchTool;
  /** Cursor / brush preview: follows pointer routing (e.g. move while toolbar tool stays brush). */
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  selection?: Selection | null;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Screen-resolution canvas for transform gizmo (not clipped by doc-stack). */
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  selectStartRef: React.MutableRefObject<Point | null>;
  lassoPointsRef: React.MutableRefObject<Point[]>;
}

/**
 * Callback signature for `drawGizmo`. Receives the screen-resolution 2D
 * context (already cleared), the device pixel ratio, and container CSS
 * dimensions so the caller can draw crisp overlays in screen space.
 */
export type GizmoDrawCallback = (
  gc: CanvasRenderingContext2D,
  dpr: number,
  containerW: number,
  containerH: number
) => void;

export interface UseOverlayRendererResult {
  clearOverlay: () => void;
  drawSelectionOverlay: () => void;
  /** Draw marching ants on top without clearing (e.g. after `drawActiveStrokePreview`). */
  appendSelectionOverlay: () => void;
  drawOverlayShape: (start: Point, end: Point) => void;
  drawOverlayGradient: (start: Point, end: Point) => void;
  drawOverlayCrop: (start: Point, end: Point) => void;
  drawOverlaySelection: (start: Point, end: Point) => void;
  drawOverlayLassoPreview: (points: Point[], cursor: Point | null) => void;
  /** Viewport `clientX` / `clientY` (CSS pixels); mapped into the cursor canvas internally. */
  drawCursor: (clientX: number, clientY: number) => void;

  // ── Screen-resolution gizmo overlay ──────────────────────────────────
  /** Clear the gizmo canvas (screen-resolution overlay for tool handles). */
  clearGizmo: () => void;
  /**
   * Draw on the screen-resolution gizmo canvas. Clears the canvas first,
   * then calls `callback` with the 2D context, device pixel ratio, and
   * container CSS dimensions. Any tool can use this for crisp overlays
   * that are not clipped by the document bounds.
   */
  drawGizmo: (callback: GizmoDrawCallback) => void;
}

export function useOverlayRenderer({
  doc,
  activeTool,
  interactionTool,
  zoom,
  pan,
  selection,
  overlayCanvasRef,
  selectionCanvasRef,
  cursorCanvasRef,
  gizmoCanvasRef,
  containerRef,
  shiftHeldRef,
  altHeldRef,
  selectStartRef,
  lassoPointsRef
}: UseOverlayRendererParams): UseOverlayRendererResult {

  // ─── Screen-resolution canvas sizing (cursor + selection + gizmo) ───

  useEffect(() => {
    const container = containerRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    const selCanvas = selectionCanvasRef.current;
    const gizmoCanvas = gizmoCanvasRef.current;
    if (!container) {
      return;
    }

    const updateScreenCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cursorCanvas) {
        if (cursorCanvas.width !== cw) {
          cursorCanvas.width = cw;
        }
        if (cursorCanvas.height !== ch) {
          cursorCanvas.height = ch;
        }
      }
      if (gizmoCanvas) {
        const gw = Math.round(cw * dpr);
        const gh = Math.round(ch * dpr);
        if (gizmoCanvas.width !== gw) {
          gizmoCanvas.width = gw;
        }
        if (gizmoCanvas.height !== gh) {
          gizmoCanvas.height = gh;
        }
      }
      if (selCanvas) {
        const m = selectionAntCanvasMarginCssPx(zoom);
        const sw = cw + 2 * m;
        const sh = ch + 2 * m;
        if (selCanvas.width !== sw) {
          selCanvas.width = sw;
        }
        if (selCanvas.height !== sh) {
          selCanvas.height = sh;
        }
      }
    };

    updateScreenCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateScreenCanvasSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, cursorCanvasRef, selectionCanvasRef, gizmoCanvasRef, zoom]);

  // ─── Overlay helpers ───────────────────────────────────────────────

  const clearOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [overlayCanvasRef]);

  // ─── Selection canvas (viewport layer) ─────────────────────────────
  // Screen-resolution bitmap with the same document→screen transform as the artwork.
  // Pixel grid + marching ants are drawn here (not on the document-sized overlay).

  /** Clear, apply doc→view transform, stroke pixel grid when zoom allows; leaves ctx in doc space. */
  const beginSelectionLayerPaint = useCallback((): CanvasRenderingContext2D | null => {
    const selCanvas = selectionCanvasRef.current;
    const container = containerRef.current;
    if (!selCanvas || !container) {
      return null;
    }
    const ctx = selCanvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    const m = selectionAntCanvasMarginCssPx(zoom);
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const cx = m + cw / 2;
    const cy = m + ch / 2;
    ctx.setTransform(zoom, 0, 0, zoom, cx + pan.x, cy + pan.y);
    const docW = doc.canvas.width;
    const docH = doc.canvas.height;
    ctx.translate(-docW / 2, -docH / 2);
    drawPixelGrid(ctx, docW, docH, zoom);
    return ctx;
  }, [selectionCanvasRef, containerRef, zoom, pan, doc.canvas.width, doc.canvas.height]);

  /** Pixel grid (when zoom allows). Committed-selection ants are rendered by the GPU. */
  const paintSelectionCanvas = useCallback(() => {
    const ctx = beginSelectionLayerPaint();
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [beginSelectionLayerPaint]);

  const paintSelectionCanvasRef = useRef(paintSelectionCanvas);
  paintSelectionCanvasRef.current = paintSelectionCanvas;

  const drawSelectionOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    }
    paintSelectionCanvas();
  }, [overlayCanvasRef, paintSelectionCanvas]);

  const appendSelectionOverlay = useCallback(() => {
    paintSelectionCanvas();
  }, [paintSelectionCanvas]);

  useEffect(() => {
    drawSelectionOverlay();
  }, [drawSelectionOverlay]);

  // ─── Screen-resolution gizmo canvas API ─────────────────────────────

  const clearGizmo = useCallback(() => {
    const gizmoCanvas = gizmoCanvasRef.current;
    if (!gizmoCanvas) {
      return;
    }
    const gc = gizmoCanvas.getContext("2d");
    if (gc) {
      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.clearRect(0, 0, gizmoCanvas.width, gizmoCanvas.height);
    }
  }, [gizmoCanvasRef]);

  const drawGizmo = useCallback(
    (callback: GizmoDrawCallback) => {
      const gizmoCanvas = gizmoCanvasRef.current;
      const container = containerRef.current;
      if (!gizmoCanvas || !container) {
        return;
      }
      const gc = gizmoCanvas.getContext("2d");
      if (!gc) {
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;

      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.clearRect(0, 0, gizmoCanvas.width, gizmoCanvas.height);
      callback(gc, dpr, containerW, containerH);
    },
    [gizmoCanvasRef, containerRef]
  );

  // Clear overlay preview when switching tools (skip for tools that draw their own overlay on activate)
  useEffect(() => {
    if (activeTool !== "gradient" && activeTool !== "transform") {
      clearOverlay();
      drawSelectionOverlay();
    }
    // Clear the gizmo canvas when switching tools — tools that need the gizmo
    // will redraw it in their onActivate handler.
    clearGizmo();
  }, [activeTool, clearOverlay, drawSelectionOverlay, clearGizmo]);

  const drawOverlayShape = useCallback(
    (start: Point, end: Point) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      drawShapeOnCtx(ctx, doc.toolSettings.shape.shapeType, start, end, doc.toolSettings.shape, shiftHeldRef.current, altHeldRef.current);
    },
    [doc.toolSettings.shape, overlayCanvasRef, shiftHeldRef, altHeldRef]
  );

  const drawOverlayGradient = useCallback(
    (start: Point, end: Point) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      drawGradient(ctx, start, end, doc.toolSettings.gradient);
      // Draw guide line
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    },
    [doc.toolSettings.gradient, overlayCanvasRef]
  );

  const drawOverlayCrop = useCallback(
    (start: Point, end: Point) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      // Dim outside selection
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, overlay.width, overlay.height);
      ctx.clearRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    },
    [overlayCanvasRef]
  );

  const drawOverlaySelection = useCallback(
    (start: Point, end: Point) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ovCtx = overlay.getContext("2d");
      if (!ovCtx) {
        return;
      }
      ovCtx.clearRect(0, 0, overlay.width, overlay.height);

      const selCtx = beginSelectionLayerPaint();
      if (!selCtx) {
        return;
      }
      const { x, y, w, h } = marqueeRectFromDocPoints(start, end);
      if (w >= 1 && h >= 1) {
        if (doc.toolSettings.select.mode === "ellipse") {
          // Draw ellipse path directly so the preview is not clipped to canvas bounds.
          drawSelectionEllipseOutline(selCtx, x, y, w, h, 0, zoom);
        } else {
          drawSelectionRectOutline(selCtx, x, y, w, h, 0, zoom);
        }
      }
      selCtx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [
      overlayCanvasRef,
      zoom,
      doc.toolSettings.select.mode,
      beginSelectionLayerPaint
    ]
  );

  const drawOverlayLassoPreview = useCallback(
    (points: Point[], cursor: Point | null) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ovCtx = overlay.getContext("2d");
      if (!ovCtx) {
        return;
      }
      ovCtx.clearRect(0, 0, overlay.width, overlay.height);

      const selCtx = beginSelectionLayerPaint();
      if (!selCtx) {
        return;
      }
      const path: Point[] = cursor ? [...points, cursor] : [...points];
      if (path.length >= 2) {
        drawSelectionPolylineOutline(selCtx, path, 0, zoom);
      }
      selCtx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [overlayCanvasRef, zoom, beginSelectionLayerPaint]
  );

  // ─── Cursor rendering ──────────────────────────────────────────────

  const drawCursor = useCallback(
    (clientX: number, clientY: number) => {
      const cursorCanvas = cursorCanvasRef.current;
      if (!cursorCanvas) {
        return;
      }
      const ctx = cursorCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

      // Only show brush cursor for tools that declare showsBrushCursor capability
      const handler = getToolHandler(interactionTool);
      if (!handler.showsBrushCursor) {
        return;
      }

      const cRect = cursorCanvas.getBoundingClientRect();
      const rw = cRect.width;
      const rh = cRect.height;
      if (rw <= 0 || rh <= 0) {
        return;
      }
      const scaleX = cursorCanvas.width / rw;
      const scaleY = cursorCanvas.height / rh;
      const localX = (clientX - cRect.left) * scaleX;
      const localY = (clientY - cRect.top) * scaleY;

      let size: number;
      let roundness = 1;
      let angle = 0;
      let hardnessScale = 1;
      let isPencilHighZoom = false;
      if (interactionTool === "brush") {
        size = doc.toolSettings.brush.size;
        roundness = doc.toolSettings.brush.roundness;
        angle = doc.toolSettings.brush.angle;
        // Match the effective hardness used by drawBrushStroke / createBrushStamp
        const brushType = doc.toolSettings.brush.brushType || "round";
        const effectiveHardness =
          brushType === "soft"
            ? Math.min(doc.toolSettings.brush.hardness, 0.35)
            : brushType === "airbrush"
              ? Math.min(doc.toolSettings.brush.hardness, 0.18)
              : doc.toolSettings.brush.hardness;
        if (effectiveHardness < 0.999) {
          // The radial gradient inner stop from createBrushStamp
          const innerStop = Math.max(0, Math.min(1, effectiveHardness * 0.85 + 0.1));
          // Show the approximate 25% opacity contour as the cursor edge
          hardnessScale = innerStop + (1 - innerStop) * 0.5;
        }
        // At size ≤ 1.25 with full opacity the stroke snaps each dab to an integer pixel;
        // show the same pixel-aligned square cursor so cursor and ink land at the same spot.
        if (
          size <= 1.25 &&
          doc.toolSettings.brush.opacity >= SKETCH_FULL_OPACITY_THRESHOLD &&
          zoom >= PENCIL_PIXEL_CURSOR_MIN_ZOOM
        ) {
          isPencilHighZoom = true;
        }
      } else if (interactionTool === "pencil") {
        size = doc.toolSettings.pencil.size;
        isPencilHighZoom = zoom >= PENCIL_PIXEL_CURSOR_MIN_ZOOM;
      } else if (interactionTool === "blur") {
        size = doc.toolSettings.blur.size;
      } else if (interactionTool === "clone_stamp") {
        size = doc.toolSettings.cloneStamp.size;
      } else {
        const eraser = doc.toolSettings.eraser;
        const eraserMode =
          eraser.mode ??
          (eraser as { tip?: "brush" | "pencil" }).tip ??
          "brush";
        size = eraser.size;
        if (eraserMode === "brush") {
          const b = doc.toolSettings.brush;
          roundness = b.roundness;
          angle = b.angle;
          const brushType = b.brushType || "round";
          const effectiveHardness =
            brushType === "soft"
              ? Math.min(b.hardness, 0.35)
              : brushType === "airbrush"
                ? Math.min(b.hardness, 0.18)
                : b.hardness;
          if (effectiveHardness < 0.999) {
            const innerStop = Math.max(0, Math.min(1, effectiveHardness * 0.85 + 0.1));
            hardnessScale = innerStop + (1 - innerStop) * 0.5;
          }
        } else {
          // Pencil-mode eraser snaps dabs to integer pixels for size ≤ 1.25.
          if (
            size <= 1.25 &&
            eraser.opacity >= SKETCH_FULL_OPACITY_THRESHOLD &&
            zoom >= PENCIL_PIXEL_CURSOR_MIN_ZOOM
          ) {
            isPencilHighZoom = true;
          }
        }
      }

      // ── Pencil pixel-snap cursor at high zoom ─────────────────────────
      if (isPencilHighZoom) {
        // Show a pixel-aligned square cursor that snaps to the grid
        const container = containerRef.current;
        if (container) {
          const contRect = container.getBoundingClientRect();
          const docW = doc.canvas.width;
          const docH = doc.canvas.height;
          const docPt = clientToDocumentCanvas(
            clientX,
            clientY,
            contRect,
            zoom,
            pan,
            docW,
            docH
          );
          const docX = Math.floor(docPt.x);
          const docY = Math.floor(docPt.y);
          const tlClient = documentCanvasToClient(
            docX,
            docY,
            contRect,
            zoom,
            pan,
            docW,
            docH
          );
          const pixelScreenX = (tlClient.x - cRect.left) * scaleX;
          const pixelScreenY = (tlClient.y - cRect.top) * scaleY;
          const pixelSize = size * zoom;

          ctx.save();
          // Filled pixel preview with tool color at low opacity
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.fillRect(pixelScreenX, pixelScreenY, pixelSize, pixelSize);
          // Outline
          ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
          ctx.lineWidth = 1;
          ctx.strokeRect(pixelScreenX + 0.5, pixelScreenY + 0.5, pixelSize - 1, pixelSize - 1);
          ctx.restore();

          // Center crosshair
          const cx = pixelScreenX + pixelSize / 2;
          const cy = pixelScreenY + pixelSize / 2;
          const crossLen = Math.max(4, pixelSize * 0.3);
          ctx.save();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx - crossLen, cy);
          ctx.lineTo(cx + crossLen, cy);
          ctx.moveTo(cx, cy - crossLen);
          ctx.lineTo(cx, cy + crossLen);
          ctx.stroke();
          ctx.restore();
        }
        return;
      }

      // Calculate the visual radius on screen (accounting for zoom and hardness)
      const screenRadiusX = (size / 2) * hardnessScale * zoom;
      const screenRadiusY = screenRadiusX * roundness;
      const angleRad = (angle * Math.PI) / 180;

      ctx.save();
      ctx.translate(localX, localY);
      if (angleRad !== 0) {
        ctx.rotate(angleRad);
      }

      // Outer white ring
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, screenRadiusX), Math.max(1, screenRadiusY), 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner dark ring for contrast
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1, screenRadiusX), Math.max(1, screenRadiusY), 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      // Center dot (unrotated)
      ctx.beginPath();
      ctx.arc(localX, localY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();

      // Clone stamp: draw a crosshair at the clone source position
      if (interactionTool === "clone_stamp") {
        const cloneHandler = getToolHandler("clone_stamp");
        const cloneSource = cloneHandler instanceof CloneStampTool
          ? cloneHandler.getCloneSource()
          : null;
        if (cloneSource) {
          const container = containerRef.current;
          if (container) {
            const contRect = container.getBoundingClientRect();
            const docW = doc.canvas.width;
            const docH = doc.canvas.height;
            const srcClient = documentCanvasToClient(
              cloneSource.x,
              cloneSource.y,
              contRect,
              zoom,
              pan,
              docW,
              docH
            );
            const srcX = (srcClient.x - cRect.left) * scaleX;
            const srcY = (srcClient.y - cRect.top) * scaleY;
            const crossLen = 8;
            ctx.save();
            // Outer white stroke for contrast
            ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(srcX - crossLen, srcY);
            ctx.lineTo(srcX + crossLen, srcY);
            ctx.moveTo(srcX, srcY - crossLen);
            ctx.lineTo(srcX, srcY + crossLen);
            ctx.stroke();
            // Inner colored stroke
            ctx.strokeStyle = "rgba(80, 180, 255, 0.9)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Small circle at center
            ctx.beginPath();
            ctx.arc(srcX, srcY, 3, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    },
    [
      interactionTool,
      doc.toolSettings.brush,
      doc.toolSettings.pencil,
      doc.toolSettings.eraser,
      doc.toolSettings.blur,
      doc.toolSettings.cloneStamp,
      doc.canvas.width,
      doc.canvas.height,
      zoom,
      pan,
      cursorCanvasRef,
      overlayCanvasRef,
      containerRef
    ]
  );

  return {
    clearOverlay,
    drawSelectionOverlay,
    appendSelectionOverlay,
    drawOverlayShape,
    drawOverlayGradient,
    drawOverlayCrop,
    drawOverlaySelection,
    drawOverlayLassoPreview,
    drawCursor,
    clearGizmo,
    drawGizmo
  };
}
