/**
 * SketchToolTopBar
 *
 * Horizontal bar above the canvas: tool-specific settings only.
 * Color controls live in the left toolbar (SketchToolbar).
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
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
  SelectSettings
} from "./types";
import { ToolSettingsPanel } from "./ToolSettingsPanels";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    backgroundColor: theme.vars.palette.grey[800],
    borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
    minHeight: "40px",
    overflowX: "auto",
    flexShrink: 0,
    "& .MuiIconButton-root": {
      padding: "3px"
    },
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      "& .MuiSlider-root": {
        width: "80px",
        minWidth: "60px"
      },
      "& .setting-label": {
        fontSize: "0.65rem",
        whiteSpace: "nowrap",
        color: theme.vars.palette.grey[300]
      },
      "& .setting-value": {
        fontSize: "0.65rem",
        minWidth: "24px",
        textAlign: "right",
        color: theme.vars.palette.grey[200]
      }
    },
    "& .MuiToggleButtonGroup-root": {
      "& .MuiToggleButton-root": {
        padding: "2px 6px",
        fontSize: "0.6rem"
      }
    }
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
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
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
  onFeatherSelection,
  onSmoothSelectionBorders,
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
  onTransformReset
}) => {
  const theme = useTheme();

  return (
    <Box className="sketch-tool-top-bar" css={styles(theme)}>
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
        onFeatherSelection={onFeatherSelection}
        onSmoothSelectionBorders={onSmoothSelectionBorders}
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
      />
    </Box>
  );
};

export default memo(SketchToolTopBar);
