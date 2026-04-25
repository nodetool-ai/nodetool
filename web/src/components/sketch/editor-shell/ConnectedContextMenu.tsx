/**
 * ConnectedContextMenu — subscribes to activeTool, toolSettings,
 * hasActiveSelection (boolean), foregroundColor, backgroundColor,
 * canUndo, canRedo.
 * Does NOT re-render on document, viewport, panelsHidden, or full
 * selection mask changes.
 *
 * Uses the shared `useTransformAdapter` hook instead of independently
 * calling `useDisplayedActiveLayerTransform()`.
 */
import React, { memo, useCallback } from "react";
import SketchCanvasContextMenu from "../SketchCanvasContextMenu";
import { useSketchStore } from "../state";
import { useResolvedToolSettings, useToolChromeActions } from "../hooks";
import { useTransformAdapter } from "../hooks/useTransformAdapter";
import type { useSegmentation } from "../hooks/useSegmentation";
import type { LayerType } from "../types";

export interface ConnectedContextMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  adjBrightness: number;
  adjContrast: number;
  adjSaturation: number;
  onClose: () => void;
  onAdjustBrightnessChange: (v: number) => void;
  onAdjustContrastChange: (v: number) => void;
  onAdjustSaturationChange: (v: number) => void;
  onAdjustApply: () => void;
  onAdjustCancel: () => void;
  onTransformCommit: () => void;
  onTransformCancel: () => void;
  onTransformReset: () => void;
  segmentation: ReturnType<typeof useSegmentation>;
  onRunSegmentation: () => void;
  onClearSegmentPrompts: () => void;
  onSwapColors: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearLayer: () => void;
  onExportPng: () => void;
  onFillSelectionWithForeground: () => void;
  onNewLayer: (type?: Extract<LayerType, "raster" | "mask">) => void;
  onLayerViaCopy: () => void;
  onLayerViaCut: () => void;
  onFreeTransform: () => void;
}

export const ConnectedContextMenu = memo(function ConnectedContextMenu(
  props: ConnectedContextMenuProps
) {
  const activeTool = useSketchStore((s) => s.activeTool);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettings = useResolvedToolSettings();
  const foregroundColor =
    useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const backgroundColor =
    useSketchStore((s) => s.backgroundColor) || "#000000";
  const canUndo = useSketchStore((s) => s.canUndo());
  const canRedo = useSketchStore((s) => s.canRedo());
  const transform = useTransformAdapter({
    onTransformCommit: props.onTransformCommit,
    onTransformCancel: props.onTransformCancel,
    onTransformReset: props.onTransformReset
  });

  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const {
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
    invertSelection,
    featherCurrentSelection,
    smoothCurrentSelectionBorders,
    convertSelectionToBorderOutline
  } = useToolChromeActions();
  const deselectSelection = useCallback(
    () => useSketchStore.getState().setSelection(null),
    []
  );
  const reselectSelection = useSketchStore((s) => s.reselectLastSelection);

  return (
    <SketchCanvasContextMenu
      className="sketch-editor__context-menu"
      open={props.open}
      position={props.position}
      activeTool={activeTool}
      brushSettings={toolSettings.brush}
      pencilSettings={toolSettings.pencil}
      eraserSettings={toolSettings.eraser}
      shapeSettings={toolSettings.shape}
      fillSettings={toolSettings.fill}
      blurSettings={toolSettings.blur}
      gradientSettings={toolSettings.gradient}
      cloneStampSettings={toolSettings.cloneStamp}
      selectSettings={toolSettings.select}
      hasActiveSelection={hasActiveSelection}
      adjustBrightness={props.adjBrightness}
      adjustContrast={props.adjContrast}
      adjustSaturation={props.adjSaturation}
      foregroundColor={foregroundColor}
      backgroundColor={backgroundColor}
      canUndo={canUndo}
      canRedo={canRedo}
      onClose={props.onClose}
      onToolChange={setActiveTool}
      onBrushSettingsChange={setBrushSettings}
      onPencilSettingsChange={setPencilSettings}
      onEraserSettingsChange={setEraserSettings}
      onShapeSettingsChange={setShapeSettings}
      onFillSettingsChange={setFillSettings}
      onBlurSettingsChange={setBlurSettings}
      onGradientSettingsChange={setGradientSettings}
      onCloneStampSettingsChange={setCloneStampSettings}
      onSelectSettingsChange={setSelectSettings}
      onInvertSelection={invertSelection}
      onFeatherSelection={featherCurrentSelection}
      onSmoothSelectionBorders={smoothCurrentSelectionBorders}
      onStrokeSelectionBorder={convertSelectionToBorderOutline}
      onDeselectSelection={deselectSelection}
      onReselectSelection={reselectSelection}
      onFillSelectionWithForeground={props.onFillSelectionWithForeground}
      onNewLayer={props.onNewLayer}
      onLayerViaCopy={props.onLayerViaCopy}
      onLayerViaCut={props.onLayerViaCut}
      onFreeTransform={props.onFreeTransform}
      onAdjustBrightnessChange={props.onAdjustBrightnessChange}
      onAdjustContrastChange={props.onAdjustContrastChange}
      onAdjustSaturationChange={props.onAdjustSaturationChange}
      onAdjustApply={props.onAdjustApply}
      onAdjustCancel={props.onAdjustCancel}
      transformScaleX={transform.display.scaleX}
      transformScaleY={transform.display.scaleY}
      transformRotation={transform.display.rotation}
      onTransformCommit={transform.actions.onCommit}
      onTransformCancel={transform.actions.onCancel}
      onTransformReset={transform.actions.onReset}
      segmentSettings={toolSettings.segment}
      onSegmentSettingsChange={setSegmentSettings}
      segmentationStatus={props.segmentation.status}
      segmentModelInfo={props.segmentation.modelInfo}
      onRunSegmentation={props.onRunSegmentation}
      onApplySegmentResult={props.segmentation.applyResult}
      onDiscardSegmentResult={props.segmentation.discardResult}
      onCancelSegmentation={props.segmentation.cancelSegmentation}
      onClearSegmentPrompts={props.onClearSegmentPrompts}
      onCheckSegmentModel={props.segmentation.checkModel}
      onSwapColors={props.onSwapColors}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      onClearLayer={props.onClearLayer}
      onExportPng={props.onExportPng}
    />
  );
});
