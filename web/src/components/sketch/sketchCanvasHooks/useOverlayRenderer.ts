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
  drawGradient as drawGradientUtil
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
  selection?: Selection | null;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  shiftHeldRef: React.MutableRefObject<boolean>;
  altHeldRef: React.MutableRefObject<boolean>;
  /** When non-null, the user is actively dragging a new selection — skip persistent overlay */
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
  selection,
  overlayCanvasRef,
  cursorCanvasRef,
  containerRef,
  shiftHeldRef,
  altHeldRef,
  selectStartRef,
  lassoPointsRef
}: UseOverlayRendererParams): UseOverlayRendererResult {

  const antsPhaseRef = useRef(0);

  // ─── Cursor canvas sizing ──────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    if (!container || !cursorCanvas) {
      return;
    }

    const updateCursorCanvasSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (cursorCanvas.width !== width) {
        cursorCanvas.width = width;
      }
      if (cursorCanvas.height !== height) {
        cursorCanvas.height = height;
      }
    };

    updateCursorCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateCursorCanvasSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef, cursorCanvasRef]);

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

  /** Marching ants for the committed mask, drawn under in-progress marquee/lasso previews. */
  const paintExistingSelectionMaskOutline = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (selection && selectionHasAnyPixels(selection)) {
        drawSelectionMaskOutline(ctx, selection, antsPhaseRef.current, zoom);
      }
    },
    [selection, zoom]
  );

  const drawSelectionOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !selection || !selectionHasAnyPixels(selection)) {
      return;
    }
    if (selectStartRef.current || lassoPointsRef.current.length > 0) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    drawSelectionMaskOutline(ctx, selection, antsPhaseRef.current, zoom);
    ctx.restore();
  }, [selection, overlayCanvasRef, selectStartRef, lassoPointsRef, zoom]);

  const appendSelectionOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !selection || !selectionHasAnyPixels(selection)) {
      return;
    }
    if (selectStartRef.current || lassoPointsRef.current.length > 0) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.save();
    paintExistingSelectionMaskOutline(ctx);
    ctx.restore();
  }, [
    selection,
    overlayCanvasRef,
    selectStartRef,
    lassoPointsRef,
    paintExistingSelectionMaskOutline
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
      drawSelectionOverlay();
    }, 180);
    return () => {
      window.clearInterval(id);
    };
  }, [
    selection,
    activeTool,
    drawSelectionOverlay,
    selectStartRef,
    lassoPointsRef
  ]);

  // Clear gradient preview when switching tools
  useEffect(() => {
    if (activeTool !== "gradient") {
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
      drawShapeOnCtxUtil(ctx, doc.toolSettings.shape.shapeType, start, end, doc.toolSettings.shape, shiftHeldRef.current, altHeldRef.current);
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
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      paintExistingSelectionMaskOutline(ctx);
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w < 1 || h < 1) {
        return;
      }
      const previewMask = rectSelectionMask(overlay.width, overlay.height, x, y, w, h);
      drawSelectionMaskOutline(ctx, previewMask, antsPhaseRef.current, zoom);
    },
    [overlayCanvasRef, zoom, paintExistingSelectionMaskOutline]
  );

  const drawOverlayLassoPreview = useCallback(
    (points: Point[], cursor: Point | null) => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const ctx = overlay.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      paintExistingSelectionMaskOutline(ctx);
      const path: Point[] = cursor ? [...points, cursor] : [...points];
      if (path.length < 2) {
        return;
      }
      drawSelectionPolylineOutline(ctx, path, antsPhaseRef.current, zoom);
    },
    [overlayCanvasRef, zoom, paintExistingSelectionMaskOutline]
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
      } else if (activeTool === "blur") {
        size = doc.toolSettings.blur.size;
      } else if (activeTool === "clone_stamp") {
        size = doc.toolSettings.cloneStamp.size;
      } else {
        size = doc.toolSettings.eraser.size;
        const effectiveHardness = Math.max(0.05, Math.min(1, doc.toolSettings.eraser.hardness));
        if (effectiveHardness < 0.999) {
          const innerStop = Math.max(0, Math.min(1, effectiveHardness * 0.85 + 0.1));
          hardnessScale = innerStop + (1 - innerStop) * 0.5;
        }
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
      doc.toolSettings.eraser.hardness,
      doc.toolSettings.blur.size,
      doc.toolSettings.cloneStamp.size,
      zoom,
      cursorCanvasRef
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
