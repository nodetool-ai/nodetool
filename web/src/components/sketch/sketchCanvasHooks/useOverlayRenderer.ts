/**
 * useOverlayRenderer
 *
 * Manages overlay canvas drawing for shape/gradient/crop/selection preview
 * (document-sized bitmap), viewport-layer pixel grid + in-progress marquee/lasso
 * previews on the screen-resolution selection canvas, and cursor canvas rendering.
 * Finalized selection marching ants are drawn in WebGPU (`WebGPURuntime` pass 5),
 * not here — this path only covers live drag feedback.
 */

import { useCallback, useEffect, useRef } from "react";
import { alpha, useTheme } from "@mui/material/styles";
import type {
  SketchDocument,
  SketchTool,
  Point
} from "../types";
import { getToolHandler } from "../tools";
import { CloneStampTool } from "../tools/CloneStampTool";
import { drawShapeOnCtx } from "../tools/ShapeTool";
import { drawGradient } from "../tools/GradientTool";
import {
  drawPixelGrid,
  PENCIL_PIXEL_CURSOR_MIN_ZOOM
} from "../drawingUtils";
import {
  SKETCH_FULL_OPACITY_THRESHOLD,
  snapStrokeDabCenterDoc
} from "../painting/strokeRendering";
import {
  sketchClientToDocCanvas,
  sketchDocCanvasToClient
} from "../tools/transform/handleGeometry";
import {
  drawSelectionEllipseOutline,
  drawSelectionPolylineOutline,
  drawSelectionRectOutline,
  marqueeRectFromDocPoints
} from "../selection";
import { getLazyLeash } from "../painting/lazyLeashState";

/**
 * Extra CSS pixels around the sketch viewport for the selection marching-ants bitmap.
 * Outlines can map outside the image; without padding they are clipped at the canvas edge.
 */
export function selectionAntCanvasMarginCssPx(zoom: number): number {
  const z = Math.max(0.02, zoom);
  return Math.min(520, Math.round(32 + z * 120));
}

/** Same pacing idea as GPU ants: slow dash drift so Canvas2D preview does not sparkle. */
function liveSelectionPreviewAntsPhase(): number {
  return (performance.now() * 0.018) % 256;
}

