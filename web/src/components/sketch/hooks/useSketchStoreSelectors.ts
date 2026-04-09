/**
 * useSketchStoreSelectors
 *
 * Shared resolved-tool-settings hook and narrow selector helpers used by
 * connected shell components.
 *
 * ## Design notes
 *
 * `useResolvedToolSettings` is the canonical way to read tool settings with
 * defaults merged. It uses `useMemo` so the returned object reference is
 * stable when the underlying `toolSettings` slice hasn't changed.
 *
 * The old `useSketchStoreSelectors()` aggregator is retained for backward
 * compatibility but should not be used in new code — prefer direct
 * `useSketchStore` selectors in connected components.
 */

import { useMemo } from "react";
import { useSketchStore } from "../state";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_PEN_PRESSURE,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_CLONE_STAMP_SETTINGS,
  DEFAULT_SELECT_SETTINGS,
  DEFAULT_SEGMENT_SETTINGS
} from "../types";

/**
 * Returns tool settings with defaults defensively merged.
 *
 * The result is memoised on the raw `toolSettings` slice so the reference
 * stays stable across renders that don't change tool settings.
 */
export function useResolvedToolSettings() {
  const liveToolSettings = useSketchStore((s) => s.toolSettings);

  return useMemo(() => {
    const resolvedPenPressure = {
      ...DEFAULT_PEN_PRESSURE,
      ...liveToolSettings.penPressure
    };

    return {
      brush: {
        ...DEFAULT_BRUSH_SETTINGS,
        ...liveToolSettings.brush,
        ...resolvedPenPressure
      },
      pencil: {
        ...DEFAULT_PENCIL_SETTINGS,
        ...liveToolSettings.pencil,
        ...resolvedPenPressure
      },
      eraser: { ...DEFAULT_ERASER_SETTINGS, ...liveToolSettings.eraser },
      penPressure: resolvedPenPressure,
      shape: { ...DEFAULT_SHAPE_SETTINGS, ...liveToolSettings.shape },
      fill: { ...DEFAULT_FILL_SETTINGS, ...liveToolSettings.fill },
      blur: { ...DEFAULT_BLUR_SETTINGS, ...liveToolSettings.blur },
      gradient: {
        ...DEFAULT_GRADIENT_SETTINGS,
        ...liveToolSettings.gradient
      },
      cloneStamp: {
        ...DEFAULT_CLONE_STAMP_SETTINGS,
        ...liveToolSettings.cloneStamp
      },
      select: { ...DEFAULT_SELECT_SETTINGS, ...liveToolSettings.select },
      segment: { ...DEFAULT_SEGMENT_SETTINGS, ...liveToolSettings.segment }
    };
  }, [liveToolSettings]);
}

/**
 * @deprecated Prefer direct `useSketchStore` selectors in connected
 * components and `useResolvedToolSettings()` for merged tool settings.
 * This aggregator subscribes to many unrelated store slices at once and
 * forces the consuming component to rerender on any of them.
 */
