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
}

export function useHistoryActions({
  canvasRef,
  undo,
  redo
}: UseHistoryActionsParams) {
  const handleUndo = useCallback(() => {
    const entry = undo();
    if (entry && canvasRef.current) {
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
  }, [undo, canvasRef]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry && canvasRef.current) {
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
  }, [redo, canvasRef]);

  return { handleUndo, handleRedo };
}
