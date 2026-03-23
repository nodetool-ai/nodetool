/**
 * useCompositing
 *
 * Manages the display canvas compositing pipeline:
 * - Layer canvas creation and lifecycle
 * - Compositing all visible layers onto the display canvas
 * - rAF-batched redraw scheduling with dirty-rect optimization
 *
 * After runtime-seam refactor: delegates layer storage and compositing
 * to the Canvas2DRuntime.  This hook owns React refs, hydration
 * tracking, and rAF scheduling.
 *
 * Phase 2: Tries WebGPU first, falls back to Canvas2D automatically.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SketchDocument } from "../types";
import type { SketchRuntime, DirtyRect } from "../rendering";
import { Canvas2DRuntime, createRuntime, isWebGPUAvailable } from "../rendering";

// Re-export so existing consumers keep compiling.
export type { ActiveStrokeInfo } from "../rendering";
// Re-import the value-level type for use in this file.
import type { ActiveStrokeInfo } from "../rendering";

export interface UseCompositingParams {
  doc: SketchDocument;
  isolatedLayerId?: string | null;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
}

export interface UseCompositingResult {
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  /** The underlying rendering runtime (for imperative handle access). */
  runtime: SketchRuntime;
  /** Which rendering backend is active: "webgpu" | "canvas2d" */
  backend: "webgpu" | "canvas2d";
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  /** Schedule a partial redraw over only the changed region (faster for large canvases). */
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;
}

