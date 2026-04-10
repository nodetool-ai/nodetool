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
 *
 * Orchestrates four focused sub-hooks:
 *   useRuntimeBootstrap        – WebGPU init / fallback / device-loss
 *   useTransformPreviewComposite – compositeToDisplay callback
 *   useRedrawScheduler          – rAF batching, dirty-rect merging
 *   useLayerHydration           – doc → layer canvas sync
 *
 * ## State-tier ownership (Package A contract)
 *
 * This hook coordinates compositing — it is the *consumer* of state, not the
 * owner. The ownership tiers are:
 *
 * | Tier                | Source                          | How compositing uses it                |
 * |---------------------|---------------------------------|----------------------------------------|
 * | Document state      | `doc` prop (from store)         | Layer tree, visibility, opacity, effects |
 * | Transform previews  | `transformPreviewByLayerId`     | Applied via `applyTransformPreviews` in compositing callback; never persisted |
 * | Live layer canvases | `layerCanvasesRef` (runtime)    | Pixel source for compositing           |
 * | Active stroke       | `activeStrokeRef`               | Overlaid onto layer during composite   |
 * | Resolved output     | `evaluateLayerEffects` (runtime)| FX applied per-layer before compositing |
 *
 * ### Key invariants
 * - Preview transforms are applied *only* during the compositing callback
 *   via the shared `applyTransformPreviews` contract. They create a
 *   temporary document snapshot; the original `doc` is never mutated.
 * - The compositing callback must never write back to document state,
 *   preview state, or layer canvases. It is a pure display path.
 * - Export/readback paths (`flattenToDataUrl`, `readbackComposite`)
 *   use the same `renderDocumentComposite` pipeline as display, minus
 *   the display chrome (checkerboard, border). This ensures parity.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { LayerTransform, SketchDocument } from "../types";
import type { DirtyRect } from "../rendering";

// Re-export so existing consumers keep compiling.
export type { ActiveStrokeInfo } from "../rendering";
// Re-import the value-level type for use in this file.
import type { ActiveStrokeInfo } from "../rendering";

import { useRuntimeBootstrap } from "./useRuntimeBootstrap";
import { useTransformPreviewComposite } from "./useTransformPreviewComposite";
import { useRedrawScheduler } from "./useRedrawScheduler";
import { useLayerHydration } from "./useLayerHydration";
import { DisplayFrameCoordinator } from "./DisplayFrameCoordinator";

export interface UseCompositingParams {
  doc: SketchDocument;
  zoom?: number;
  isolatedLayerId?: string | null;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  transformPreviewByLayerIdRef?: React.MutableRefObject<Record<string, LayerTransform>>;
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
  /** The shared display frame coordinator for typed redraw requests and readiness tracking. */
  coordinatorRef: React.MutableRefObject<DisplayFrameCoordinator | null>;
}

import type { SketchRuntime } from "../rendering";

