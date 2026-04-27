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
  const canvas = canvasRef.current;
  if (!canvas) {
    return;
  }

  const boundsByLayerId = new Map(
    entry.layerStructure.map((layer) => [layer.id, layer.contentBounds])
  );

  if (entry.restoreMode === "structure-only") {
    for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
      const currentData = canvas.getLayerData(layerId);
      if (currentData === data && !entry.layerCanvasSnapshots?.[layerId]) {
        continue;
      }
      const canvasSnapshot = entry.layerCanvasSnapshots?.[layerId];
      if (canvasSnapshot) {
        canvas.restoreLayerCanvas(layerId, canvasSnapshot);
      } else {
        canvas.setLayerData(layerId, data, boundsByLayerId.get(layerId));
      }
    }
    canvas.redrawDisplay();
    return;
  }

  for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
    const canvasSnapshot = entry.layerCanvasSnapshots?.[layerId];
    if (canvasSnapshot) {
      canvas.restoreLayerCanvas(layerId, canvasSnapshot);
    } else {
      canvas.setLayerData(layerId, data, boundsByLayerId.get(layerId));
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
