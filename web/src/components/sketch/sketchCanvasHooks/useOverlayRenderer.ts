/**
 * useOverlayRenderer
 *
 * Manages overlay canvas drawing for shape/gradient/crop/selection preview
 * and cursor canvas rendering for brush size indicator.
 */

import { useCallback, useEffect } from "react";
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

// ─── Constants ──────────────────────────────────────────────────────────────
const SELECTION_DASH_LENGTH = 4;
const SELECTION_DASH_OFFSET = SELECTION_DASH_LENGTH;

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
}

export interface UseOverlayRendererResult {
  clearOverlay: () => void;
  drawSelectionOverlay: () => void;
  drawOverlayShape: (start: Point, end: Point) => void;
  drawOverlayGradient: (start: Point, end: Point) => void;
  drawOverlayCrop: (start: Point, end: Point) => void;
  drawOverlaySelection: (start: Point, end: Point) => void;
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
  selectStartRef
}: UseOverlayRendererParams): UseOverlayRendererResult {

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

  const drawSelectionOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || !selection) {
      return;
    }
    // Don't draw persistent selection while actively dragging a new one
    if (selectStartRef.current) {
      return;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) {
      return;
    }
    const { x, y, width, height } = selection;
    ctx.save();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.setLineDash([SELECTION_DASH_LENGTH, SELECTION_DASH_LENGTH]);
    ctx.strokeRect(x, y, width, height);
    ctx.strokeStyle = "#000000";
    ctx.lineDashOffset = SELECTION_DASH_OFFSET;
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }, [selection, overlayCanvasRef, selectStartRef]);

  // Redraw selection overlay when selection changes
  useEffect(() => {
    drawSelectionOverlay();
  }, [drawSelectionOverlay]);

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
      drawShapeOnCtxUtil(ctx, activeTool, start, end, doc.toolSettings.shape, shiftHeldRef.current, altHeldRef.current);
    },
    [activeTool, doc.toolSettings.shape, overlayCanvasRef, shiftHeldRef, altHeldRef]
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
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      if (w < 1 || h < 1) {
        return;
      }
      // Marching ants: white dashes + offset black dashes
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.setLineDash([SELECTION_DASH_LENGTH, SELECTION_DASH_LENGTH]);
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "#000000";
      ctx.lineDashOffset = SELECTION_DASH_OFFSET;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    },
    [overlayCanvasRef]
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
      if (activeTool === "brush") {
        size = doc.toolSettings.brush.size;
        roundness = doc.toolSettings.brush.roundness;
        angle = doc.toolSettings.brush.angle;
      } else if (activeTool === "pencil") {
        size = doc.toolSettings.pencil.size;
      } else if (activeTool === "blur") {
        size = doc.toolSettings.blur.size;
      } else if (activeTool === "clone_stamp") {
        size = doc.toolSettings.cloneStamp.size;
      } else {
        size = doc.toolSettings.eraser.size;
      }

      // Calculate the visual radius on screen (accounting for zoom)
      const screenRadiusX = (size / 2) * zoom;
      const screenRadiusY = screenRadiusX * roundness;
      const rad = (angle * Math.PI) / 180;

      ctx.save();
      ctx.translate(screenX, screenY);
      if (rad !== 0) {
        ctx.rotate(rad);
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
      doc.toolSettings.pencil.size,
      doc.toolSettings.eraser.size,
      doc.toolSettings.blur.size,
      doc.toolSettings.cloneStamp.size,
      zoom,
      cursorCanvasRef
    ]
  );

  return {
    clearOverlay,
    drawSelectionOverlay,
    drawOverlayShape,
    drawOverlayGradient,
    drawOverlayCrop,
    drawOverlaySelection,
    drawCursor
  };
}