export function useCompositing({
  doc,
  isolatedLayerId,
  activeStrokeRef
}: UseCompositingParams): UseCompositingResult {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const redrawRequestRef = useRef<number | null>(null);
  /** Pending dirty rect. Null means full redraw. */
  const pendingDirtyRef = useRef<DirtyRect | null>(null);
  const isFullRedrawRef = useRef(false);
  const hydratedLayerStateRef = useRef<Map<string, string>>(new Map());
  // True while we are waiting for the async WebGPU init to complete.
  // Prevents Canvas2DRuntime from calling getContext("2d") on the display
  // canvas, which would permanently block WebGPU from acquiring a "webgpu"
  // context on the same element.
  const gpuPendingRef = useRef(isWebGPUAvailable());

  // ─── Shared layer canvas map (injected into the runtime) ──────────
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // ─── Runtime instance (stable across renders) ─────────────────────
  // Start with Canvas2D immediately; attempt WebGPU upgrade async.
  const runtimeRef = useRef<SketchRuntime | null>(null);
  const [backend, setBackend] = useState<"webgpu" | "canvas2d">("canvas2d");

  if (!runtimeRef.current) {
    runtimeRef.current = new Canvas2DRuntime(layerCanvasesRef.current);
  }
  const runtime: SketchRuntime = runtimeRef.current;

  // Try to upgrade to WebGPU on mount
  useEffect(() => {
    let cancelled = false;

    createRuntime(layerCanvasesRef.current).then(({ runtime: newRuntime, backend: newBackend }) => {
      if (cancelled) {
        // Don't dispose: Canvas2DRuntime.dispose() clears the shared layerCanvases map.
        void newRuntime;
        return;
      }
      // Unblock compositing now that we know which backend to use.
      gpuPendingRef.current = false;

      if (newBackend === "webgpu" && runtimeRef.current !== newRuntime) {
        // Switch to WebGPU. setBackend triggers a re-render which recreates
        // compositeToDisplay with the new runtime; the [requestRedraw, doc.layers]
        // effect will then fire and kick off the first WebGPU frame.
        const oldRuntime = runtimeRef.current;
        runtimeRef.current = newRuntime;
        setBackend(newBackend);
        // Don't dispose old runtime — it shares the same layerCanvases map.
        void oldRuntime;
      } else {
        // Canvas2D fallback (WebGPU not available or init failed).
        // Don't dispose newRuntime for the same reason (shared map).
        void newRuntime;
        // setBackend("canvas2d") would be a no-op, so manually trigger the
        // first render now that gpuPendingRef has been cleared.
        requestRedraw();
      }
    });

    return () => {
      cancelled = true;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const layerHydrationSignature = doc.layers
    .map((layer) => `${layer.id}:${layer.data ?? ""}`)
    .join("|");

  // ─── Layer Canvas Management ────────────────────────────────────────

  const getOrCreateLayerCanvas = useCallback(
    (layerId: string): HTMLCanvasElement => {
      // Always read from runtimeRef so we never hold a stale Canvas2D
      // reference after the WebGPU upgrade.
      return runtimeRef.current!.getOrCreateLayerCanvas(
        layerId,
        doc.canvas.width,
        doc.canvas.height
      );
    },
    [doc.canvas.width, doc.canvas.height]
  );

  // ─── Compositing helpers ────────────────────────────────────────────

  /** Composite layers into display canvas, optionally clipped to a dirty rect. */
  const compositeToDisplay = useCallback(
    (dirtyRect?: DirtyRect | null) => {
      const displayCanvas = displayCanvasRef.current;
      // Block any compositing while WebGPU init is in flight.
      // Using getContext("2d") on the display canvas before WebGPU acquires it
      // would permanently lock the canvas to the 2D context.
      if (!displayCanvas || gpuPendingRef.current) {
        return;
      }
      // Always read the runtime from the ref so that stale closures (e.g. an
      // img.onload captured before the WebGPU upgrade) still end up calling
      // the current runtime instead of the old Canvas2DRuntime.
      const rt = runtimeRef.current;
      if (!rt) return;
      rt.compositeToDisplay(
        displayCanvas,
        doc,
        isolatedLayerId ?? null,
        activeStrokeRef.current,
        dirtyRect
      );
    },
    // Include `backend` so that this callback (and the redraw/requestRedraw
    // functions derived from it) is recreated when the backend switches to
    // WebGPU, which causes the [requestRedraw, doc.layers] effect to fire and
    // trigger the first WebGPU frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, isolatedLayerId, activeStrokeRef, backend]
  );

  const mergePendingDirtyRect = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const next: DirtyRect = { x, y, w, h };
      const prev = pendingDirtyRef.current;
      if (!prev) {
        pendingDirtyRef.current = next;
        return next;
      }

      const minX = Math.min(prev.x, next.x);
      const minY = Math.min(prev.y, next.y);
      const maxX = Math.max(prev.x + prev.w, next.x + next.w);
      const maxY = Math.max(prev.y + prev.h, next.y + next.h);
      const merged = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      pendingDirtyRef.current = merged;
      return merged;
    },
    []
  );

  // ─── Full redraw ───────────────────────────────────────────────────

  const redraw = useCallback(() => {
    compositeToDisplay(null);
  }, [compositeToDisplay]);

  const redrawDirty = useCallback(
    (x: number, y: number, w: number, h: number) => {
      if (w <= 0 || h <= 0) {
        compositeToDisplay(null);
        return;
      }

      if (redrawRequestRef.current !== null) {
        cancelAnimationFrame(redrawRequestRef.current);
        redrawRequestRef.current = null;
      }
      pendingDirtyRef.current = null;
      isFullRedrawRef.current = false;
      compositeToDisplay({ x, y, w, h });
    },
    [compositeToDisplay]
  );

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
        isFullRedrawRef.current = false;
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
      if (isFullRedrawRef.current && redrawRequestRef.current !== null) {
        return;
      }

      mergePendingDirtyRect(x, y, w, h);

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
    [mergePendingDirtyRect, compositeToDisplay]
  );

  // ─── Initialize layer canvases from document data ───────────────────

  useEffect(() => {
    const layerIds = new Set(doc.layers.map((l) => l.id));
    for (const [id] of layerCanvasesRef.current) {
      if (!layerIds.has(id)) {
        runtime.deleteLayerCanvas(id);
        hydratedLayerStateRef.current.delete(id);
      }
    }

    for (const layer of doc.layers) {
      const canvas = getOrCreateLayerCanvas(layer.id);
      if (canvas.width !== doc.canvas.width || canvas.height !== doc.canvas.height) {
        canvas.width = doc.canvas.width;
        canvas.height = doc.canvas.height;
      }
      const hydrationKey = layer.data ?? "";
      if (hydratedLayerStateRef.current.get(layer.id) === hydrationKey) {
        continue;
      }
      hydratedLayerStateRef.current.set(layer.id, hydrationKey);

      if (layer.data) {
        const img = new Image();
        const capturedKey = hydrationKey;
        img.onload = () => {
          if (hydratedLayerStateRef.current.get(layer.id) !== capturedKey) {
            return;
          }
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            requestRedraw();
          }
        };
        img.src = layer.data;
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          requestRedraw();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layerHydrationSignature,
    doc.canvas.width,
    doc.canvas.height,
    requestRedraw
  ]);

  useEffect(() => {
    requestRedraw();
  }, [requestRedraw, doc.layers]);

  // Cleanup rAF on unmount and dispose runtime
  useEffect(() => {
    return () => {
      if (redrawRequestRef.current !== null) {
        cancelAnimationFrame(redrawRequestRef.current);
      }
      runtime.dispose();
    };
  }, [runtime]);

  return {
    displayCanvasRef,
    overlayCanvasRef,
    layerCanvasesRef,
    runtime,
    backend,
    getOrCreateLayerCanvas,
    redraw,
    redrawDirty,
    requestRedraw,
    requestDirtyRedraw
  };
}
