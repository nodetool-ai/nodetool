/**
 * useTransformPreviewBridge
 *
 * Owns the transient transform-preview map and its redraw/invalidate policy.
 * Extracted from SketchCanvas so preview-map ownership, active-layer preview
 * bridging, and startup texture invalidation no longer live inline beside
 * compositing and pointer wiring.
 *
 * ## Boundary contract
 *
 * - `transformPreviewByLayerIdRef` is the canonical preview map used by
 *   compositing (via `useCompositing`).
 * - `requestPreviewRedrawRef` / `invalidateLayerRef` are wired to
 *   compositing after mount; the bridge writes through them.
 * - Active-layer preview bridging (`setActiveLayerTransformPreview` /
 *   `clearActiveLayerTransformPreview`) is delegated to the external-store
 *   module so transform UI consumers update without a compositing cascade.
 */

import { useCallback, useRef } from "react";
import type { LayerTransform } from "../types";
import {
  setActiveLayerTransformPreview,
  clearActiveLayerTransformPreview
} from "../activeLayerTransform";
import type { DisplayFrameCoordinator } from "./DisplayFrameCoordinator";

export interface UseTransformPreviewBridgeResult {
  /** Ref containing per-layer transform previews, consumed by compositing. */
  transformPreviewByLayerIdRef: React.MutableRefObject<Record<string, LayerTransform>>;
  /** Ref that must be wired to `requestRedraw` from compositing after mount. */
  requestPreviewRedrawRef: React.MutableRefObject<() => void>;
  /** Ref that must be wired to `invalidateLayer` from compositing after mount. */
  invalidateLayerRef: React.MutableRefObject<(layerId: string) => void>;
  /** Optional coordinator ref for typed redraw requests and tracing. */
  coordinatorRef?: React.MutableRefObject<DisplayFrameCoordinator | null>;
  /** Set a transform preview for a layer; bails if the value is identical. */
  setLayerTransformPreview: (layerId: string, transform: LayerTransform) => void;
  /** Clear one layer's preview (by id) or all previews (no argument). */
  clearLayerTransformPreview: (layerId?: string) => void;
}

export interface UseTransformPreviewBridgeParams {
  /** Optional coordinator ref for typed redraw requests and tracing. */
  coordinatorRef?: React.MutableRefObject<DisplayFrameCoordinator | null>;
}

export function useTransformPreviewBridge(
  params?: UseTransformPreviewBridgeParams
): UseTransformPreviewBridgeResult {
  const coordRef = params?.coordinatorRef;
  const transformPreviewByLayerIdRef = useRef<Record<string, LayerTransform>>({});
  const requestPreviewRedrawRef = useRef<() => void>(() => {});
  /**
   * Ref to the runtime's invalidateLayer — populated after useCompositing.
   * Used by setLayerTransformPreview to force-invalidate a layer's GPU
   * texture when the preview first activates, ensuring stale textures from
   * startup/image-load timing races are re-synced before compositing.
   */
  const invalidateLayerRef = useRef<(layerId: string) => void>(() => {});

  const setLayerTransformPreview = useCallback(
    (layerId: string, transform: LayerTransform) => {
      setActiveLayerTransformPreview({ layerId, transform });
      const current = transformPreviewByLayerIdRef.current;
      const existing = current[layerId];
      if (
        existing &&
        existing.x === transform.x &&
        existing.y === transform.y &&
        (existing.scaleX ?? 1) === (transform.scaleX ?? 1) &&
        (existing.scaleY ?? 1) === (transform.scaleY ?? 1) &&
        Math.abs((existing.rotation ?? 0) - (transform.rotation ?? 0)) < 1e-9
      ) {
        return;
      }
      // When a layer is first added to the preview map (start of a new drag),
      // force-invalidate its rendering data so the GPU texture is re-synced
      // from the CPU canvas. This prevents stale textures from startup timing
      // races where an image loaded after the initial GPU texture upload.
      if (!existing) {
        invalidateLayerRef.current(layerId);
      }
      transformPreviewByLayerIdRef.current = {
        ...current,
        [layerId]: transform
      };
      // Trace and route through coordinator if available.
      const coord = coordRef?.current;
      if (coord) {
        coord.tracer.trace("preview-set", { layerId });
        coord.requestFrame("transform-preview", "raf");
      } else {
        requestPreviewRedrawRef.current();
      }
    },
    [coordRef]
  );

  const clearLayerTransformPreview = useCallback(
    (layerId?: string) => {
      clearActiveLayerTransformPreview();
      const current = transformPreviewByLayerIdRef.current;
      if (layerId == null) {
        if (Object.keys(current).length === 0) {
          return;
        }
        transformPreviewByLayerIdRef.current = {};
        const coord = coordRef?.current;
        if (coord) {
          coord.tracer.trace("preview-cleared", { all: true });
          coord.requestFrame("transform-preview", "raf");
        } else {
          requestPreviewRedrawRef.current();
        }
        return;
      }
      if (!(layerId in current)) {
        return;
      }
      const next = { ...current };
      delete next[layerId];
      transformPreviewByLayerIdRef.current = next;
      const coord = coordRef?.current;
      if (coord) {
        coord.tracer.trace("preview-cleared", { layerId });
        coord.requestFrame("transform-preview", "raf");
      } else {
        requestPreviewRedrawRef.current();
      }
    },
    [coordRef]
  );

  return {
    transformPreviewByLayerIdRef,
    requestPreviewRedrawRef,
    invalidateLayerRef,
    setLayerTransformPreview,
    clearLayerTransformPreview
  };
}
