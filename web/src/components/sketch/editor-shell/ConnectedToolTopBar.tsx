/**
 * ConnectedToolTopBar — subscribes to activeTool, individual tool-setting
 * sub-objects (via narrow selectors), panelsHidden, and hasActiveSelection.
 * Does NOT re-render on document, viewport, color changes, or unrelated
 * tool-setting slider changes (e.g. brush size while eraser is active).
 * Action callbacks that depend on document are passed in as props; their
 * individual references are stable via `useCallback`.
 */
import React, { memo } from "react";
import SketchToolTopBar from "../SketchToolTopBar";
import { useSketchStore } from "../state";
import { useResolvedToolSettings, useToolChromeActions } from "../hooks";
import { useTransformAdapter, type UseTransformAdapterParams } from "../hooks/useTransformAdapter";
import type { useSegmentation } from "../hooks/useSegmentation";

export interface ConnectedToolTopBarProps {
  adjBrightness: number;
  adjContrast: number;
  adjSaturation: number;
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
}

export const ConnectedToolTopBar = memo(function ConnectedToolTopBar(
  props: ConnectedToolTopBarProps
) {
  const activeTool = useSketchStore((s) => s.activeTool);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettings = useResolvedToolSettings();
  const transform = useTransformAdapter({
    onTransformCommit: props.onTransformCommit,
    onTransformCancel: props.onTransformCancel,
    onTransformReset: props.onTransformReset
  });

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

  if (panelsHidden) {
    return null;
  }

  return (
    <SketchToolTopBar
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
    />
  );
});
