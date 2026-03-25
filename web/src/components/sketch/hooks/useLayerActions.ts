/**
 * useLayerActions
 *
 * Layer mutation handlers that wrap store operations with history tracking
 * and canvas-ref synchronisation.
 */

import { useCallback, type RefObject } from "react";
import type { SketchCanvasRef } from "../SketchCanvas";
import type { BlendMode, PushHistoryOptions, SketchDocument } from "../types";
import { useSketchStore } from "../state";

export interface UseLayerActionsParams {
  canvasRef: RefObject<SketchCanvasRef | null>;
  document: SketchDocument;
  pushHistory: (label: string, layerCanvasSnapshots?: Record<string, HTMLCanvasElement | null>, options?: PushHistoryOptions) => void;
  addLayer: () => string;
  removeLayer: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setLayerBlendMode: (layerId: string, blendMode: BlendMode) => void;
  renameLayer: (layerId: string, name: string) => void;
  updateLayerData: (layerId: string, data: string | null) => void;
  setMaskLayer: (layerId: string | null) => void;
  toggleAlphaLock: (layerId: string) => void;
  toggleLayerExposedInput: (layerId: string) => void;
  toggleLayerExposedOutput: (layerId: string) => void;
  mergeLayerDown: (upperLayerId: string) => void;
  flattenVisible: () => void;
}