export function useCompositing({
  doc,
  zoom: externalZoom = 1,
  isolatedLayerId,
  activeStrokeRef,
  transformPreviewByLayerIdRef
}: UseCompositingParams): UseCompositingResult {
  // ─── Shared refs ───────────────────────────────────────────────────
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const bootstrapDisplayRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // ─── Display frame coordinator ─────────────────────────────────────
  const coordinatorRef = useRef<DisplayFrameCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new DisplayFrameCoordinator();
  }

  // Ref bridges for circular dependencies:
  // • bootstrap reads requestRedrawRef.current to trigger redraws after init
  // • scheduler reads compositeToDisplayRef.current in rAF callbacks
  const requestRedrawRef = useRef<() => void>(() => {});
  const compositeToDisplayRef = useRef<(dirtyRect?: DirtyRect | null) => void>(
    () => {}
  );

  // ─── 1. Runtime bootstrap (WebGPU init / fallback) ─────────────────
  const { runtimeRef, runtime, backend, bootstrapPhaseActive } =
    useRuntimeBootstrap({
      layerCanvasesRef,
      requestRedrawRef,
      externalZoom
    });

  // Sync coordinator with runtime/backend state.
  const coord = coordinatorRef.current;
  if (coord) {
    coord.markRuntimeReady();
    coord.setBackend(backend);
    coord.setDisplayTarget(bootstrapPhaseActive ? "bootstrap" : "display");
  }

  // ─── 2. Transform-preview composite callback ──────────────────────
  const { compositeToDisplay } =
    useTransformPreviewComposite({
      doc,
      transformPreviewByLayerIdRef,
      runtimeRef,
      displayCanvasRef,
      bootstrapDisplayRef,
      bootstrapPhaseActive,
      isolatedLayerId,
      activeStrokeRef,
      backend
    });

  // Keep the ref in sync so rAF callbacks always use the latest composite fn.
  compositeToDisplayRef.current = compositeToDisplay;

  // ─── 3. Redraw scheduler (rAF batching / dirty rects) ─────────────
  const {
    redrawRequestRef,
    redraw,
    redrawDirty,
    requestRedraw,
    requestDirtyRedraw,
    drainPendingStrokeCommit
  } = useRedrawScheduler({
    compositeToDisplay,
    compositeToDisplayRef,
    activeStrokeRef,
    coordinatorRef
  });

  // Wire coordinator callbacks so it can drain strokes and composite.
  if (coordinatorRef.current) {
    coordinatorRef.current.setCallbacks({
      drainPendingStroke: () => {
        const stroke = activeStrokeRef.current;
        const pending = stroke?.pendingCommit;
        if (pending) {
          stroke!.pendingCommit = null;
          pending();
        }
      },
      compositeImmediate: (dirtyRect) => {
        compositeToDisplayRef.current(dirtyRect ?? null);
      }
    });
  }

  // Keep the ref in sync so bootstrap can call requestRedraw after init.
  requestRedrawRef.current = requestRedraw;

  // ─── 4. Layer canvas management (orchestrator-owned) ───────────────

  // getOrCreateLayerCanvas needs layerStableRasterSizeRef which is created by
  // useLayerHydration below.  Since it reads the ref at call-time (not at
  // definition-time) we forward-declare the ref holder here and assign it
  // after calling useLayerHydration.
  const layerStableRasterSizeRefHolder = useRef<
    React.MutableRefObject<Map<string, { w: number; h: number }>> | null
  >(null);

  const getOrCreateLayerCanvas = useCallback(
    (layerId: string): HTMLCanvasElement => {
      const layer = doc.layers.find((entry) => entry.id === layerId);
      const existing = layerCanvasesRef.current.get(layerId);
      const stable = layerStableRasterSizeRefHolder.current?.current.get(layerId);
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
          (existing && existing.height > 0
            ? existing.height
            : doc.canvas.height)
      );
      return runtimeRef.current!.getOrCreateLayerCanvas(
        layerId,
        width,
        height
      );
    },
    [doc.layers, doc.canvas.width, doc.canvas.height, runtimeRef]
  );

  const invalidateLayer = useCallback(
    (layerId: string) => {
      runtimeRef.current?.invalidateLayer(layerId);
    },
    [runtimeRef]
  );

  // ─── 5. Layer hydration (doc → layer canvas sync) ──────────────────
  const {
    layerHydrationSignature,
    layerDisplayStackSignature,
    hydratedLayerStateRef,
    layerStableRasterSizeRef
  } = useLayerHydration({
    doc,
    runtime,
    layerCanvasesRef,
    runtimeRef,
    getOrCreateLayerCanvas,
    invalidateLayer,
    requestRedraw
  });

  // Wire up the forward-declared ref so getOrCreateLayerCanvas can reach it.
  layerStableRasterSizeRefHolder.current = layerStableRasterSizeRef;

  // ─── Trigger effects ───────────────────────────────────────────────

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
    backend
  ]);

  // After DOM commit, `<canvas>` refs are set; compositing effects may have run
  // in the same tick with null refs. Synchronous composite before the browser
  // paints so the very first frame shows layer content instead of a blank canvas.
  useLayoutEffect(() => {
    compositeToDisplayRef.current(null);
  }, [bootstrapPhaseActive, backend]);

  useEffect(() => {
    requestRedraw();
  }, [externalZoom, requestRedraw]);

  // ─── Cleanup ───────────────────────────────────────────────────────
  // Cleanup rAF and dispose runtime only on **unmount**, not when `runtime`
  // identity changes.
  useEffect(() => {
    const hydratedState = hydratedLayerStateRef.current;
    const coordInstance = coordinatorRef.current;
    return () => {
      if (redrawRequestRef.current !== null) {
        cancelAnimationFrame(redrawRequestRef.current);
      }
      hydratedState.clear();
      runtimeRef.current?.dispose();
      coordInstance?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    drainPendingStrokeCommit,
    coordinatorRef
  };
}