export function useSketchStoreSelectors() {
  const document = useSketchStore((s) => s.document);
  const liveToolSettings = useSketchStore((s) => s.toolSettings);
  const activeTool = useSketchStore((s) => s.activeTool);
  const transientMoveModifierHeld = useSketchStore((s) => s.transientMoveModifierHeld);
  const setDocument = useSketchStore((s) => s.setDocument);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setCloneStampSettings = useSketchStore((s) => s.setCloneStampSettings);
  const setSelectSettings = useSketchStore((s) => s.setSelectSettings);
  const setSegmentSettings = useSketchStore((s) => s.setSegmentSettings);
  const setPenPressure = useSketchStore((s) => s.setPenPressure);
  const featherCurrentSelection = useSketchStore((s) => s.featherCurrentSelection);
  const smoothCurrentSelectionBorders = useSketchStore(
    (s) => s.smoothCurrentSelectionBorders
  );
  const convertSelectionToBorderOutline = useSketchStore(
    (s) => s.convertSelectionToBorderOutline
  );
  const setZoom = useSketchStore((s) => s.setZoom);
  const setPan = useSketchStore((s) => s.setPan);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const selectedLayerIds = useSketchStore((s) => s.selectedLayerIds);
  const toggleLayerInSelection = useSketchStore((s) => s.toggleLayerInSelection);
  const selectLayerRangeInPanelOrder = useSketchStore(
    (s) => s.selectLayerRangeInPanelOrder
  );
  const addLayer = useSketchStore((s) => s.addLayer);
  const removeLayer = useSketchStore((s) => s.removeLayer);
  const duplicateLayer = useSketchStore((s) => s.duplicateLayer);
  const reorderLayers = useSketchStore((s) => s.reorderLayers);
  const toggleLayerVisibility = useSketchStore((s) => s.toggleLayerVisibility);
  const setLayerOpacity = useSketchStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useSketchStore((s) => s.setLayerBlendMode);
  const renameLayer = useSketchStore((s) => s.renameLayer);
  const updateLayerData = useSketchStore((s) => s.updateLayerData);
  const setLayerTransform = useSketchStore((s) => s.setLayerTransform);
  const commitLayerTransform = useSketchStore((s) => s.commitLayerTransform);
  const setLayerContentBounds = useSketchStore((s) => s.setLayerContentBounds);
  const translateLayer = useSketchStore((s) => s.translateLayer);
  const offsetLayerTransform = useSketchStore((s) => s.offsetLayerTransform);
  const setMaskLayer = useSketchStore((s) => s.setMaskLayer);
  const toggleAlphaLock = useSketchStore((s) => s.toggleAlphaLock);
  const toggleLayerExposedInput = useSketchStore((s) => s.toggleLayerExposedInput);
  const toggleLayerExposedOutput = useSketchStore((s) => s.toggleLayerExposedOutput);
  const pushHistory = useSketchStore((s) => s.pushHistory);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);
  const mergeLayerDown = useSketchStore((s) => s.mergeLayerDown);
  const flattenVisible = useSketchStore((s) => s.flattenVisible);
  const addGroup = useSketchStore((s) => s.addGroup);
  const toggleGroupCollapsed = useSketchStore((s) => s.toggleGroupCollapsed);
  const moveLayerToGroup = useSketchStore((s) => s.moveLayerToGroup);
  const ungroupLayer = useSketchStore((s) => s.ungroupLayer);
  const groupLayers = useSketchStore((s) => s.groupLayers);
  const foregroundColor = useSketchStore((s) => s.foregroundColor);
  const backgroundColor = useSketchStore((s) => s.backgroundColor);
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBackgroundColor = useSketchStore((s) => s.setBackgroundColor);
  const swapColors = useSketchStore((s) => s.swapColors);
  const resetColors = useSketchStore((s) => s.resetColors);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);
  const resizeCanvas = useSketchStore((s) => s.resizeCanvas);
  const offsetAllPaintLayersTransform = useSketchStore(
    (s) => s.offsetAllPaintLayersTransform
  );
  const selection = useSketchStore((s) => s.selection);
  const setSelection = useSketchStore((s) => s.setSelection);
  const invertSelection = useSketchStore((s) => s.invertSelection);
  const isolatedLayerId = useSketchStore((s) => s.isolatedLayerId);
  const toggleIsolateLayer = useSketchStore((s) => s.toggleIsolateLayer);
  const mirrorX = useSketchStore((s) => s.mirrorX);
  const mirrorY = useSketchStore((s) => s.mirrorY);
  const setMirrorX = useSketchStore((s) => s.setMirrorX);
  const setMirrorY = useSketchStore((s) => s.setMirrorY);
  const symmetryMode = useSketchStore((s) => s.symmetryMode);
  const symmetryRays = useSketchStore((s) => s.symmetryRays);
  const setSymmetryMode = useSketchStore((s) => s.setSymmetryMode);
  const setSymmetryRays = useSketchStore((s) => s.setSymmetryRays);

  // Use memoised resolved tool settings so reference is stable.
  const toolSettings = useResolvedToolSettings();

  const safeForegroundColor = foregroundColor || "#ffffff";
  const safeBackgroundColor = backgroundColor || "#000000";

  return {
    document,
    activeTool,
    transientMoveModifierHeld,
    setDocument,
    setActiveTool,
    setBrushSettings,
    setPencilSettings,
    setEraserSettings,
    setShapeSettings,
    setFillSettings,
    setBlurSettings,
    setGradientSettings,
    setCloneStampSettings,
    setSelectSettings,
    setSegmentSettings,
    setPenPressure,
    featherCurrentSelection,
    smoothCurrentSelectionBorders,
    convertSelectionToBorderOutline,
    setZoom,
    setPan,
    setActiveLayer,
    selectedLayerIds,
    toggleLayerInSelection,
    selectLayerRangeInPanelOrder,
    addLayer,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    toggleLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    renameLayer,
    updateLayerData,
    setLayerTransform,
    commitLayerTransform,
    setLayerContentBounds,
    translateLayer,
    offsetLayerTransform,
    setMaskLayer,
    toggleAlphaLock,
    toggleLayerExposedInput,
    toggleLayerExposedOutput,
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    mergeLayerDown,
    flattenVisible,
    addGroup,
    toggleGroupCollapsed,
    moveLayerToGroup,
    ungroupLayer,
    groupLayers,
    foregroundColor: safeForegroundColor,
    backgroundColor: safeBackgroundColor,
    setForegroundColor,
    setBackgroundColor,
    swapColors,
    resetColors,
    panelsHidden,
    togglePanelsHidden,
    resizeCanvas,
    offsetAllPaintLayersTransform,
    selection,
    setSelection,
    invertSelection,
    isolatedLayerId,
    toggleIsolateLayer,
    mirrorX,
    mirrorY,
    setMirrorX,
    setMirrorY,
    symmetryMode,
    symmetryRays,
    setSymmetryMode,
    setSymmetryRays,
    toolSettings
  };
}
