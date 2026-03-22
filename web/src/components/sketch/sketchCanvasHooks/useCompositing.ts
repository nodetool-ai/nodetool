/**
 * useCompositing
 *
 * Manages the display canvas compositing pipeline:
 * - Layer canvas creation and lifecycle
 * - Compositing all visible layers onto the display canvas
 * - rAF-batched redraw scheduling
 */

import { useCallback, useEffect, useRef } from "react";
import type { SketchDocument } from "../types";
import { blendModeToComposite, drawCheckerboard } from "../drawingUtils";

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
}

export function useCompositing({
  doc,
  isolatedLayerId
}: UseCompositingParams): UseCompositingResult {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const redrawRequestRef = useRef<number | null>(null);

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

  // ─── Composite and redraw display canvas ────────────────────────────

  const redraw = useCallback(() => {
    const displayCanvas = displayCanvasRef.current;
    if (!displayCanvas) {
      return;
    }
    const ctx = displayCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    drawCheckerboard(ctx, displayCanvas.width, displayCanvas.height);

    for (const layer of doc.layers) {
      if (!layer.visible) {
        continue;
      }
      // When a layer is isolated/solo'd, skip all other layers
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
      ctx.drawImage(layerCanvas, 0, 0);
      ctx.restore();
    }

    // Draw a subtle border around the canvas to show its boundaries
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, displayCanvas.width - 1, displayCanvas.height - 1);
    ctx.restore();
  }, [doc.layers, isolatedLayerId]);

  /**
   * Batched redraw using requestAnimationFrame.
   * During active drawing, multiple pointer move events can fire per frame.
   * This coalesces redraws so we only composite layers once per animation frame.
   */
  const requestRedraw = useCallback(() => {
    if (redrawRequestRef.current === null) {
      redrawRequestRef.current = requestAnimationFrame(() => {
        redrawRequestRef.current = null;
        redraw();
      });
    }
  }, [redraw]);

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
    requestRedraw
  };
}
