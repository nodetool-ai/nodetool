/**
 * useSketchStoreSelectors
 *
 * Centralises all Zustand store selector wiring that SketchEditor previously
 * did inline. Returns every store value and action that the editor needs.
 */

import { useSketchStore } from "../state";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_FILL_SETTINGS,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_CLONE_STAMP_SETTINGS,
  DEFAULT_SELECT_SETTINGS
} from "../types";

export function useSketchStoreSelectors() {
  const document = useSketchStore((s) => s.document);
  const activeTool = useSketchStore((s) => s.activeTool);
  const transientMoveModifierHeld = useSketchStore((s) => s.transientMoveModifierHeld);
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
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
  const featherCurrentSelection = useSketchStore((s) => s.featherCurrentSelection);
  const smoothCurrentSelectionBorders = useSketchStore(
    (s) => s.smoothCurrentSelectionBorders
  );
  const setZoom = useSketchStore((s) => s.setZoom);
  const setPan = useSketchStore((s) => s.setPan);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const selectedLayerIds = useSketchStore((s) => s.selectedLayerIds);
  const toggleLayerInSelection = useSketchStore((s) => s.toggleLayerInSelection);
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
  const selection = useSketchStore((s) => s.selection);
  const setSelection = useSketchStore((s) => s.setSelection);
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

  // Defensively merge defaults so older/incomplete documents cannot break render.
  const toolSettings = {
    brush: { ...DEFAULT_BRUSH_SETTINGS, ...document.toolSettings?.brush },
    pencil: { ...DEFAULT_PENCIL_SETTINGS, ...document.toolSettings?.pencil },
    eraser: { ...DEFAULT_ERASER_SETTINGS, ...document.toolSettings?.eraser },
    shape: { ...DEFAULT_SHAPE_SETTINGS, ...document.toolSettings?.shape },
    fill: { ...DEFAULT_FILL_SETTINGS, ...document.toolSettings?.fill },
    blur: { ...DEFAULT_BLUR_SETTINGS, ...document.toolSettings?.blur },
    gradient: { ...DEFAULT_GRADIENT_SETTINGS, ...document.toolSettings?.gradient },
    cloneStamp: { ...DEFAULT_CLONE_STAMP_SETTINGS, ...document.toolSettings?.cloneStamp },
    select: { ...DEFAULT_SELECT_SETTINGS, ...document.toolSettings?.select }
  };

  const safeForegroundColor = foregroundColor || "#ffffff";
  const safeBackgroundColor = backgroundColor || "#000000";

  return {
    document,
    activeTool,
    transientMoveModifierHeld,
    zoom,
    pan,
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
    featherCurrentSelection,
    smoothCurrentSelectionBorders,
    setZoom,
    setPan,
    setActiveLayer,
    selectedLayerIds,
    toggleLayerInSelection,
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
    selection,
    setSelection,
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
