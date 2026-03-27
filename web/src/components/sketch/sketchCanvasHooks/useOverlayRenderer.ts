/**
 * useOverlayRenderer
 *
 * Manages overlay canvas drawing for shape/gradient/crop/selection preview
 * and cursor canvas rendering for brush size indicator.
 */

import { useCallback, useEffect, useRef } from "react";
import type {
  SketchDocument,
  SketchTool,
  Point,
  Selection
} from "../types";
import {
  drawShapeOnCtx as drawShapeOnCtxUtil,
  drawGradient as drawGradientUtil,
  drawPixelGrid,
  PIXEL_GRID_MIN_ZOOM
} from "../drawingUtils";
import {
  drawSelectionMaskOutline,
  drawSelectionPolylineOutline,
  rectSelectionMask,
  selectionHasAnyPixels
} from "../selection/selectionMask";

export interface UseOverlayRendererParams {
  doc: SketchDocument;
  activeTool: SketchTool;
  zoom: number;
  pan: Point;
  selection?: Selection | null;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  selectStartRef: React.MutableRefObject<Point | null>;
  lassoPointsRef: React.MutableRefObject<Point[]>;
}

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
  drawCursor: (screenX: number, screenY: number) => void;
}

export function useOverlayRenderer({
  doc,
  activeTool,
  zoom,
  pan,
  selection,
  overlayCanvasRef,
  selectionCanvasRef,
  cursorCanvasRef,
  containerRef,
  shiftHeldRef,
  altHeldRef,
  selectStartRef,
  lassoPointsRef
}: UseOverlayRendererParams): UseOverlayRendererResult {

  const antsPhaseRef = useRef(0);

  // ─── Screen-resolution canvas sizing (cursor + selection) ──────────

  useEffect(() => {
    const container = containerRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    const selCanvas = selectionCanvasRef.current;
    if (!container) {
      return;
    }

    const updateScreenCanvasSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (cursorCanvas) {
        if (cursorCanvas.width !== width) {
          cursorCanvas.width = width;
        }
        if (cursorCanvas.height !== height) {
          cursorCanvas.height = height;
        }
      }
      if (selCanvas) {
        if (selCanvas.width !== width) {
          selCanvas.width = width;
        }
        if (selCanvas.height !== height) {
          selCanvas.height = height;
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
  }, [containerRef, cursorCanvasRef, selectionCanvasRef]);

  // ─── Overlay helpers ───────────────────────────────────────────────

  /** Paint the pixel grid on the overlay canvas (underneath other overlays). */
  const paintPixelGridOverlay = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      drawPixelGrid(ctx, overlay.width, overlay.height, zoom);
    },
    [overlayCanvasRef, zoom]
  );

  const clearOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      paintPixelGridOverlay(ctx);
    }
  }, [overlayCanvasRef, paintPixelGridOverlay]);

  // ─── Selection canvas helpers ──────────────────────────────────────
  // The selection canvas is screen-resolution (sized to the container).
  // We set up a transform so drawing code uses document coordinates, but
  // the result is rendered at screen pixel density — crisp thin ants.

  /** Get the selection canvas ctx with document→screen transform applied. */
  const getSelectionCtx = useCallback((): CanvasRenderingContext2D | null => {
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
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    ctx.setTransform(zoom, 0, 0, zoom, cx + pan.x, cy + pan.y);
    const docW = doc.canvas.width;
    const docH = doc.canvas.height;
    ctx.translate(-docW / 2, -docH / 2);
    return ctx;
  }, [selectionCanvasRef, containerRef, zoom, pan, doc.canvas.width, doc.canvas.height]);

  const clearSelectionCanvas = useCallback(() => {
    const selCanvas = selectionCanvasRef.current;
    if (!selCanvas) {
      return;
    }
    const ctx = selCanvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    }
  }, [selectionCanvasRef]);

  /** Paint committed selection mask ants on the screen-res canvas. */
  const paintSelectionAnts = useCallback(() => {
    if (!selection || !selectionHasAnyPixels(selection)) {
      clearSelectionCanvas();
      return;
    }
    const ctx = getSelectionCtx();
    if (!ctx) {
      return;
    }
    ctx.save();
    drawSelectionMaskOutline(ctx, selection, antsPhaseRef.current, zoom);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [selection, zoom, getSelectionCtx, clearSelectionCanvas]);

  const drawSelectionOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    paintPixelGridOverlay(ctx);
    ctx.restore();

    if (selection && selectionHasAnyPixels(selection)) {
      if (!selectStartRef.current && lassoPointsRef.current.length === 0) {
        paintSelectionAnts();
      } else {
        clearSelectionCanvas();
      }
    } else {
      clearSelectionCanvas();
    }
  }, [selection, overlayCanvasRef, selectStartRef, lassoPointsRef, paintPixelGridOverlay, paintSelectionAnts, clearSelectionCanvas]);

  const appendSelectionOverlay = useCallback(() => {
    if (!selection || !selectionHasAnyPixels(selection)) {
      return;
    }
    if (selectStartRef.current || lassoPointsRef.current.length > 0) {
      return;
    }
    paintSelectionAnts();
  }, [
    selection,
    selectStartRef,
    lassoPointsRef,
    paintSelectionAnts
  ]);

  useEffect(() => {
    drawSelectionOverlay();
  }, [drawSelectionOverlay]);

  useEffect(() => {
    if (
      !selection ||
      !selectionHasAnyPixels(selection) ||
      activeTool !== "select"
    ) {
      return;
    }
    const id = window.setInterval(() => {
      if (selectStartRef.current || lassoPointsRef.current.length > 0) {
        return;
      }
      antsPhaseRef.current = (antsPhaseRef.current + 1) % 256;
      paintSelectionAnts();
    }, 180);
    return () => {
      window.clearInterval(id);
    };
  }, [
    selection,
    activeTool,
    paintSelectionAnts,
    selectStartRef,
    lassoPointsRef
  ]);

  // Clear overlay preview when switching tools (skip for tools that draw their own overlay on activate)
  useEffect(() => {
    if (activeTool !== "gradient" && activeTool !== "transform") {
      clearOverlay();
      drawSelectionOverlay();
    }
  }, [activeTool, clearOverlay, drawSelectionOverlay]);

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
      paintPixelGridOverlay(ctx);
      drawShapeOnCtxUtil(ctx, doc.toolSettings.shape.shapeType, start, end, doc.toolSettings.shape, shiftHeldRef.current, altHeldRef.current);
    },
    [doc.toolSettings.shape, overlayCanvasRef, shiftHeldRef, altHeldRef, paintPixelGridOverlay]
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
      paintPixelGridOverlay(ctx);
      drawGradientUtil(ctx, start, end, doc.toolSettings.gradient);
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
    [doc.toolSettings.gradient, overlayCanvasRef, paintPixelGridOverlay]
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
      paintPixelGridOverlay(ctx);
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
    [overlayCanvasRef, paintPixelGridOverlay]
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
      paintPixelGridOverlay(ovCtx);

      paintSelectionAnts();

      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w < 1 || h < 1) {
        return;
      }
      const selCtx = getSelectionCtx();
      if (!selCtx) {
        return;
      }
      if (selection && selectionHasAnyPixels(selection)) {
        drawSelectionMaskOutline(selCtx, selection, antsPhaseRef.current, zoom);
      }
      const previewMask = rectSelectionMask(overlay.width, overlay.height, x, y, w, h);
      drawSelectionMaskOutline(selCtx, previewMask, antsPhaseRef.current, zoom);
      selCtx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [overlayCanvasRef, zoom, selection, paintSelectionAnts, getSelectionCtx, paintPixelGridOverlay]
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
      paintPixelGridOverlay(ovCtx);

      const selCtx = getSelectionCtx();
      if (!selCtx) {
        return;
      }
      if (selection && selectionHasAnyPixels(selection)) {
        drawSelectionMaskOutline(selCtx, selection, antsPhaseRef.current, zoom);
      }
      const path: Point[] = cursor ? [...points, cursor] : [...points];
      if (path.length >= 2) {
        drawSelectionPolylineOutline(selCtx, path, antsPhaseRef.current, zoom);
      }
      selCtx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [overlayCanvasRef, zoom, selection, getSelectionCtx, paintPixelGridOverlay]
  );

  // ─── Cursor rendering ──────────────────────────────────────────────

  const drawCursor = useCallback(
    (screenX: number, screenY: number) => {
      const cursorCanvas = cursorCanvasRef.current;
      if (!cursorCanvas) {
        return;
      }
      const ctx = cursorCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

      // Only show brush cursor for brush/pencil/eraser/blur/clone_stamp tools
      if (
        activeTool !== "brush" &&
        activeTool !== "pencil" &&
        activeTool !== "eraser" &&
        activeTool !== "blur" &&
        activeTool !== "clone_stamp"
      ) {
        return;
      }

      let size: number;
      let roundness = 1;
      let angle = 0;
      let hardnessScale = 1;
      let isPencilHighZoom = false;
      if (activeTool === "brush") {
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
      } else if (activeTool === "pencil") {
        size = doc.toolSettings.pencil.size;
        isPencilHighZoom = zoom >= PIXEL_GRID_MIN_ZOOM;
      } else if (activeTool === "blur") {
        size = doc.toolSettings.blur.size;
      } else if (activeTool === "clone_stamp") {
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
        }
      }

      // ── Pencil pixel-snap cursor at high zoom ─────────────────────────
      if (isPencilHighZoom) {
        // Show a pixel-aligned square cursor that snaps to the grid
        const container = containerRef.current;
        const display = overlayCanvasRef.current;
        if (container && display) {
          const rect = display.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const offsetLeft = rect.left - containerRect.left;
          const offsetTop = rect.top - containerRect.top;
          // Compute which document pixel the cursor is over
          const docX = Math.floor((screenX - offsetLeft) / zoom);
          const docY = Math.floor((screenY - offsetTop) / zoom);
          // Convert the snapped pixel back to screen coords
          const pixelScreenX = (docX * zoom) + offsetLeft;
          const pixelScreenY = (docY * zoom) + offsetTop;
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
      ctx.translate(screenX, screenY);
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
      ctx.arc(screenX, screenY, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fill();
    },
    [
      activeTool,
      doc.toolSettings.brush.size,
      doc.toolSettings.brush.roundness,
      doc.toolSettings.brush.angle,
      doc.toolSettings.brush.hardness,
      doc.toolSettings.brush.brushType,
      doc.toolSettings.pencil.size,
      doc.toolSettings.eraser.size,
      doc.toolSettings.eraser.mode,
      doc.toolSettings.blur.size,
      doc.toolSettings.cloneStamp.size,
      zoom,
      cursorCanvasRef,
      containerRef,
      overlayCanvasRef
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
    drawCursor
  };
}
