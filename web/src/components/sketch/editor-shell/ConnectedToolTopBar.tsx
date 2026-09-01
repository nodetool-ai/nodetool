/**
 * ConnectedToolTopBar — subscribes to activeTool, individual tool-setting
 * sub-objects (via narrow selectors), panelsHidden, and hasActiveSelection.
 * Does NOT re-render on document, viewport, color changes, or unrelated
 * tool-setting slider changes (e.g. brush size while eraser is active).
 * Action callbacks that depend on document are passed in as props; their
 * individual references are stable via `useCallback`.
 */
import React, { memo, useEffect } from "react";
import SketchToolTopBar from "../SketchToolTopBar";
import { ConnectedEditorActions } from "./ConnectedEditorActions";
import { useSketchStore } from "../state";
import {
  useResolvedToolSettings,
  useSketchIsMobile,
  useToolChromeActions
} from "../hooks";
import { useTransformAdapter } from "../hooks/useTransformAdapter";
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
  onCropCanvasToSelection: () => void;
  onCropCommit: () => void;
  onCropCancelPreview: () => void;
  /** Compact host actions rendered inline at the trailing edge. */
  headerActions?: React.ReactNode;
  /** Host actions appended to the bar's overflow menu. */
  menuItems?: (close: () => void) => React.ReactNode[];
}

export const ConnectedToolTopBar = memo(function ConnectedToolTopBar(
  props: ConnectedToolTopBarProps
) {
  const activeTool = useSketchStore((s) => s.activeTool);
  const cropPreviewBounds = useSketchStore((s) => s.cropPreviewBounds);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const toolSettingsCollapsed = useSketchStore((s) => s.toolSettingsCollapsed);
  const toggleToolSettingsCollapsed = useSketchStore(
    (s) => s.toggleToolSettingsCollapsed
  );
  const setToolSettingsCollapsed = useSketchStore(
    (s) => s.setToolSettingsCollapsed
  );
  const toolSettings = useResolvedToolSettings();

  // The settings rows wrap to two or three lines for most tools, which on a
  // phone leaves little canvas. Start collapsed on mobile and expanded on
  // desktop, re-applied on each breakpoint crossing (rotate/resize).
  const isMobile = useSketchIsMobile();
  useEffect(() => {
    setToolSettingsCollapsed(isMobile);
  }, [isMobile, setToolSettingsCollapsed]);

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
    setMoveSettings,
    setTransformSettings,
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
      onCropCanvasToSelection={props.onCropCanvasToSelection}
      onFeatherSelection={featherCurrentSelection}
      onSmoothSelectionBorders={smoothCurrentSelectionBorders}
      onConvertSelectionToBorder={convertSelectionToBorderOutline}
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
      transformAutoSelect={toolSettings.transform?.autoSelect ?? true}
      transformMode={toolSettings.transform?.mode ?? "scale"}
      onTransformAutoSelectChange={(enabled: boolean) =>
        setTransformSettings({ autoSelect: enabled })
      }
      onTransformModeChange={(mode) => setTransformSettings({ mode })}
      moveAutoSelect={toolSettings.move?.autoSelect ?? true}
      onMoveAutoSelectChange={(enabled: boolean) =>
        setMoveSettings({ autoSelect: enabled })
      }
      cropHasPendingRect={activeTool === "crop" && cropPreviewBounds !== null}
      onCropApply={props.onCropCommit}
      onCropCancelPreview={props.onCropCancelPreview}
      segmentSettings={toolSettings.segment}
      onSegmentSettingsChange={setSegmentSettings}
      segmentationStatus={props.segmentation.status}
      segmentationError={props.segmentation.errorMessage}
      segmentModelInfo={props.segmentation.modelInfo}
      onRunSegmentation={props.onRunSegmentation}
      onApplySegmentResult={props.segmentation.applyResult}
      onDiscardSegmentResult={props.segmentation.discardResult}
      onCancelSegmentation={props.segmentation.cancelSegmentation}
      onClearSegmentPrompts={props.onClearSegmentPrompts}
      onCheckSegmentModel={props.segmentation.checkModel}
      trailingActions={
        <ConnectedEditorActions
          inlineActions={props.headerActions}
          menuItems={props.menuItems}
        />
      }
      settingsCollapsed={toolSettingsCollapsed}
      onToggleSettingsCollapsed={toggleToolSettingsCollapsed}
    />
  );
});
