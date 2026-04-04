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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LayerTransform, SketchDocument } from "../types";
import type { SketchRuntime, DirtyRect } from "../rendering";
import { Canvas2DRuntime, createRuntime, isWebGPUAvailable } from "../rendering";

// Re-export so existing consumers keep compiling.
export type { ActiveStrokeInfo } from "../rendering";
// Re-import the value-level type for use in this file.
import type { ActiveStrokeInfo } from "../rendering";

export interface UseCompositingParams {
  doc: SketchDocument;
  zoom?: number;
  isolatedLayerId?: string | null;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  transformPreviewByLayerId?: Record<string, LayerTransform>;
}

export interface UseCompositingResult {
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Temporary 2D display target while WebGPU is initializing (keeps canvas visible). */
  bootstrapDisplayRef: React.RefObject<HTMLCanvasElement | null>;
  /** True when compositing to `bootstrapDisplayRef` instead of the WebGPU display canvas. */
  bootstrapPhaseActive: boolean;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  /** The underlying rendering runtime (for imperative handle access). */
  runtime: SketchRuntime;
  /** Which rendering backend is active: "webgpu" | "canvas2d" */
  backend: "webgpu" | "canvas2d";
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer: (layerId: string) => void;
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  /** Schedule a partial redraw over only the changed region (faster for large canvases). */
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;
  /**
   * Run any deferred stroke merge immediately (same as start of compositing rAF).
   * Needed before layer snapshots e.g. undo history, when the next stroke starts
   * before the scheduled rAF has fired.
   */
  drainPendingStrokeCommit: () => void;
}

