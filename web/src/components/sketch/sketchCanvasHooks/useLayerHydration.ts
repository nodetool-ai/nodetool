/**
 * useLayerHydration
 *
 * Synchronizes document layer data to off-screen canvases managed by the
 * runtime.  Owns the hydration state tracking refs and the two display
 * signatures used by the compositing trigger effects.
 */

import { useEffect, useRef } from "react";
import type { SketchDocument } from "../types";
import type { SketchRuntime } from "../rendering";
import { resolveAssetUri } from "../../../utils/resolveAssetUri";
import type { DisplayFrameCoordinator } from "./DisplayFrameCoordinator";

export interface UseLayerHydrationParams {
  doc: SketchDocument;
  runtime: SketchRuntime;
  layerCanvasesRef: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  /**
   * Ref to the runtime (allows reading stable raster sizes from a ref
   * that survives Canvas2D → WebGPU switches).
   */
  runtimeRef: React.MutableRefObject<SketchRuntime | null>;
  getOrCreateLayerCanvas: (layerId: string) => HTMLCanvasElement;
  invalidateLayer: (layerId: string) => void;
  requestRedraw: () => void;
  /** Optional coordinator ref for marking hydration readiness. */
  coordinatorRef?: React.MutableRefObject<DisplayFrameCoordinator | null>;
}

export interface UseLayerHydrationResult {
  layerHydrationSignature: string;
  layerDisplayStackSignature: string;
  /** Exposed so the orchestrator cleanup can clear hydrated state on unmount. */
  hydratedLayerStateRef: React.MutableRefObject<Map<string, string>>;
  /** Exposed so the orchestrator's `getOrCreateLayerCanvas` can read stable sizes. */
  layerStableRasterSizeRef: React.MutableRefObject<
    Map<string, { w: number; h: number }>
  >;
}

function resolveLayerHydrationSource(
  data: string | null | undefined,
  imageUri: string | null | undefined
): string | null {
  if (data) {
    return data;
  }
  return resolveAssetUri(imageUri);
}

export function useLayerHydration({
  doc,
  runtime,
  layerCanvasesRef,
  getOrCreateLayerCanvas,
  invalidateLayer,
  requestRedraw,
  coordinatorRef
}: UseLayerHydrationParams): UseLayerHydrationResult {
  const hydratedLayerStateRef = useRef<Map<string, string>>(new Map());
  const hydrationCycleRef = useRef(0);

  /**
   * Last known physical pixel size per layer raster (after setLayerData / decode).
   * Used when contentBounds omit width/height so document canvas resize does not
   * re-hydrate at the new doc size and stretch pixels.
   */
  const layerStableRasterSizeRef = useRef<
    Map<string, { w: number; h: number }>
  >(new Map());

  /**
   * Stable hydration key: must NOT include doc canvas size when width/height
   * are inferred from the document (resize would re-run setLayerData and stretch
   * pixels into a larger backing store).
   */
  const layerHydrationSignature = doc.layers
    .map((layer) => {
      const ref = layer.imageReference;
      const refKey = ref
        ? `${ref.uri}|${ref.objectFit}|${ref.naturalWidth}x${ref.naturalHeight}|${ref.sourceCrop ? `${ref.sourceCrop.x},${ref.sourceCrop.y},${ref.sourceCrop.width},${ref.sourceCrop.height}` : ""}`
        : "";
      const w =
        layer.contentBounds?.width != null
          ? String(layer.contentBounds.width)
          : "";
      const h =
        layer.contentBounds?.height != null
          ? String(layer.contentBounds.height)
          : "";
      return `${layer.id}:${layer.data ?? ""}:${refKey}:${layer.contentBounds?.x ?? 0}:${layer.contentBounds?.y ?? 0}:${w}:${h}`;
    })
    .join("|");

  /** Visibility / opacity / blend / type / order — drives display recomposite. */
  const layerDisplayStackSignature = doc.layers
    .map(
      (l) =>
        `${l.id}:${l.visible ? 1 : 0}:${l.opacity}:${String(l.blendMode ?? "normal")}:${l.type}`
    )
    .join("|");

  // ─── Initialize layer canvases from document data ───────────────────

  useEffect(() => {
    hydrationCycleRef.current += 1;
    const cycleId = hydrationCycleRef.current;
    const layerIds = new Set(doc.layers.map((l) => l.id));
    for (const [id] of layerCanvasesRef.current) {
      if (!layerIds.has(id)) {
        runtime.deleteLayerCanvas(id);
        hydratedLayerStateRef.current.delete(id);
        layerStableRasterSizeRef.current.delete(id);
      }
    }

    const hydrationJobs: Array<{
      layerId: string;
      hydrationKey: string;
      source: string | null;
      defaultBounds: { x: number; y: number; width: number; height: number };
    }> = [];

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
      hydrationJobs.push({
        layerId: layer.id,
        hydrationKey,
        source: resolveLayerHydrationSource(layer.data, layer.imageReference?.uri),
        defaultBounds
      });
    }

    if (hydrationJobs.length === 0) {
      coordinatorRef?.current?.markHydrationComplete();
      return;
    }
    coordinatorRef?.current?.markHydrationScheduled();
    const pendingHydrationLayerIds = new Set(
      hydrationJobs.map((job) => job.layerId)
    );

    for (const job of hydrationJobs) {
      runtime.setLayerData(
        job.layerId,
        job.source,
        job.defaultBounds,
        () => {
          // Ignore callbacks from a prior hydration cycle so stale async image
          // decodes cannot complete the current startup path.
          if (hydrationCycleRef.current !== cycleId) {
            return;
          }
          if (
            hydratedLayerStateRef.current.get(job.layerId) !== job.hydrationKey
          ) {
            return;
          }
          if (!pendingHydrationLayerIds.has(job.layerId)) {
            return;
          }
          const lc = layerCanvasesRef.current.get(job.layerId);
          if (lc != null && lc.width > 0 && lc.height > 0) {
            layerStableRasterSizeRef.current.set(job.layerId, {
              w: lc.width,
              h: lc.height
            });
          }
          invalidateLayer(job.layerId);
          requestRedraw();
          pendingHydrationLayerIds.delete(job.layerId);
          if (pendingHydrationLayerIds.size === 0) {
            coordinatorRef?.current?.markHydrationComplete();
          }
        }
      );
    }
    // Intentionally omit doc.canvas.width/height: canvas resize must not
    // re-hydrate layers (that called setLayerData with new doc bounds and
    // stretched rasters). Redraw is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerHydrationSignature, requestRedraw]);

  return {
    layerHydrationSignature,
    layerDisplayStackSignature,
    hydratedLayerStateRef,
    layerStableRasterSizeRef
  };
}