export interface UseOverlayRendererParams {
  doc: SketchDocument;
  activeTool: SketchTool;
  /** Cursor / brush preview: follows pointer routing (e.g. move while toolbar tool stays brush). */
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionGpuCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Composited document canvas (CSS transformed); must match pointer UV mapping. */
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Screen-resolution canvas for transform gizmo (not clipped by doc-stack). */
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  selectStartRef: React.MutableRefObject<Point | null>;
  lassoPointsRef: React.MutableRefObject<Point[]>;
  onScreenCanvasMetricsChange?: () => void;
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
  /** No-op — WebGPU runtime handles origin during selection moves; pointer keeps one call site. */
  setSelectionOriginOverride: (pos: { x: number; y: number } | null) => void;
  /** Repaint selection-canvas chrome on top without clearing the document overlay. */
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
  overlayCanvasRef,
  selectionGpuCanvasRef,
  selectionCanvasRef,
  cursorCanvasRef,
  displayCanvasRef,
  gizmoCanvasRef,
  containerRef,
  shiftHeldRef,
  altHeldRef,
  selectStartRef,
  lassoPointsRef,
  onScreenCanvasMetricsChange
}: UseOverlayRendererParams): UseOverlayRendererResult {
  const theme = useTheme();

  // ─── Screen-resolution canvas sizing (cursor + selection + gizmo) ───

  useEffect(() => {
    const container = containerRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    const selectionGpuCanvas = selectionGpuCanvasRef.current;
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
      if (selectionGpuCanvas) {
        const m = selectionAntCanvasMarginCssPx(zoom);
        const gw = Math.round((cw + 2 * m) * dpr);
        const gh = Math.round((ch + 2 * m) * dpr);
        if (selectionGpuCanvas.width !== gw) {
          selectionGpuCanvas.width = gw;
        }
        if (selectionGpuCanvas.height !== gh) {
          selectionGpuCanvas.height = gh;
        }
      }
      onScreenCanvasMetricsChange?.();
    };

    updateScreenCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateScreenCanvasSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    containerRef,
    cursorCanvasRef,
    selectionGpuCanvasRef,
    selectionCanvasRef,
    gizmoCanvasRef,
    onScreenCanvasMetricsChange,
    zoom
  ]);

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
  // Pixel grid + live selection previews are drawn here (not on the document-sized overlay).

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

  // In-progress drag preview (start+end in doc coords). Kept in a ref so the
  // selection-canvas repaint can composite it on top of the pixel grid.
  const selectionDragPreviewRef = useRef<{ start: Point; end: Point } | null>(
    null
  );
  const selectionLassoLiveRef = useRef<{
    points: Point[];
    cursor: Point | null;
  } | null>(null);

  /** Pixel grid + live marquee/lasso previews. Committed mask outline → WebGPU pass 5. */
  const paintSelectionCanvas = useCallback(() => {
    const ctx = beginSelectionLayerPaint();
    if (!ctx) {
      return;
    }
    const preview = selectionDragPreviewRef.current;
    const lassoLive = selectionLassoLiveRef.current;

    if (preview !== null) {
      const { x, y, w, h } = marqueeRectFromDocPoints(preview.start, preview.end);
      if (w >= 1 && h >= 1) {
        const phase = liveSelectionPreviewAntsPhase();
        if (doc.toolSettings.select.mode === "ellipse") {
          drawSelectionEllipseOutline(ctx, x, y, w, h, phase, zoom);
        } else {
          drawSelectionRectOutline(ctx, x, y, w, h, phase, zoom);
        }
      }
    }

    if (lassoLive !== null && lassoLive.points.length >= 1) {
      const pathPts: Point[] = lassoLive.cursor
        ? [...lassoLive.points, lassoLive.cursor]
        : [...lassoLive.points];
      if (pathPts.length >= 2) {
        drawSelectionPolylineOutline(
          ctx,
          pathPts,
          liveSelectionPreviewAntsPhase(),
          zoom
        );
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [
    beginSelectionLayerPaint,
    zoom,
    doc.toolSettings.select.mode
  ]);

  const paintSelectionCanvasRef = useRef(paintSelectionCanvas);
  paintSelectionCanvasRef.current = paintSelectionCanvas;

  const setSelectionOriginOverride: UseOverlayRendererResult["setSelectionOriginOverride"] =
    useCallback(() => {}, []);

  const drawSelectionOverlay = useCallback(() => {
    selectionDragPreviewRef.current = null;
    selectionLassoLiveRef.current = null;
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

  // Clear overlay/gizmo when switching tools. Gradient still owns its overlay
  // bitmap (drawn directly on the overlay canvas) and opts out. Transform is
  // React/SVG now and no longer paints on the gizmo canvas, so unconditional
  // `clearGizmo()` is safe on every tool change.
  useEffect(() => {
    if (activeTool !== "gradient") {
      clearOverlay();
      drawSelectionOverlay();
    }
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
      if (overlay) {
        const ovCtx = overlay.getContext("2d");
        if (ovCtx) {
          ovCtx.clearRect(0, 0, overlay.width, overlay.height);
        }
      }
      // Store in ref so paintSelectionCanvas composites it on top of committed
      // selection UI without relying on a separate committed-ants pass.
      selectionDragPreviewRef.current = { start, end };
      paintSelectionCanvasRef.current();
    },
    [overlayCanvasRef]
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
      selectionDragPreviewRef.current = null;
      selectionLassoLiveRef.current = { points, cursor };
      paintSelectionCanvasRef.current();
    },
    [overlayCanvasRef]
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

      const container = containerRef.current;
      const contRect = container?.getBoundingClientRect();
      const docW = doc.canvas.width;
      const docH = doc.canvas.height;

      const pencilLikeDabSnap = (): { size: number; opacity: number } | null => {
        if (interactionTool === "pencil") {
          const p = doc.toolSettings.pencil;
          return { size: p.size, opacity: p.opacity };
        }
        if (interactionTool === "eraser") {
          const eraser = doc.toolSettings.eraser;
          const eraserMode =
            eraser.mode ??
            (eraser as { tip?: "brush" | "pencil" }).tip ??
            "brush";
          if (eraserMode === "pencil") {
            return { size: eraser.size, opacity: eraser.opacity };
          }
        }
        return null;
      };

      const dabSnap = pencilLikeDabSnap();
      let docPt: Point | null = null;
      let anchorClientX = clientX;
      let anchorClientY = clientY;
      if (contRect && contRect.width > 0 && contRect.height > 0) {
        docPt = sketchClientToDocCanvas(
          clientX,
          clientY,
          displayCanvasRef.current,
          contRect,
          zoom,
          pan,
          docW,
          docH
        );
      }

      // ── Lazy-brush leash ───────────────────────────────────────────
      // When an active paint stroke runs with assist mode === "lazy",
      // the actual brush tip lags behind the cursor. Anchor the brush
      // ring at the lagging tip and draw the leash (line + raw cursor
      // marker) after the ring so the user can see where paint goes.
      const lazyLeash = getLazyLeash();
      const lazyActive =
        lazyLeash !== null &&
        (interactionTool === "brush" ||
          interactionTool === "pencil" ||
          interactionTool === "eraser");
      if (lazyActive && lazyLeash) {
        docPt = { x: lazyLeash.tipDoc.x, y: lazyLeash.tipDoc.y };
      }
      // `PencilEngine.stabilize` snaps to integer grid before `dabAt`; preview must use
      // the same grid so 1px crisp dabs match. Eraser pencil mode does not integer-snap in
      // `EraserEngine.stabilize`, so keep continuous doc coords there.
      const dabDocCoords =
        docPt &&
        dabSnap &&
        interactionTool === "pencil"
          ? { x: Math.round(docPt.x), y: Math.round(docPt.y) }
          : docPt;
      if (contRect && contRect.width > 0 && contRect.height > 0 && docPt) {
        const anchorDoc =
          dabSnap && dabDocCoords
            ? snapStrokeDabCenterDoc(
                dabDocCoords.x,
                dabDocCoords.y,
                dabSnap.size,
                dabSnap.opacity
              )
            : docPt;
        const ac = sketchDocCanvasToClient(
          anchorDoc.x,
          anchorDoc.y,
          displayCanvasRef.current,
          contRect,
          zoom,
          pan,
          docW,
          docH
        );
        anchorClientX = ac.x;
        anchorClientY = ac.y;
      }
      const localX = (anchorClientX - cRect.left) * scaleX;
      const localY = (anchorClientY - cRect.top) * scaleY;

      /** Raw pointer on cursor canvas (sub-pixel); snapped dab preview uses anchorClient*. */
      const rawLocalX = (clientX - cRect.left) * scaleX;
      const rawLocalY = (clientY - cRect.top) * scaleY;

      let size: number;
      let roundness = 1;
      let angle = 0;
      let hardnessScale = 1;
      /** Crisp 1×1 doc-pixel dab preview — same thresholds as `drawPencilStroke` `usePixelCrispDab`. */
      let showCrispPixelCursor = false;
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
      } else if (interactionTool === "pencil") {
        size = doc.toolSettings.pencil.size;
        const p = doc.toolSettings.pencil;
        showCrispPixelCursor =
          zoom >= PENCIL_PIXEL_CURSOR_MIN_ZOOM &&
          p.opacity >= SKETCH_FULL_OPACITY_THRESHOLD &&
          p.size <= 1.25;
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
          showCrispPixelCursor =
            zoom >= PENCIL_PIXEL_CURSOR_MIN_ZOOM &&
            eraser.opacity >= SKETCH_FULL_OPACITY_THRESHOLD &&
            eraser.size <= 1.25;
        }
      }

      // ── Crisp pencil dab: 1 doc pixel (matches fillRect(ix,iy,1,1)) ────────
      if (showCrispPixelCursor && dabDocCoords) {
        const containerEl = containerRef.current;
        if (containerEl) {
          const contBounds = containerEl.getBoundingClientRect();
          const ix = Math.round(dabDocCoords.x - 0.5);
          const iy = Math.round(dabDocCoords.y - 0.5);
          const tlClient = sketchDocCanvasToClient(
            ix,
            iy,
            displayCanvasRef.current,
            contBounds,
            zoom,
            pan,
            docW,
            docH
          );
          const pixelScreenX = (tlClient.x - cRect.left) * scaleX;
          const pixelScreenY = (tlClient.y - cRect.top) * scaleY;
          const pixelSize = zoom;

          ctx.save();
          const crispOutline = alpha(theme.palette.grey[400], 0.82);
          const crispCross = alpha(theme.palette.grey[600], 0.88);
          // Muted gray fill + outline (high-zoom 1px dab preview)
          ctx.fillStyle = alpha(theme.palette.grey[500], 0.32);
          ctx.fillRect(pixelScreenX, pixelScreenY, pixelSize, pixelSize);
          // Outline
          ctx.strokeStyle = crispOutline;
          ctx.lineWidth = 1;
          ctx.strokeRect(pixelScreenX + 0.5, pixelScreenY + 0.5, pixelSize - 1, pixelSize - 1);
          ctx.restore();

          // Center crosshair
          const cx = pixelScreenX + pixelSize / 2;
          const cy = pixelScreenY + pixelSize / 2;
          const crossLen = Math.max(4, pixelSize * 0.3);
          ctx.save();
          ctx.strokeStyle = crispCross;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx - crossLen, cy);
          ctx.lineTo(cx + crossLen, cy);
          ctx.moveTo(cx, cy - crossLen);
          ctx.lineTo(cx, cy + crossLen);
          ctx.stroke();
          ctx.restore();

          // Faint round hint at actual mouse position (dab stays pixel-snapped above).
          if (interactionTool === "pencil") {
            const hintR = Math.max(3.5, Math.min(10, zoom * 0.45));
            ctx.save();
            ctx.beginPath();
            ctx.arc(rawLocalX, rawLocalY, hintR, 0, Math.PI * 2);
            ctx.strokeStyle = alpha(theme.palette.grey[400], 0.22);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
          }
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

      const rx = Math.max(1, screenRadiusX);
      const ry = Math.max(1, screenRadiusY);

      // Faint primary halo → light gray outline → dark gray dashed inner (avoids pure white)
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(theme.palette.primary.main, 0.14);
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(theme.palette.grey[400], 0.96);
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(theme.palette.grey[900], 0.42);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();

      // Center dot (unrotated)
      ctx.beginPath();
      ctx.arc(localX, localY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = alpha(theme.palette.grey[700], 0.92);
      ctx.fill();

      // Pencil (non-lazy): faint ring at raw pointer — ellipse dab preview stays snapped.
      if (interactionTool === "pencil" && !lazyActive) {
        const hintR = Math.max(3.5, Math.min(10, zoom * 0.45));
        ctx.save();
        ctx.beginPath();
        ctx.arc(rawLocalX, rawLocalY, hintR, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(theme.palette.grey[400], 0.22);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ── Lazy-brush leash overlay ─────────────────────────────────
      // Draw the connecting line between the raw cursor and the brush
      // tip (which is `localX/Y` because `docPt` was overridden above).
      if (lazyActive && contRect && contRect.width > 0 && contRect.height > 0) {
        const dxLeash = rawLocalX - localX;
        const dyLeash = rawLocalY - localY;
        const distLeash = Math.hypot(dxLeash, dyLeash);
        if (distLeash > 0.5) {
          ctx.save();
          // Dashed leash line (tip → cursor)
          ctx.beginPath();
          ctx.moveTo(localX, localY);
          ctx.lineTo(rawLocalX, rawLocalY);
          ctx.lineWidth = 3;
          ctx.strokeStyle = alpha(theme.palette.grey[900], 0.32);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(localX, localY);
          ctx.lineTo(rawLocalX, rawLocalY);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = alpha(theme.palette.grey[200], 0.95);
          ctx.stroke();
          ctx.setLineDash([]);
          // Small ring at the raw cursor position
          ctx.beginPath();
          ctx.arc(rawLocalX, rawLocalY, 4, 0, Math.PI * 2);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = alpha(theme.palette.grey[200], 0.95);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(rawLocalX, rawLocalY, 1.25, 0, Math.PI * 2);
          ctx.fillStyle = alpha(theme.palette.grey[900], 0.85);
          ctx.fill();
          ctx.restore();
        }
      }

      // Clone stamp: draw a crosshair at the clone source position
      if (interactionTool === "clone_stamp") {
        const cloneHandler = getToolHandler("clone_stamp");
            const cloneSource = cloneHandler instanceof CloneStampTool
          ? cloneHandler.getCloneSource()
          : null;
        if (cloneSource) {
          const containerEl = containerRef.current;
          if (containerEl) {
            const contBounds = containerEl.getBoundingClientRect();
            const srcClient = sketchDocCanvasToClient(
              cloneSource.x,
              cloneSource.y,
              displayCanvasRef.current,
              contBounds,
              zoom,
              pan,
              doc.canvas.width,
              doc.canvas.height
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
      containerRef,
      displayCanvasRef,
      theme
    ]
  );

  return {
    clearOverlay,
    drawSelectionOverlay,
    setSelectionOriginOverride,
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