export function useCompositing({
  doc,
  zoom: externalZoom = 1,
  isolatedLayerId,
  activeStrokeRef,
  transformPreviewByLayerId = {}
}: UseCompositingParams): UseCompositingResult {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const bootstrapDisplayRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const redrawRequestRef = useRef<number | null>(null);
  /** Pending dirty rect. Null means full redraw. */
  const pendingDirtyRef = useRef<DirtyRect | null>(null);
  const isFullRedrawRef = useRef(false);
  const hydratedLayerStateRef = useRef<Map<string, string>>(new Map());
  /**
   * Last known physical pixel size per layer raster (after setLayerData / decode).
   * Used when contentBounds omit width/height so document canvas resize does not
   * re-hydrate at the new doc size and stretch pixels (see layerHydrationSignature).
   * Survives before the user paints — unlike reading from an in-memory canvas that
   * may not exist yet on the first tick.
   */
  const layerStableRasterSizeRef = useRef<Map<string, { w: number; h: number }>>(
    new Map()
  );
  /**
   * While true and WebGPU is exposed by the browser, we composite with Canvas2D
   * onto `bootstrapDisplayRef` so the editor is not blank during async init.
   * The real display canvas stays free of a "2d" context until WebGPU is ready
   * or we fall back to Canvas2D on that element.
   */
  const [webgpuBootstrapPending, setWebgpuBootstrapPending] = useState(
    () => isWebGPUAvailable()
  );
  const bootstrapPhaseActive =
    webgpuBootstrapPending && isWebGPUAvailable();
  const transformPreviewSignature = Object.entries(transformPreviewByLayerId)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([layerId, transform]) =>
        `${layerId}:${transform.x},${transform.y},${transform.scaleX ?? 1},${transform.scaleY ?? 1},${transform.rotation ?? 0}`
    )
    .join("|");

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

  // Keep zoom in sync on the runtime so the checkerboard pattern
  // can maintain a constant visual size regardless of the zoom level.
  // Both Canvas2DRuntime and WebGPURuntime expose a `zoom` property.
  const rt = runtimeRef.current as { zoom?: number };
  if (typeof rt.zoom === "number") {
    rt.zoom = externalZoom;
  }

  // Try to upgrade to WebGPU on mount
  useEffect(() => {
    let cancelled = false;

    /**
     * Attempt to re-initialize WebGPU after device loss. On success, swap the
     * runtime back to WebGPU. On failure, stay on Canvas2D (no further retries).
     *
     * Lifecycle rules (Phase 3A — Async Tool Lifecycle / device-loss recovery):
     * - If the component unmounts (`cancelled`) before recovery completes, the
     *   new runtime is discarded.
     * - Layer canvases are shared (DI'd via `layerCanvasesRef`), so switching
     *   runtimes doesn't lose pixel data.
     * - A single retry is attempted; exponential backoff or repeated retries
     *   are not worth the complexity for a rare event.
     */
    const attemptWebGPURecovery = () => {
      if (cancelled) {
        return;
      }
      // Wait a short time before attempting recovery so the GPU driver has time
      // to reset. 1 second is a conservative delay.
      const RECOVERY_DELAY_MS = 1000;
      setTimeout(() => {
        if (cancelled) {
          return;
        }
        console.info("[Sketch] Attempting WebGPU re-initialization after device loss…");
        createRuntime(layerCanvasesRef.current, handleDeviceLost).then(
          ({ runtime: recoveredRuntime, backend: recoveredBackend }) => {
            if (cancelled) {
              // Discarding recovered runtime — component unmounted during recovery
              return;
            }
            if (recoveredBackend === "webgpu") {
              console.info("[Sketch] WebGPU recovered successfully");
              runtimeRef.current = recoveredRuntime;
              setBackend("webgpu");
              for (const layerId of layerCanvasesRef.current.keys()) {
                recoveredRuntime.invalidateLayer(layerId);
              }
              requestAnimationFrame(() => {
                if (!cancelled) {
                  requestRedraw();
                }
              });
            } else {
              // Recovery returned Canvas2D fallback — staying on current Canvas2D runtime
              console.warn("[Sketch] WebGPU recovery failed — staying on Canvas2D");
            }
          }
        );
      }, RECOVERY_DELAY_MS);
    };

    // Device-loss handler: immediately fall back to Canvas2D, then try to
    // recover WebGPU in the background.
    // (e.g. driver crash, tab backgrounded on some platforms, GPU memory pressure).
    const handleDeviceLost = () => {
      if (cancelled) {
        return;
      }
      console.warn("[Sketch] WebGPU device lost — falling back to Canvas2D");
      const fallback = new Canvas2DRuntime(layerCanvasesRef.current);
      runtimeRef.current = fallback;
      setBackend("canvas2d");
      // Schedule a redraw on the next frame so the Canvas2D runtime composites
      requestAnimationFrame(() => {
        if (!cancelled) {
          requestRedraw();
        }
      });
      // Attempt to recover WebGPU after a short delay
      attemptWebGPURecovery();
    };

    createRuntime(layerCanvasesRef.current, handleDeviceLost).then(({ runtime: newRuntime, backend: newBackend }) => {
      if (cancelled) {
        // Don't dispose: Canvas2DRuntime.dispose() clears the shared layerCanvases map.
        void newRuntime;
        return;
      }
      setWebgpuBootstrapPending(false);

      if (newBackend === "webgpu" && runtimeRef.current !== newRuntime) {
        // Switch to WebGPU. setBackend triggers a re-render which recreates
        // compositeToDisplay with the new runtime; effects also request a redraw.
        const oldRuntime = runtimeRef.current;
        runtimeRef.current = newRuntime;
        setBackend(newBackend);
        // Cold WebGPU: layerTextures start empty; mark every CPU canvas dirty so the
        // first present uploads all layers (avoids blank/move preview until a paint).
        for (const layerId of layerCanvasesRef.current.keys()) {
          newRuntime.invalidateLayer(layerId);
        }
        // Don't dispose old runtime — it shares the same layerCanvases map.
        void oldRuntime;
        // Defer one frame so React has committed (bootstrap off, display canvas
        // visible) before the first WebGPU configure + present.
        requestAnimationFrame(() => {
          if (!cancelled) {
            requestRedraw();
          }
        });
      } else {
        // Canvas2D fallback (WebGPU not available or init failed).
        // Don't dispose newRuntime for the same reason (shared map).
        void newRuntime;
        // setBackend("canvas2d") would be a no-op, so manually trigger the
        // first render now that bootstrap phase has ended.
        requestRedraw();
      }
    });

    return () => {
      cancelled = true;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Stable hydration key: must NOT include doc canvas size when width/height
   * are inferred from the document (resize would re-run setLayerData and stretch
   * pixels into a larger backing store). Only explicit layer.contentBounds size
   * participates in the signature; missing dims use "".
   */
  const layerHydrationSignature = doc.layers
    .map((layer) => {
      const ref = layer.imageReference;
      const refKey = ref
        ? `${ref.uri}|${ref.objectFit}|${ref.naturalWidth}x${ref.naturalHeight}|${ref.sourceCrop ? `${ref.sourceCrop.x},${ref.sourceCrop.y},${ref.sourceCrop.width},${ref.sourceCrop.height}` : ""}`
        : "";
      const w =
        layer.contentBounds?.width != null ? String(layer.contentBounds.width) : "";
      const h =
        layer.contentBounds?.height != null ? String(layer.contentBounds.height) : "";
      return `${layer.id}:${layer.data ?? ""}:${refKey}:${layer.contentBounds?.x ?? 0}:${layer.contentBounds?.y ?? 0}:${w}:${h}`;
    })
    .join("|");

  /** Visibility / opacity / blend / type / order — drives display recomposite (hydration sig omits these). */
  const layerDisplayStackSignature = doc.layers
    .map(
      (l) =>
        `${l.id}:${l.visible ? 1 : 0}:${l.opacity}:${String(l.blendMode ?? "normal")}:${l.type}`
    )
    .join("|");

  // ─── Layer Canvas Management ────────────────────────────────────────

  const getOrCreateLayerCanvas = useCallback(
    (layerId: string): HTMLCanvasElement => {
      const layer = doc.layers.find((entry) => entry.id === layerId);
      const existing = layerCanvasesRef.current.get(layerId);
      const stable = layerStableRasterSizeRef.current.get(layerId);
      const width = Math.max(
        1,
        layer?.contentBounds?.width ??
          stable?.w ??
          (existing && existing.width > 0 ? existing.width : doc.canvas.width)
      );
      const height = Math.max(
        1,
        layer?.contentBounds?.height ??
          stable?.h ??
          (existing && existing.height > 0 ? existing.height : doc.canvas.height)
      );
      // Always read from runtimeRef so we never hold a stale Canvas2D
      // reference after the WebGPU upgrade.
      return runtimeRef.current!.getOrCreateLayerCanvas(
        layerId,
        width,
        height
      );
    },
    [doc.layers, doc.canvas.width, doc.canvas.height]
  );

  const invalidateLayer = useCallback((layerId: string) => {
    runtimeRef.current?.invalidateLayer(layerId);
  }, []);

  // ─── Compositing helpers ────────────────────────────────────────────

  /** Composite layers into display canvas, optionally clipped to a dirty rect. */
  const compositeToDisplay = useCallback(
    (dirtyRect?: DirtyRect | null) => {
      const displayCanvas = displayCanvasRef.current;
      const bootstrapCanvas = bootstrapDisplayRef.current;
      let targetCanvas: HTMLCanvasElement | null;
      if (bootstrapPhaseActive) {
        // Never acquire "2d" on the real display canvas during bootstrap — that
        // would prevent WebGPU from using it later.
        if (!bootstrapCanvas) {
          return;
        }
        targetCanvas = bootstrapCanvas;
      } else {
        targetCanvas = displayCanvas;
      }
      if (!targetCanvas) {
        return;
      }
      // Always read the runtime from the ref so that stale closures (e.g. an
      // img.onload captured before the WebGPU upgrade) still end up calling
      // the current runtime instead of the old Canvas2DRuntime.
      const rt = runtimeRef.current;
      if (!rt) {
        return;
      }
      const hasTransformPreview = Object.keys(transformPreviewByLayerId).length > 0;
      const compositeDoc = hasTransformPreview
        ? {
            ...doc,
            layers: doc.layers.map((layer) => {
              const previewTransform = transformPreviewByLayerId[layer.id];
              return previewTransform ? { ...layer, transform: previewTransform } : layer;
            })
          }
        : doc;
      const activeStroke = activeStrokeRef.current;
      rt.compositeToDisplay(
        targetCanvas,
        compositeDoc,
        isolatedLayerId ?? null,
        activeStroke,
        dirtyRect
      );
    },
    // Include `backend` so that this callback (and the redraw/requestRedraw
    // functions derived from it) is recreated when the backend switches to
    // WebGPU, which causes the [requestRedraw, doc.layers] effect to fire and
    // trigger the first WebGPU frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      doc,
      isolatedLayerId,
      activeStrokeRef,
      backend,
      bootstrapPhaseActive,
      transformPreviewByLayerId
    ]
  );

  // rAF callbacks must not close over a stale `compositeToDisplay` — e.g. a frame
  // queued during WebGPU bootstrap may run after `bootstrapPhaseActive` flips,
  // and would otherwise paint only onto the hidden bootstrap canvas.
  const compositeToDisplayRef = useRef(compositeToDisplay);
  compositeToDisplayRef.current = compositeToDisplay;

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
      // Brush/eraser use a stroke buffer (activeStrokeRef). Clipped composites
      // only repaint a sub-rect; merging layer+buffer for the active layer then
      // stacks incorrectly with the rest of the frame and reads as washed-out /
      // wrong layer opacity. Pencil is "direct" and keeps dirty redraws.
      if (activeStrokeRef.current != null) {
        compositeToDisplay(null);
        return;
      }
      compositeToDisplay({ x, y, w, h });
    },
    [compositeToDisplay, activeStrokeRef]
  );

  const drainPendingStrokeCommit = useCallback(() => {
    const stroke = activeStrokeRef.current;
    const pending = stroke?.pendingCommit;
    if (pending) {
      stroke!.pendingCommit = null;
      pending();
    }
  }, [activeStrokeRef]);

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
        // Drain any pending stroke buffer merge BEFORE compositing.
        // This defers the GPU→CPU drawImage stall out of the pointer-up
        // handler so the cursor is never blocked by it.
        drainPendingStrokeCommit();
        compositeToDisplayRef.current(null);
      });
    }
  }, [drainPendingStrokeCommit]);

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

          // Drain pending stroke buffer merge before compositing.
          drainPendingStrokeCommit();

          const liveBufferedStroke = activeStrokeRef.current != null;
          if (isFull || !dirty || liveBufferedStroke) {
            compositeToDisplayRef.current(null);
          } else {
            compositeToDisplayRef.current(dirty);
          }
        });
      }
    },
    [mergePendingDirtyRect, activeStrokeRef, drainPendingStrokeCommit]
  );

  // ─── Initialize layer canvases from document data ───────────────────

  useEffect(() => {
    const layerIds = new Set(doc.layers.map((l) => l.id));
    for (const [id] of layerCanvasesRef.current) {
      if (!layerIds.has(id)) {
        runtime.deleteLayerCanvas(id);
        hydratedLayerStateRef.current.delete(id);
        layerStableRasterSizeRef.current.delete(id);
      }
    }

    for (const layer of doc.layers) {
      const existingRaster = layerCanvasesRef.current.get(layer.id);
      const stableSz = layerStableRasterSizeRef.current.get(layer.id);
      const rasterWidth = Math.max(
        1,
        layer.contentBounds?.width ??
          stableSz?.w ??
          (existingRaster && existingRaster.width > 0
            ? existingRaster.width
            : doc.canvas.width)
      );
      const rasterHeight = Math.max(
        1,
        layer.contentBounds?.height ??
          stableSz?.h ??
          (existingRaster && existingRaster.height > 0
            ? existingRaster.height
            : doc.canvas.height)
      );
      const defaultBounds = {
        x: Math.round(layer.contentBounds?.x ?? 0),
        y: Math.round(layer.contentBounds?.y ?? 0),
        width: rasterWidth,
        height: rasterHeight
      };
      const ref = layer.imageReference;
      const refKey = ref
        ? `${ref.uri}|${ref.objectFit}|${ref.naturalWidth}x${ref.naturalHeight}|${ref.sourceCrop ? `${ref.sourceCrop.x},${ref.sourceCrop.y},${ref.sourceCrop.width},${ref.sourceCrop.height}` : ""}`
        : "";
      const hydrationKey = `${layer.data ?? ""}:${refKey}:${defaultBounds.x}:${defaultBounds.y}:${defaultBounds.width}:${defaultBounds.height}`;
      if (hydratedLayerStateRef.current.get(layer.id) === hydrationKey) {
        const ex = layerCanvasesRef.current.get(layer.id);
        if (ex != null && ex.width > 0 && ex.height > 0) {
          layerStableRasterSizeRef.current.set(layer.id, {
            w: ex.width,
            h: ex.height
          });
        }
        continue;
      }
      hydratedLayerStateRef.current.set(layer.id, hydrationKey);
      layerStableRasterSizeRef.current.set(layer.id, {
        w: defaultBounds.width,
        h: defaultBounds.height
      });
      getOrCreateLayerCanvas(layer.id);
      runtime.setLayerData(layer.id, layer.data ?? null, defaultBounds, () => {
        if (hydratedLayerStateRef.current.get(layer.id) !== hydrationKey) {
          return;
        }
        const lc = layerCanvasesRef.current.get(layer.id);
        if (lc != null && lc.width > 0 && lc.height > 0) {
          layerStableRasterSizeRef.current.set(layer.id, {
            w: lc.width,
            h: lc.height
          });
        }
        invalidateLayer(layer.id);
        requestRedraw();
      });
    }
    // Intentionally omit doc.canvas.width/height: canvas resize must not
    // re-hydrate layers (that called setLayerData with new doc bounds and
    // stretched rasters). Redraw is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerHydrationSignature, requestRedraw]);

  useEffect(() => {
    requestRedraw();
  }, [
    requestRedraw,
    doc.layers,
    doc.canvas.width,
    doc.canvas.height,
    layerDisplayStackSignature,
    isolatedLayerId,
    bootstrapPhaseActive,
    backend,
    transformPreviewSignature
  ]);

  // After DOM commit, `<canvas>` refs are set; compositing effects may have run
  // in the same tick with null refs. Synchronous composite before the browser
  // paints so the very first frame shows layer content instead of a blank canvas.
  useLayoutEffect(() => {
    compositeToDisplayRef.current(null);
  }, [bootstrapPhaseActive, backend]);

  // Redraw when zoom changes so the checkerboard pattern rescales.
  useEffect(() => {
    requestRedraw();
  }, [externalZoom, requestRedraw]);

  // Cleanup rAF and dispose runtime only on **unmount**, not when `runtime`
  // identity changes. Upgrading Canvas2D → WebGPU swaps `runtimeRef` but keeps
  // the same `layerCanvases` map; disposing the old Canvas2DRuntime clears that
  // map and wipes hydrated pixels while `hydratedLayerStateRef` still says
  // "synced" — blank canvas until something forces a repaint (e.g. a click).
  useEffect(() => {
    const hydratedState = hydratedLayerStateRef.current;
    return () => {
      if (redrawRequestRef.current !== null) {
        cancelAnimationFrame(redrawRequestRef.current);
      }
      hydratedState.clear();
      runtimeRef.current?.dispose();
    };
  }, []);

  return {
    displayCanvasRef,
    bootstrapDisplayRef,
    bootstrapPhaseActive,
    overlayCanvasRef,
    layerCanvasesRef,
    runtime,
    backend,
    getOrCreateLayerCanvas,
    invalidateLayer,
    redraw,
    redrawDirty,
    requestRedraw,
    requestDirtyRedraw,
    drainPendingStrokeCommit
  };
}