export function useLayerActions({
  canvasRef,
  document,
  pushHistory,
  addLayer,
  removeLayer,
  duplicateLayer,
  reorderLayers,
  toggleLayerVisibility,
  setLayerOpacity,
  setLayerBlendMode,
  renameLayer,
  updateLayerData,
  setMaskLayer,
  toggleAlphaLock,
  toggleLayerExposedInput,
  toggleLayerExposedOutput,
  mergeLayerDown,
  flattenVisible
}: UseLayerActionsParams) {
  const handleAddLayer = useCallback(
    (fillColor?: string | null) => {
      pushHistory("add layer");
      const newLayerId = addLayer();
      if (fillColor && canvasRef.current) {
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            canvasRef.current.fillLayerWithColor(newLayerId, fillColor);
            const data = canvasRef.current.getLayerData(newLayerId);
            if (data) {
              updateLayerData(newLayerId, data);
            }
          }
        });
      }
    },
    [pushHistory, addLayer, updateLayerData, canvasRef]
  );

  const handleRemoveLayer = useCallback(
    (layerId: string) => {
      pushHistory("remove layer");
      removeLayer(layerId);
    },
    [pushHistory, removeLayer]
  );

  const handleDuplicateLayer = useCallback(
    (layerId: string) => {
      pushHistory("duplicate layer");
      duplicateLayer(layerId);
    },
    [pushHistory, duplicateLayer]
  );

  const handleReorderLayers = useCallback(
    (fromIndex: number, toIndex: number) => {
      pushHistory("reorder layers");
      reorderLayers(fromIndex, toIndex);
    },
    [pushHistory, reorderLayers]
  );

  const scheduleDisplayRedraw = useCallback(() => {
    requestAnimationFrame(() => {
      canvasRef.current?.redrawDisplay();
    });
  }, [canvasRef]);

  const handleToggleVisibility = useCallback(
    (layerId: string) => {
      pushHistory("toggle visibility");
      toggleLayerVisibility(layerId);
      scheduleDisplayRedraw();
    },
    [pushHistory, toggleLayerVisibility, scheduleDisplayRedraw]
  );

  const handleSetLayerOpacity = useCallback(
    (layerId: string, opacity: number) => {
      pushHistory("change opacity");
      setLayerOpacity(layerId, opacity);
      scheduleDisplayRedraw();
    },
    [pushHistory, setLayerOpacity, scheduleDisplayRedraw]
  );

  const handleSetLayerBlendMode = useCallback(
    (layerId: string, blendMode: BlendMode) => {
      pushHistory("change blend mode");
      setLayerBlendMode(layerId, blendMode);
      scheduleDisplayRedraw();
    },
    [pushHistory, setLayerBlendMode, scheduleDisplayRedraw]
  );

  const handleRenameLayer = useCallback(
    (layerId: string, name: string) => {
      pushHistory("rename layer");
      renameLayer(layerId, name);
    },
    [pushHistory, renameLayer]
  );

  const handleSetMaskLayer = useCallback(
    (layerId: string | null) => {
      pushHistory("set mask layer");
      setMaskLayer(layerId);
    },
    [pushHistory, setMaskLayer]
  );

  const handleToggleAlphaLock = useCallback(
    (layerId: string) => {
      pushHistory("toggle alpha lock");
      toggleAlphaLock(layerId);
    },
    [pushHistory, toggleAlphaLock]
  );

  const handleToggleExposedInput = useCallback(
    (layerId: string) => {
      toggleLayerExposedInput(layerId);
    },
    [toggleLayerExposedInput]
  );

  const handleToggleExposedOutput = useCallback(
    (layerId: string) => {
      toggleLayerExposedOutput(layerId);
    },
    [toggleLayerExposedOutput]
  );

  const handleFlipLayer = useCallback((
    direction: "horizontal" | "vertical",
    historyLabel: "flip horizontal" | "flip vertical"
  ) => {
    const layerId = document.activeLayerId;
    if (!layerId || !canvasRef.current) {
      return;
    }
    const layer = document.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) {
      return;
    }
    pushHistory(historyLabel);
    canvasRef.current.flipLayer(layerId, direction);
    const data = canvasRef.current.getLayerData(layerId);
    updateLayerData(layerId, data);
  }, [
    document.activeLayerId,
    document.layers,
    pushHistory,
    updateLayerData,
    canvasRef
  ]);

  const handleFlipHorizontal = useCallback(
    () => handleFlipLayer("horizontal", "flip horizontal"),
    [handleFlipLayer]
  );

  const handleFlipVertical = useCallback(
    () => handleFlipLayer("vertical", "flip vertical"),
    [handleFlipLayer]
  );

  const handleMergeDown = useCallback(() => {
    const layers = document.layers;
    const idx = layers.findIndex((l) => l.id === document.activeLayerId);
    if (idx <= 0 || !canvasRef.current) {
      return;
    }
    const upper = layers[idx];
    const lower = layers[idx - 1];
    if (lower.locked) {
      return;
    }
    pushHistory("merge down");
    const mergedData = canvasRef.current.mergeLayerDown(upper.id, lower.id);
    mergeLayerDown(upper.id);
    if (mergedData) {
      updateLayerData(lower.id, mergedData);
    }
  }, [
    document.layers,
    document.activeLayerId,
    pushHistory,
    mergeLayerDown,
    updateLayerData,
    canvasRef
  ]);

  const handleFlattenVisible = useCallback(() => {
    if (!canvasRef.current) {
      return;
    }
    pushHistory("flatten visible");
    const flatData = canvasRef.current.flattenVisible();
    flattenVisible();
    const newState = useSketchStore.getState();
    if (newState.document.layers.length > 0 && flatData) {
      updateLayerData(newState.document.layers[0].id, flatData);
      canvasRef.current.setLayerData(newState.document.layers[0].id, flatData);
    }
  }, [pushHistory, flattenVisible, updateLayerData, canvasRef]);

  return {
    handleAddLayer,
    handleRemoveLayer,
    handleDuplicateLayer,
    handleReorderLayers,
    handleToggleVisibility,
    handleSetLayerOpacity,
    handleSetLayerBlendMode,
    handleRenameLayer,
    handleSetMaskLayer,
    handleToggleAlphaLock,
    handleToggleExposedInput,
    handleToggleExposedOutput,
    handleFlipHorizontal,
    handleFlipVertical,
    handleMergeDown,
    handleFlattenVisible
  };
}
