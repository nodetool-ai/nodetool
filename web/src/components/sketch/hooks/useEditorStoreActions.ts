/**
 * useEditorStoreActions
 *
 * Focused selector bundle hooks that replace the large flat list of
 * `useSketchStore((s) => s.someAction)` calls in SketchEditor.
 *
 * Each bundle groups store actions by concern (history, layer, canvas,
 * color, session). Store action references are stable (they never change),
 * so the returned objects are referentially stable and will not cause
 * unnecessary re-renders.
 *
 * ## Why bundles instead of individual selectors
 *
 * SketchEditor previously had ~60 individual `useSketchStore(...)` calls
 * for store actions it passes to action hooks. This made it hard to see
 * which concern each action belonged to and easy to accidentally add
 * unrelated state dependencies. Grouping by concern makes the dependency
 * graph visible and keeps new actions from landing in an undifferentiated
 * grab-bag.
 */

import { useSketchStore } from "../state";

/**
 * History-related store actions (undo, redo, pushHistory).
 */
export function useHistoryStoreActions() {
  const pushHistory = useSketchStore((s) => s.pushHistory);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  return { pushHistory, undo, redo };
}

/**
 * Layer CRUD store actions.
 */
export function useLayerStoreActions() {
  const updateLayerData = useSketchStore((s) => s.updateLayerData);
  const setLayerTransform = useSketchStore((s) => s.setLayerTransform);
  const commitLayerTransform = useSketchStore((s) => s.commitLayerTransform);
  const setLayerContentBounds = useSketchStore((s) => s.setLayerContentBounds);
  const offsetLayerTransform = useSketchStore((s) => s.offsetLayerTransform);
  const addLayer = useSketchStore((s) => s.addLayer);
  const removeLayer = useSketchStore((s) => s.removeLayer);
  const duplicateLayer = useSketchStore((s) => s.duplicateLayer);
  const reorderLayers = useSketchStore((s) => s.reorderLayers);
  const toggleLayerVisibility = useSketchStore((s) => s.toggleLayerVisibility);
  const setLayerOpacity = useSketchStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useSketchStore((s) => s.setLayerBlendMode);
  const renameLayer = useSketchStore((s) => s.renameLayer);
  const setMaskLayer = useSketchStore((s) => s.setMaskLayer);
  const toggleAlphaLock = useSketchStore((s) => s.toggleAlphaLock);
  const toggleLayerExposedInput = useSketchStore(
    (s) => s.toggleLayerExposedInput
  );
  const toggleLayerExposedOutput = useSketchStore(
    (s) => s.toggleLayerExposedOutput
  );
  const mergeLayerDown = useSketchStore((s) => s.mergeLayerDown);
  const flattenVisible = useSketchStore((s) => s.flattenVisible);
  const addGroup = useSketchStore((s) => s.addGroup);
  const toggleGroupCollapsed = useSketchStore((s) => s.toggleGroupCollapsed);
  const moveLayerToGroup = useSketchStore((s) => s.moveLayerToGroup);
  const ungroupLayer = useSketchStore((s) => s.ungroupLayer);
  const groupLayers = useSketchStore((s) => s.groupLayers);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);

  return {
    updateLayerData,
    setLayerTransform,
    commitLayerTransform,
    setLayerContentBounds,
    offsetLayerTransform,
    addLayer,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    toggleLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    renameLayer,
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
    groupLayers,
    setActiveLayer
  };
}

/**
 * Canvas/viewport store actions.
 */
export function useCanvasStoreActions() {
  const setZoom = useSketchStore((s) => s.setZoom);
  const setPan = useSketchStore((s) => s.setPan);
  const resizeCanvas = useSketchStore((s) => s.resizeCanvas);
  const offsetAllPaintLayersTransform = useSketchStore(
    (s) => s.offsetAllPaintLayersTransform
  );
  const setMirrorX = useSketchStore((s) => s.setMirrorX);
  const setMirrorY = useSketchStore((s) => s.setMirrorY);
  return {
    setZoom,
    setPan,
    resizeCanvas,
    offsetAllPaintLayersTransform,
    setMirrorX,
    setMirrorY
  };
}

/**
 * Color/tool-settings store actions used by SketchEditor for keyboard
 * shortcuts and color-actions composition. Note: per-tool setting setters
 * shared between ConnectedToolTopBar and ConnectedContextMenu live in
 * `useToolChromeActions` instead.
 */
export function useColorStoreActions() {
  const setForegroundColor = useSketchStore((s) => s.setForegroundColor);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setPencilSettings = useSketchStore((s) => s.setPencilSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setBlurSettings = useSketchStore((s) => s.setBlurSettings);
  const setCloneStampSettings = useSketchStore((s) => s.setCloneStampSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setGradientSettings = useSketchStore((s) => s.setGradientSettings);
  const setSelectSettings = useSketchStore((s) => s.setSelectSettings);
  const swapColors = useSketchStore((s) => s.swapColors);
  const resetColors = useSketchStore((s) => s.resetColors);
  return {
    setForegroundColor,
    setBrushSettings,
    setPencilSettings,
    setEraserSettings,
    setFillSettings,
    setBlurSettings,
    setCloneStampSettings,
    setShapeSettings,
    setGradientSettings,
    setSelectSettings,
    swapColors,
    resetColors
  };
}

/**
 * Session/editor-level store actions (document set, tool set, panels toggle).
 */
export function useSessionStoreActions() {
  const setDocument = useSketchStore((s) => s.setDocument);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);
  return { setDocument, setActiveTool, togglePanelsHidden };
}
