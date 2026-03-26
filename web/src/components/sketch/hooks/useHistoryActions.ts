/**
 * useHistoryActions
 *
 * Undo/redo handlers that replay layer snapshots onto the canvas.
 */

import { useCallback, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { HistoryEntry } from "../types";

export interface UseHistoryActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  /** Flush deferred pixel syncs before undo so the tip snapshot is accurate. */
  flushBeforeUndo?: () => void;
}

function restoreEntry(
  entry: HistoryEntry,
  canvasRef: RefObject<SketchCanvasRef | null>
): void {
  if (!canvasRef.current) {
    return;
  }
  if (entry.restoreMode === "structure-only") {
    return;
  }
  for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
    const canvasSnapshot = entry.layerCanvasSnapshots?.[layerId];
    if (canvasSnapshot) {
      canvasRef.current.restoreLayerCanvas(layerId, canvasSnapshot);
    } else {
      canvasRef.current.setLayerData(layerId, data);
    }
  }
}

export function useHistoryActions({
  canvasRef,
  undo,
  redo,
  flushBeforeUndo
}: UseHistoryActionsParams) {
  const handleUndo = useCallback(() => {
    // Flush deferred pixel syncs so the undo tip-snapshot captures the latest
    // layer.data, otherwise redo to the tip restores stale pixels.
    if (flushBeforeUndo) {
      flushBeforeUndo();
    }
    const entry = undo();
    if (entry) {
      restoreEntry(entry, canvasRef);
    }
  }, [undo, canvasRef, flushBeforeUndo]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry) {
      restoreEntry(entry, canvasRef);
    }
  }, [redo, canvasRef]);

  return { handleUndo, handleRedo };
}
