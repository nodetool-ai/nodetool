/**
 * useExportSyncActions
 *
 * Handles export and output sync: PNG download and deferred image/mask export.
 *
 * ## Export sync boundary contract
 *
 * This hook uses a **deferred-flush pattern** so that export-heavy operations
 * (flatten → dataURL encoding) do not block the pointer/painting hot path:
 *
 * - **Stroke end**: Sets `pendingExportSyncRef.image = true` (and mask if
 *   applicable) but does NOT run the export. The export fires later via
 *   `flushPendingExportSync()`.
 * - **Undo/redo**: Calls `flushPendingExportSync()` before rewinding history
 *   so the parent receives the pre-undo snapshot.
 * - **Nudge session end**: Calls `syncSketchOutputsNow()` for immediate sync
 *   (keyboard arrow moves have no pointer-up to defer to).
 * - **Download**: `handleExportPng()` is a one-shot synchronous export.
 *
 * This pattern ensures that:
 * 1. `onExportImage` / `onExportMask` callbacks (from SketchNode) are never
 *    called during a gesture — only between gestures or on explicit flush.
 * 2. The export path does not subscribe to any store state. It reads from the
 *    imperative `canvasRef` which already holds the composited result.
 * 3. No broad store subscription is needed — the ref-based pending flag is
 *    the only coordination mechanism.
 */

import { useCallback, useRef, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";

export interface PendingExportSync {
  image: boolean;
  mask: boolean;
}

export interface UseExportSyncActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

export function useExportSyncActions({
  canvasRef,
  onExportImage,
  onExportMask
}: UseExportSyncActionsParams) {
  const pendingExportSyncRef = useRef<PendingExportSync>({
    image: false,
    mask: false
  });

  const flushPendingExportSync = useCallback(() => {
    const pending = pendingExportSyncRef.current;
    pendingExportSyncRef.current = { image: false, mask: false };

    if (!pending.image && !pending.mask) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (pending.image && onExportImage) {
      onExportImage(canvas.flattenToDataUrl());
    }
    if (pending.mask && onExportMask) {
      onExportMask(canvas.getMaskDataUrl());
    }
  }, [canvasRef, onExportImage, onExportMask]);

  /** Immediate PNG/mask sync to parent (used after keyboard nudge session ends). */
  const syncSketchOutputsNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (onExportImage) {
      onExportImage(canvas.flattenToDataUrl());
    }
    if (onExportMask) {
      onExportMask(canvas.getMaskDataUrl());
    }
  }, [canvasRef, onExportImage, onExportMask]);

  const handleExportPng = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    const dataUrl = canvasRef.current.flattenToDataUrl();
    if (!dataUrl) {
      return;
    }
    const link = window.document.createElement("a");
    link.download = "image-editor-export.png";
    link.href = dataUrl;
    link.click();
  }, [canvasRef]);

  return {
    pendingExportSyncRef,
    flushPendingExportSync,
    syncSketchOutputsNow,
    handleExportPng
  };
}
