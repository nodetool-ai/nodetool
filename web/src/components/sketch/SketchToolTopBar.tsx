/**
 * SketchToolTopBar
 *
 * Horizontal bar above the canvas: tool-specific settings only.
 * Pen pressure lives in the sketch modal header only (not duplicated here).
 * Color controls live in the left toolbar (SketchToolbar).
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { EditorButton, FlexRow, Text, Tooltip } from "../ui_primitives";
import { getToolSettingsLabel } from "./tool-settings-panels/getToolSettingsLabel";
import {
  SketchTool,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  SelectSettings,
  SegmentSettings,
  SegmentationStatus,
  TransformMode
} from "./types";
import type { SamModelInfo } from "./sam";
import { ToolSettingsPanel } from "./ToolSettingsPanels";
import {
  SKETCH_FONT,
  SKETCH_SPACING,
  settingRowChildrenSx
} from "./sketchStyles";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: SKETCH_SPACING.lg,
    padding: `${SKETCH_SPACING.sm} ${SKETCH_SPACING.lg}`,
    // Sit on the same chrome tier as the editor's other bars (mode/prompt,
    // tool rail, status): grey[900] surface with a grey[800] hairline. The
    // bar previously rode two tonal steps lighter (grey[800]/grey[700]),
    // which read as a mismatched band between its darker neighbours.
    backgroundColor: theme.vars.palette.grey[900],
    borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
    minHeight: "40px",
    overflowX: "auto",
    flexWrap: "wrap",
    // Wrapped rows anchor to the top of the bar instead of being
    // re-centered when the row count changes. Without this, toggling
    // the Advanced disclosure (which adds a wrapped row below) made
    // the first row shift by 1px because `alignContent: center` had
    // free space inside `minHeight` only when there was one row.
    alignContent: "flex-start",
    flexShrink: 0,
    "& .MuiIconButton-root": {
      padding: "3px"
    },
    ...settingRowChildrenSx(theme)
  });

export interface SketchToolTopBarProps {
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
  adjustBrightness: number;
  adjustContrast: number;
  adjustSaturation: number;
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
  onCropCanvasToSelection: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onConvertSelectionToBorder: () => void;
  onAdjustBrightnessChange: (value: number) => void;
  onAdjustContrastChange: (value: number) => void;
  onAdjustSaturationChange: (value: number) => void;
  onAdjustApply: () => void;
  onAdjustCancel: () => void;
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
  moveAutoSelect?: boolean;
  onMoveAutoSelectChange?: (enabled: boolean) => void;
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
  /** Collapse the left tool rail + right panels for a chrome-less canvas. */
  onTogglePanelsHidden?: () => void;
  /** Fit the document to the canvas viewport (zoom-to-fit, centered). */
  onFit?: () => void;
}

