/* eslint-disable max-lines-per-function -- Dispatcher switch is exhaustive by tool. */
import React, { memo } from "react";
import type {
  BrushSettings,
  CloneStampSettings,
  EraserSettings,
  FillSettings,
  GradientSettings,
  PencilSettings,
  SelectSettings,
  SegmentSettings,
  SegmentationStatus,
  ShapeSettings,
  BlurSettings,
  SketchTool,
  TransformMode
} from "../types";
import type { SamModelInfo } from "../sam";
import {
  AdjustmentsSettingsPanel,
  CropSettingsPanel,
  MoveSettingsPanel,
  NoSettingsMessage,
  TransformSettingsPanel
} from "./adjustMoveCropPanels";
import {
  BlurSettingsPanel,
  CloneStampSettingsPanel,
  FillSettingsPanel,
  GradientSettingsPanel,
  ShapeSettingsPanel
} from "./geometryEffectsPanels";
import {
  BrushSettingsPanel,
  EraserSettingsPanel,
  PencilSettingsPanel
} from "./paintToolPanels";
import { SegmentSettingsPanel } from "./segmentSettingsPanel";
import { SelectSettingsPanel } from "./selectSettingsPanel";
import { effectiveEraserMode, noop } from "./shared";

export interface ToolSettingsPanelProps {
  activeTool: SketchTool;
  brushSettings: BrushSettings;
  pencilSettings: PencilSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  fillSettings: FillSettings;
  blurSettings: BlurSettings;
  gradientSettings: GradientSettings;
  cloneStampSettings: CloneStampSettings;
  selectSettings: SelectSettings;
  hasActiveSelection: boolean;
  adjustBrightness?: number;
  adjustContrast?: number;
  adjustSaturation?: number;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onPencilSettingsChange: (settings: Partial<PencilSettings>) => void;
  onEraserSettingsChange: (settings: Partial<EraserSettings>) => void;
  onShapeSettingsChange: (settings: Partial<ShapeSettings>) => void;
  onFillSettingsChange: (settings: Partial<FillSettings>) => void;
  onBlurSettingsChange: (settings: Partial<BlurSettings>) => void;
  onGradientSettingsChange: (settings: Partial<GradientSettings>) => void;
  onCloneStampSettingsChange: (settings: Partial<CloneStampSettings>) => void;
  onSelectSettingsChange: (settings: Partial<SelectSettings>) => void;
  onInvertSelection: () => void;
  onCropCanvasToSelection?: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
  onAdjustBrightnessChange?: (value: number) => void;
  onAdjustContrastChange?: (value: number) => void;
  onAdjustSaturationChange?: (value: number) => void;
  onAdjustApply?: () => void;
  onAdjustCancel?: () => void;
  moveAutoSelect?: boolean;
  onMoveAutoSelectChange?: (enabled: boolean) => void;
  transformScaleX?: number;
  transformScaleY?: number;
  transformRotation?: number;
  onTransformCommit?: () => void;
  onTransformCancel?: () => void;
  onTransformReset?: () => void;
  transformAutoSelect?: boolean;
  transformMode?: TransformMode;
  onTransformAutoSelectChange?: (enabled: boolean) => void;
  onTransformModeChange?: (mode: TransformMode) => void;
  cropHasPendingRect?: boolean;
  onCropApply?: () => void;
  onCropCancelPreview?: () => void;
  segmentSettings?: SegmentSettings;
  onSegmentSettingsChange?: (settings: Partial<SegmentSettings>) => void;
  segmentationStatus?: SegmentationStatus;
  segmentModelInfo?: SamModelInfo | null;
  onRunSegmentation?: () => void;
  onApplySegmentResult?: () => void;
  onDiscardSegmentResult?: () => void;
  onCancelSegmentation?: () => void;
  onClearSegmentPrompts?: () => void;
  onCheckSegmentModel?: () => void;
}

