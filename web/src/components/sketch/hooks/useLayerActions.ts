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
  addGroup: (name?: string) => string;
  toggleGroupCollapsed: (groupId: string) => void;
  moveLayerToGroup: (layerId: string, groupId: string | null) => void;
  ungroupLayer: (groupId: string) => void;
  groupLayers: (layerIds: string[]) => void;
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
  flattenVisible,
  addGroup,
  toggleGroupCollapsed,
  moveLayerToGroup,
  ungroupLayer,
  groupLayers
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

  const syncLayerDataFromCanvas = useCallback(
    (layerId: string) => {
      const data = canvasRef.current?.getLayerData(layerId) ?? null;
      updateLayerData(layerId, data);
      return data;
    },
    [canvasRef, updateLayerData]
  );

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
      scheduleDisplayRedraw();
    },
    [pushHistory, setMaskLayer, scheduleDisplayRedraw]
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
      pushHistory("toggle exposed input");
      toggleLayerExposedInput(layerId);
    },
    [pushHistory, toggleLayerExposedInput]
  );

  const handleToggleExposedOutput = useCallback(
    (layerId: string) => {
      pushHistory("toggle exposed output");
      toggleLayerExposedOutput(layerId);
    },
    [pushHistory, toggleLayerExposedOutput]
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
    syncLayerDataFromCanvas(layerId);
  }, [
    document.activeLayerId,
    document.layers,
    pushHistory,
    syncLayerDataFromCanvas,
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
    // Merge is an explicit destructive bake flow: runtime rebases both layers
    // into document-space pixels, then the store drops the upper layer and keeps
    // the lower layer at identity transform/full document bounds.
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
    // Flatten is also a destructive bake flow: runtime composites all visible
    // layers into one document-space raster and the store replaces the layer stack.
    pushHistory("flatten visible");
    const flatData = canvasRef.current.flattenVisible();
    flattenVisible();
    const newState = useSketchStore.getState();
    if (newState.document.layers.length > 0 && flatData) {
      updateLayerData(newState.document.layers[0].id, flatData);
      canvasRef.current.setLayerData(newState.document.layers[0].id, flatData);
    }
  }, [pushHistory, flattenVisible, updateLayerData, canvasRef]);

  const handleAddGroup = useCallback(
    (name?: string) => {
      pushHistory("add group");
      addGroup(name);
    },
    [pushHistory, addGroup]
  );

  const handleToggleGroupCollapsed = useCallback(
    (groupId: string) => {
      toggleGroupCollapsed(groupId);
    },
    [toggleGroupCollapsed]
  );

  const handleMoveLayerToGroup = useCallback(
    (layerId: string, groupId: string | null) => {
      pushHistory("move layer to group");
      moveLayerToGroup(layerId, groupId);
    },
    [pushHistory, moveLayerToGroup]
  );

  const handleUngroupLayer = useCallback(
    (groupId: string) => {
      pushHistory("ungroup");
      ungroupLayer(groupId);
    },
    [pushHistory, ungroupLayer]
  );

  const handleGroupSelectedLayers = useCallback(() => {
    const ids = useSketchStore.getState().selectedLayerIds;
    if (ids.length < 2) {
      return;
    }
    pushHistory("group layers");
    groupLayers(ids);
  }, [pushHistory, groupLayers]);

  const handleDeleteSelectedLayers = useCallback(() => {
    const ids = [...useSketchStore.getState().selectedLayerIds];
    if (ids.length < 2) {
      return;
    }
    const layerIds = new Set(document.layers.map((l) => l.id));
    const toRemove = ids.filter((id) => layerIds.has(id));
    if (toRemove.length === 0) {
      return;
    }
    if (document.layers.length - toRemove.length < 1) {
      return;
    }
    pushHistory("remove layers");
    const sorted = [...toRemove].sort(
      (a, b) =>
        document.layers.findIndex((l) => l.id === b) -
        document.layers.findIndex((l) => l.id === a)
    );
    for (const id of sorted) {
      removeLayer(id);
    }
  }, [document.layers, pushHistory, removeLayer]);

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
    handleFlattenVisible,
    handleAddGroup,
    handleToggleGroupCollapsed,
    handleMoveLayerToGroup,
    handleUngroupLayer,
    handleGroupSelectedLayers,
    handleDeleteSelectedLayers
  };
}