const SketchToolTopBar: React.FC<SketchToolTopBarProps> = ({
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
  onConvertSelectionToBorder,
  onAdjustBrightnessChange,
  onAdjustContrastChange,
  onAdjustSaturationChange,
  onAdjustApply,
  onAdjustCancel,
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
  moveAutoSelect,
  onMoveAutoSelectChange,
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
  onCheckSegmentModel,
  onTogglePanelsHidden,
  onFit
}) => {
  const theme = useTheme();

  return (
    <FlexRow className="sketch-tool-top-bar" css={styles(theme)}>
      <FlexRow
        align="center"
        gap={0.5}
        className="tool-top-bar__tool-label"
        sx={{ flexShrink: 0 }}
      >
        <Text
          sx={{
            fontSize: SKETCH_FONT.xs,
            color: theme.vars.palette.text.secondary,
            textTransform: "uppercase",
            letterSpacing: "0.06em"
          }}
        >
          Tool
        </Text>
        <Text sx={{ fontSize: SKETCH_FONT.section, fontWeight: 600 }}>
          {getToolSettingsLabel(activeTool)}
        </Text>
      </FlexRow>

      <ToolSettingsPanel
        activeTool={activeTool}
        brushSettings={brushSettings}
        pencilSettings={pencilSettings}
        eraserSettings={eraserSettings}
        shapeSettings={shapeSettings}
        fillSettings={fillSettings}
        blurSettings={blurSettings}
        gradientSettings={gradientSettings}
        cloneStampSettings={cloneStampSettings}
        selectSettings={selectSettings}
        hasActiveSelection={hasActiveSelection}
        adjustBrightness={adjustBrightness}
        adjustContrast={adjustContrast}
        adjustSaturation={adjustSaturation}
        onBrushSettingsChange={onBrushSettingsChange}
        onPencilSettingsChange={onPencilSettingsChange}
        onEraserSettingsChange={onEraserSettingsChange}
        onShapeSettingsChange={onShapeSettingsChange}
        onFillSettingsChange={onFillSettingsChange}
        onBlurSettingsChange={onBlurSettingsChange}
        onGradientSettingsChange={onGradientSettingsChange}
        onCloneStampSettingsChange={onCloneStampSettingsChange}
        onSelectSettingsChange={onSelectSettingsChange}
        onInvertSelection={onInvertSelection}
        onCropCanvasToSelection={onCropCanvasToSelection}
        onFeatherSelection={onFeatherSelection}
        onSmoothSelectionBorders={onSmoothSelectionBorders}
        onConvertSelectionToBorder={onConvertSelectionToBorder}
        onAdjustBrightnessChange={onAdjustBrightnessChange}
        onAdjustContrastChange={onAdjustContrastChange}
        onAdjustSaturationChange={onAdjustSaturationChange}
        onAdjustApply={onAdjustApply}
        onAdjustCancel={onAdjustCancel}
        transformScaleX={transformScaleX}
        transformScaleY={transformScaleY}
        transformRotation={transformRotation}
        onTransformCommit={onTransformCommit}
        onTransformCancel={onTransformCancel}
        onTransformReset={onTransformReset}
        transformAutoSelect={transformAutoSelect}
        transformMode={transformMode}
        onTransformAutoSelectChange={onTransformAutoSelectChange}
        onTransformModeChange={onTransformModeChange}
        moveAutoSelect={moveAutoSelect}
        onMoveAutoSelectChange={onMoveAutoSelectChange}
        cropHasPendingRect={cropHasPendingRect}
        onCropApply={onCropApply}
        onCropCancelPreview={onCropCancelPreview}
        segmentSettings={segmentSettings}
        onSegmentSettingsChange={onSegmentSettingsChange}
        segmentationStatus={segmentationStatus}
        segmentModelInfo={segmentModelInfo}
        onRunSegmentation={onRunSegmentation}
        onApplySegmentResult={onApplySegmentResult}
        onDiscardSegmentResult={onDiscardSegmentResult}
        onCancelSegmentation={onCancelSegmentation}
        onClearSegmentPrompts={onClearSegmentPrompts}
        onCheckSegmentModel={onCheckSegmentModel}
      />

      {(onFit || onTogglePanelsHidden) && (
        <FlexRow
          align="center"
          gap={0.5}
          className="tool-top-bar__global-actions"
          sx={{ ml: "auto", flexShrink: 0 }}
        >
          {onFit && (
            <Tooltip title="Fit canvas to the viewport">
              <span>
                <EditorButton
                  variant="text"
                  size="small"
                  onClick={onFit}
                  startIcon={<FitScreenIcon fontSize="small" />}
                  data-testid="sketch-fit-view"
                >
                  Fit
                </EditorButton>
              </span>
            </Tooltip>
          )}
          {onTogglePanelsHidden && (
            <Tooltip title="Hide panels — press Tab to restore">
              <span>
                <EditorButton
                  variant="text"
                  size="small"
                  onClick={onTogglePanelsHidden}
                  startIcon={<ViewSidebarOutlinedIcon fontSize="small" />}
                  data-testid="sketch-hide-panels"
                >
                  Hide panels
                </EditorButton>
              </span>
            </Tooltip>
          )}
        </FlexRow>
      )}
    </FlexRow>
  );
};

export default memo(SketchToolTopBar);