export const ToolSettingsPanel = memo(function ToolSettingsPanel({
  activeTool,
  brushSettings,
  pencilSettings,
  eraserSettings,
  shapeSettings,
  fillSettings,
  blurSettings,
  gradientSettings,
  cloneStampSettings,
  selectSettings,
  hasActiveSelection,
  adjustBrightness,
  adjustContrast,
  adjustSaturation,
  onBrushSettingsChange,
  onPencilSettingsChange,
  onEraserSettingsChange,
  onShapeSettingsChange,
  onFillSettingsChange,
  onBlurSettingsChange,
  onGradientSettingsChange,
  onCloneStampSettingsChange,
  onSelectSettingsChange,
  onInvertSelection,
  onCropCanvasToSelection,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onStrokeSelectionBorder,
  onAdjustBrightnessChange,
  onAdjustContrastChange,
  onAdjustSaturationChange,
  onAdjustApply,
  onAdjustCancel,
  moveAutoSelect,
  onMoveAutoSelectChange,
  transformScaleX,
  transformScaleY,
  transformRotation,
  onTransformCommit,
  onTransformCancel,
  onTransformReset,
  transformAutoSelect,
  transformMode,
  onTransformAutoSelectChange,
  onTransformModeChange,
  cropHasPendingRect,
  onCropApply,
  onCropCancelPreview,
  segmentSettings,
  onSegmentSettingsChange,
  segmentationStatus,
  segmentModelInfo,
  onRunSegmentation,
  onApplySegmentResult,
  onDiscardSegmentResult,
  onCancelSegmentation,
  onClearSegmentPrompts,
  onCheckSegmentModel
}: ToolSettingsPanelProps) {
  if (activeTool === "brush") {
    return (
      <BrushSettingsPanel
        settings={brushSettings}
        onChange={onBrushSettingsChange}
      />
    );
  }
  if (activeTool === "pencil") {
    return (
      <PencilSettingsPanel
        settings={pencilSettings}
        onChange={onPencilSettingsChange}
      />
    );
  }
  if (activeTool === "eraser") {
    const eraserMode = effectiveEraserMode(eraserSettings);
    return (
      <>
        <EraserSettingsPanel
          settings={eraserSettings}
          onChange={onEraserSettingsChange}
        />
        {eraserMode === "brush" ? (
          <BrushSettingsPanel
            settings={brushSettings}
            onChange={onBrushSettingsChange}
            omitPaintSliders
            omitStrokeAssist
          />
        ) : (
          <PencilSettingsPanel
            settings={pencilSettings}
            onChange={onPencilSettingsChange}
            omitPaintSliders
            omitStrokeAssist
          />
        )}
      </>
    );
  }
  if (activeTool === "shape") {
    return (
      <ShapeSettingsPanel
        settings={shapeSettings}
        onChange={onShapeSettingsChange}
      />
    );
  }
  if (activeTool === "fill") {
    return (
      <FillSettingsPanel
        settings={fillSettings}
        onChange={onFillSettingsChange}
      />
    );
  }
  if (activeTool === "blur") {
    return (
      <BlurSettingsPanel
        settings={blurSettings}
        onChange={onBlurSettingsChange}
      />
    );
  }
  if (activeTool === "gradient") {
    return (
      <GradientSettingsPanel
        settings={gradientSettings}
        onChange={onGradientSettingsChange}
      />
    );
  }
  if (activeTool === "crop") {
    return (
      <CropSettingsPanel
        hasPendingCrop={cropHasPendingRect ?? false}
        onApply={onCropApply ?? noop}
        onCancel={onCropCancelPreview ?? noop}
      />
    );
  }
  if (activeTool === "clone_stamp") {
    return (
      <CloneStampSettingsPanel
        settings={cloneStampSettings}
        onChange={onCloneStampSettingsChange}
      />
    );
  }
  if (activeTool === "select") {
    return (
      <SelectSettingsPanel
        settings={selectSettings}
        onChange={onSelectSettingsChange}
        hasActiveSelection={hasActiveSelection}
        onInvertSelection={onInvertSelection}
        onCropCanvasToSelection={onCropCanvasToSelection}
        onFeatherSelection={onFeatherSelection}
        onSmoothSelectionBorders={onSmoothSelectionBorders}
        onStrokeSelectionBorder={onStrokeSelectionBorder}
      />
    );
  }
  if (activeTool === "move") {
    return (
      <MoveSettingsPanel
        autoSelect={moveAutoSelect ?? true}
        onAutoSelectChange={onMoveAutoSelectChange ?? noop}
      />
    );
  }
  if (activeTool === "eyedropper") {
    return <NoSettingsMessage />;
  }
  if (activeTool === "transform") {
    return (
      <TransformSettingsPanel
        scaleX={transformScaleX ?? 1}
        scaleY={transformScaleY ?? 1}
        rotation={transformRotation ?? 0}
        autoSelect={transformAutoSelect ?? true}
        mode={transformMode ?? "auto"}
        onAutoSelectChange={onTransformAutoSelectChange ?? noop}
        onModeChange={onTransformModeChange ?? noop}
        onCommit={onTransformCommit ?? noop}
        onCancel={onTransformCancel ?? noop}
        onReset={onTransformReset ?? noop}
      />
    );
  }
  if (activeTool === "adjust") {
    return (
      <AdjustmentsSettingsPanel
        brightness={adjustBrightness ?? 0}
        contrast={adjustContrast ?? 0}
        saturation={adjustSaturation ?? 0}
        onBrightnessChange={onAdjustBrightnessChange ?? noop}
        onContrastChange={onAdjustContrastChange ?? noop}
        onSaturationChange={onAdjustSaturationChange ?? noop}
        onApply={onAdjustApply ?? noop}
        onCancel={onAdjustCancel ?? noop}
      />
    );
  }
  if (activeTool === "segment" && segmentSettings && onSegmentSettingsChange) {
    return (
      <SegmentSettingsPanel
        settings={segmentSettings}
        onChange={onSegmentSettingsChange}
        segmentationStatus={segmentationStatus ?? "idle"}
        modelInfo={segmentModelInfo ?? null}
        onRunSegmentation={onRunSegmentation ?? noop}
        onApplyResult={onApplySegmentResult ?? noop}
        onDiscardResult={onDiscardSegmentResult ?? noop}
        onCancelSegmentation={onCancelSegmentation ?? noop}
        onClearPrompts={onClearSegmentPrompts ?? noop}
        onCheckModel={onCheckSegmentModel ?? noop}
      />
    );
  }
  return null;
});
