/**
 * useCompositing
 *
 * Manages the display canvas compositing pipeline:
 * - Layer canvas creation and lifecycle
 * - Compositing all visible layers onto the display canvas
 * - rAF-batched redraw scheduling with dirty-rect optimization
 */

import { useCallback, useEffect, useRef } from "react";
import type { SketchDocument } from "../types";
import { blendModeToComposite, drawCheckerboard } from "../drawingUtils";

/** Dirty rect region for partial compositing */
interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UseCompositingParams {
  doc: SketchDocument;
  isolatedLayerId?: string | null;
}

export interface UseCompositingResult {
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  redrawRequestRef: React.MutableRefObject<number | null>;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  redraw: () => void;
  requestRedraw: () => void;
  /** Schedule a partial redraw over only the changed region (faster for large canvases). */
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;
}

export function useCompositing({
  doc,
  isolatedLayerId
}: UseCompositingParams): UseCompositingResult {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const redrawRequestRef = useRef<number | null>(null);
  /** Pending dirty rect. Null means full redraw. */
  const pendingDirtyRef = useRef<DirtyRect | null>(null);
  const isFullRedrawRef = useRef(true);

  // ─── Layer Canvas Management ────────────────────────────────────────

  const getOrCreateLayerCanvas = useCallback(
    (layerId: string): HTMLCanvasElement => {
      let canvas = layerCanvasesRef.current.get(layerId);
      if (!canvas) {
        canvas = window.document.createElement("canvas");
        canvas.width = doc.canvas.width;
        canvas.height = doc.canvas.height;
        layerCanvasesRef.current.set(layerId, canvas);
      }
      return canvas;
    },
    [doc.canvas.width, doc.canvas.height]
  );

  // ─── Initialize layer canvases from document data ───────────────────

  useEffect(() => {
    const layerIds = new Set(doc.layers.map((l) => l.id));
    for (const [id] of layerCanvasesRef.current) {
      if (!layerIds.has(id)) {
        layerCanvasesRef.current.delete(id);
      }
    }

    for (const layer of doc.layers) {
      const canvas = getOrCreateLayerCanvas(layer.id);
      if (
        canvas.width !== doc.canvas.width ||
        canvas.height !== doc.canvas.height
      ) {
        canvas.width = doc.canvas.width;
        canvas.height = doc.canvas.height;
      }
      if (layer.data) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            redraw();
          }
        };
        img.src = layer.data;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.layers.length, doc.layers.map((l) => l.id).join(","), doc.canvas.width, doc.canvas.height]);

  // ─── Compositing helpers ────────────────────────────────────────────

  /** Composite layers into display canvas, optionally clipped to a dirty rect. */
  const compositeToDisplay = useCallback(
    (dirtyRect?: DirtyRect | null) => {
      const displayCanvas = displayCanvasRef.current;
      if (!displayCanvas) {
        return;
      }
      const ctx = displayCanvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const fullW = displayCanvas.width;
      const fullH = displayCanvas.height;
      const useClip = !!dirtyRect;

      if (useClip) {
        // Expand dirty rect by 2px for anti-aliasing edges
        const pad = 2;
        const rx = Math.max(0, Math.floor(dirtyRect.x - pad));
        const ry = Math.max(0, Math.floor(dirtyRect.y - pad));
        const rw = Math.min(fullW - rx, Math.ceil(dirtyRect.w + pad * 2));
        const rh = Math.min(fullH - ry, Math.ceil(dirtyRect.h + pad * 2));

        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();

        // Clear only the dirty region, then redraw checkerboard and layers
        ctx.clearRect(rx, ry, rw, rh);
        drawCheckerboard(ctx, fullW, fullH);
      } else {
        ctx.clearRect(0, 0, fullW, fullH);
        drawCheckerboard(ctx, fullW, fullH);
      }

      for (const layer of doc.layers) {
        if (!layer.visible) {
          continue;
        }
        if (isolatedLayerId && layer.id !== isolatedLayerId) {
          continue;
        }
        const layerCanvas = layerCanvasesRef.current.get(layer.id);
        if (!layerCanvas) {
          continue;
        }
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = blendModeToComposite(
          layer.blendMode || "normal"
        );
        ctx.drawImage(layerCanvas, layer.transform?.x ?? 0, layer.transform?.y ?? 0);
        ctx.restore();
      }

      if (useClip) {
        ctx.restore();
      }

      // Draw a subtle border around the canvas to show its boundaries
      if (!useClip) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, fullW - 1, fullH - 1);
        ctx.restore();
      }
    },
    [doc.layers, isolatedLayerId]
  );

  // ─── Full redraw ───────────────────────────────────────────────────

  const redraw = useCallback(() => {
    compositeToDisplay(null);
  }, [compositeToDisplay]);

  /**
   * Batched redraw using requestAnimationFrame.
   * During active drawing, multiple pointer move events can fire per frame.
   * This coalesces redraws so we only composite layers once per animation frame.
   */
  const requestRedraw = useCallback(() => {
    // Mark as full redraw needed
    isFullRedrawRef.current = true;
    pendingDirtyRef.current = null;

    if (redrawRequestRef.current === null) {
      redrawRequestRef.current = requestAnimationFrame(() => {
        redrawRequestRef.current = null;
        isFullRedrawRef.current = true;
        pendingDirtyRef.current = null;
        redraw();
      });
    }
  }, [redraw]);

  /**
   * Schedule a partial redraw over a dirty region.
   * Multiple dirty rects are merged into one bounding box.
   * Falls back to full redraw if requestRedraw() was called in the same frame.
   *
   * Note: dirty regions are intentionally discarded when a full redraw is
   * already scheduled, since the full redraw will repaint the entire canvas.
   */
  const requestDirtyRedraw = useCallback(
    (x: number, y: number, w: number, h: number) => {
      // A full redraw covers the entire canvas, so dirty tracking is unnecessary
      if (isFullRedrawRef.current) {
        return;
      }

      const prev = pendingDirtyRef.current;
      if (prev) {
        // Merge bounding boxes
        const minX = Math.min(prev.x, x);
        const minY = Math.min(prev.y, y);
        const maxX = Math.max(prev.x + prev.w, x + w);
        const maxY = Math.max(prev.y + prev.h, y + h);
        pendingDirtyRef.current = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      } else {
        pendingDirtyRef.current = { x, y, w, h };
      }

      if (redrawRequestRef.current === null) {
        redrawRequestRef.current = requestAnimationFrame(() => {
          redrawRequestRef.current = null;
          const dirty = pendingDirtyRef.current;
          const isFull = isFullRedrawRef.current;
          pendingDirtyRef.current = null;
          isFullRedrawRef.current = false;

          if (isFull || !dirty) {
            compositeToDisplay(null);
          } else {
            compositeToDisplay(dirty);
          }
        });
      }
    },
    [compositeToDisplay]
  );

  useEffect(() => {
    redraw();
  }, [redraw, doc.layers]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (redrawRequestRef.current !== null) {
        cancelAnimationFrame(redrawRequestRef.current);
      }
    };
  }, []);

  return {
    displayCanvasRef,
    overlayCanvasRef,
    layerCanvasesRef,
    redrawRequestRef,
    getOrCreateLayerCanvas,
    redraw,
    requestRedraw,
    requestDirtyRedraw
  };
}
