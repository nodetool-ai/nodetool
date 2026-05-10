/**
 * useStrokeLifecycleActions
 *
 * Handles gesture start/end and deferred stroke finalization (thumbnail flush).
 */

import { useCallback, useRef, type MutableRefObject, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import {
  isTransformOnlyTool,
  type LayerContentBounds,
  type PushHistoryOptions,
  type SketchDocument,
  type SketchTool
} from "../types";
import type { PendingExportSync } from "./useExportSyncActions";
import type { StrokeEndOptions } from "../tools/types";

export interface PendingStrokeFinalize {
  hasSnapshot: boolean;
  data: string | null;
  committedBounds?: LayerContentBounds | null;
}

export interface UseStrokeLifecycleActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  activeTool: SketchTool;
  interactionTool: SketchTool;
  pushHistory: (
    label: string,
    layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>,
    options?: PushHistoryOptions
  ) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  setLayerContentBounds: (
    layerId: string,
    contentBounds: LayerContentBounds
  ) => void;
  pendingExportSyncRef: MutableRefObject<PendingExportSync>;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

export function useStrokeLifecycleActions({
  canvasRef,
  document,
  activeTool,
  interactionTool,
  pushHistory,
  updateLayerData,
  setLayerContentBounds,
  pendingExportSyncRef,
  onExportImage,
  onExportMask
}: UseStrokeLifecycleActionsParams) {
  const pendingStrokeFinalizeRef = useRef<Map<string, PendingStrokeFinalize>>(
    new Map()
  );
  const layerThumbIdleFlushScheduledRef = useRef(false);

  const commitPixelLayerChange = useCallback(
    (layerId: string, data: string | null, bounds?: LayerContentBounds) => {
      updateLayerData(layerId, data);
      if (bounds) {
        setLayerContentBounds(layerId, bounds);
      }
    },
    [updateLayerData, setLayerContentBounds]
  );

  const syncPixelLayerFromCanvas = useCallback(
    (layerId: string, bounds?: LayerContentBounds) => {
      const data = canvasRef.current?.getLayerData(layerId) ?? null;
      commitPixelLayerChange(layerId, data, bounds);
      return data;
    },
    [canvasRef, commitPixelLayerChange]
  );

  const flushPendingStrokeFinalization = useCallback(() => {
    const pendingEntries = Array.from(
      pendingStrokeFinalizeRef.current.entries()
    );
    pendingStrokeFinalizeRef.current.clear();

    if (pendingEntries.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    for (const [layerId, pending] of pendingEntries) {
      const nextData = pending.hasSnapshot
        ? pending.data
        : canvas?.getLayerData(layerId) ?? null;
      updateLayerData(layerId, nextData);
      if (pending.committedBounds) {
        setLayerContentBounds(layerId, pending.committedBounds);
      }
    }
  }, [canvasRef, updateLayerData, setLayerContentBounds]);

  const flushLayerThumbnailsWhenIdle = useCallback(() => {
    if (layerThumbIdleFlushScheduledRef.current) {
      return;
    }
    layerThumbIdleFlushScheduledRef.current = true;
    const run = () => {
      layerThumbIdleFlushScheduledRef.current = false;
      flushPendingStrokeFinalization();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => run(), { timeout: 1500 });
    } else {
      window.setTimeout(run, 0);
    }
  }, [flushPendingStrokeFinalization]);

  const handleStrokeStart = useCallback(() => {
    canvasRef.current?.drainPendingStrokeCommit();
    const activeLayerId = document.activeLayerId;
    const isTransformOnlyGesture = isTransformOnlyTool(interactionTool);
    const activeLayerSnapshot =
      activeLayerId && canvasRef.current
        ? canvasRef.current.snapshotLayerCanvas(activeLayerId)
        : null;

    const actionLabel = isTransformOnlyGesture
      ? "move layer"
      : `${activeTool} stroke`;
    const layerSnapshots = activeLayerId
      ? { [activeLayerId]: activeLayerSnapshot }
      : undefined;

    // Push synchronously so the checkpoint is ordered before any deferred
    // stroke merge / next gesture — deferring with rAF allowed two strokes to
    // share one undo entry when the next stroke started in the same frame.
    pushHistory(
      actionLabel,
      layerSnapshots,
      isTransformOnlyGesture ? { restoreMode: "structure-only" } : undefined
    );
  }, [
    document.activeLayerId,
    canvasRef,
    pushHistory,
    activeTool,
    interactionTool
  ]);

  const handleStrokeEnd = useCallback(
    (
      layerId: string,
      data: string | null,
      committedBounds?: LayerContentBounds,
      options?: StrokeEndOptions
    ) => {
      if (onExportImage) {
        pendingExportSyncRef.current.image = true;
      }
      if (onExportMask) {
        pendingExportSyncRef.current.mask = true;
      }

      if (data !== null) {
        commitPixelLayerChange(layerId, data, committedBounds);
        pendingStrokeFinalizeRef.current.set(layerId, {
          hasSnapshot: true,
          data
        });
        return;
      }

      if (options?.syncDocumentFromCanvas === false) {
        return;
      }

      pendingStrokeFinalizeRef.current.set(layerId, {
        hasSnapshot: false,
        data: null,
        committedBounds: committedBounds ?? null
      });
    },
    [onExportImage, onExportMask, pendingExportSyncRef, commitPixelLayerChange]
  );

  return {
    pendingStrokeFinalizeRef,
    flushPendingStrokeFinalization,
    flushLayerThumbnailsWhenIdle,
    handleStrokeStart,
    handleStrokeEnd,
    commitPixelLayerChange,
    syncPixelLayerFromCanvas
  };
}
