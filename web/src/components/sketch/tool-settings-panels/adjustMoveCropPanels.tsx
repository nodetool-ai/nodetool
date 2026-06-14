import React, { memo } from "react";
import {
  Checkbox,
  FormControlLabel,
  Slider
} from "@mui/material";
import { FlexRow, Box, Text, Tooltip, EditorButton, ToolbarIconButton } from "../../ui_primitives";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  sketchSliderSx,
  sketchButtonSmallSx,
  sketchHintTextSx,
  SKETCH_FONT,
  SKETCH_COLORS
} from "../sketchStyles";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";
import { TransformMode } from "../types";
import { getToolbarTransformModes } from "../transform/modes";

interface AdjustmentsSettingsPanelProps {
  brightness: number;
  contrast: number;
  saturation: number;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export const AdjustmentsSettingsPanel = memo(function AdjustmentsSettingsPanel({
  brightness,
  contrast,
  saturation,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onApply,
  onCancel
}: AdjustmentsSettingsPanelProps) {
  const hasChanges = brightness !== 0 || contrast !== 0 || saturation !== 0;
  return (
    <>
      <Box className="setting-row">
        <Text className="setting-label">Bright</Text>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={-100}
          max={100}
          value={brightness}
          onChange={(_, v) => onBrightnessChange(v as number)}
        />
        <Text className="setting-value">{brightness}</Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">Contrast</Text>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={-100}
          max={100}
          value={contrast}
          onChange={(_, v) => onContrastChange(v as number)}
        />
        <Text className="setting-value">{contrast}</Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">Satur.</Text>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={-100}
          max={100}
          value={saturation}
          onChange={(_, v) => onSaturationChange(v as number)}
        />
        <Text className="setting-value">{saturation}</Text>
      </Box>
      <FlexRow gap={0.5}>
        <EditorButton
          size="small"
          variant="outlined"
          color="primary"
          disabled={!hasChanges}
          onClick={onApply}
          sx={{ ...sketchButtonSmallSx, flex: 1 }}
        >
          Apply
        </EditorButton>
        <EditorButton
          size="small"
          variant="outlined"
          disabled={!hasChanges}
          onClick={onCancel}
          sx={{ ...sketchButtonSmallSx, flex: 1 }}
        >
          Cancel
        </EditorButton>
      </FlexRow>
    </>
  );
});

interface MoveSettingsPanelProps {
  autoSelect: boolean;
  onAutoSelectChange: (enabled: boolean) => void;
}

export const MoveSettingsPanel = memo(function MoveSettingsPanel({
  autoSelect,
  onAutoSelectChange
}: MoveSettingsPanelProps) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={autoSelect}
          onChange={(e) => onAutoSelectChange(e.target.checked)}
          size="small"
          sx={{ padding: "2px 4px" }}
        />
      }
      label={
        <Text
          sx={{ ...SKETCH_FONT, fontSize: "var(--fontSizeSmall)", userSelect: "none" }}
        >
          Auto-Select
        </Text>
      }
      sx={{ mr: 2, ml: 0 }}
    />
  );
});

interface TransformSettingsPanelProps {
  scaleX: number;
  scaleY: number;
  rotation: number;
  autoSelect: boolean;
  mode: TransformMode;
  onAutoSelectChange: (enabled: boolean) => void;
  onModeChange: (mode: TransformMode) => void;
  onCommit: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export const TransformSettingsPanel = memo(function TransformSettingsPanel({
  scaleX,
  scaleY,
  rotation,
  autoSelect,
  mode,
  onAutoSelectChange,
  onModeChange,
  onCommit,
  onCancel,
  onReset
}: TransformSettingsPanelProps) {
  const rotDeg = Math.round(((rotation * 180) / Math.PI) * 10) / 10;
  return (
    <>
      <FormControlLabel
        control={
          <Checkbox
            checked={autoSelect}
            onChange={(e) => onAutoSelectChange(e.target.checked)}
            size="small"
            sx={{ padding: "2px 4px" }}
          />
        }
        label={
          <Text
            sx={{ ...SKETCH_FONT, fontSize: "var(--fontSizeSmall)", userSelect: "none" }}
          >
            Auto-Select
          </Text>
        }
        sx={{ mr: 2, ml: 0 }}
      />
      <Box className="setting-row">
        <Text className="setting-label">Mode</Text>
        <SketchModeToggle
          value={mode}
          onChange={(_, nextMode: TransformMode | null) => {
            if (nextMode) {
              onModeChange(nextMode);
            }
          }}
        >
          {getToolbarTransformModes().map((modeHandler) => {
            const button = (
              <SketchModeOption key={modeHandler.id} value={modeHandler.id}>
                {modeHandler.label}
              </SketchModeOption>
            );
            return modeHandler.tooltip ? (
              <Tooltip key={modeHandler.id} title={modeHandler.tooltip}>
                {button}
              </Tooltip>
            ) : (
              button
            );
          })}
        </SketchModeToggle>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">Scale X</Text>
        <Text className="setting-value">
          {(scaleX * 100).toFixed(0)}%
        </Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">Scale Y</Text>
        <Text className="setting-value">
          {(scaleY * 100).toFixed(0)}%
        </Text>
      </Box>
      <Box className="setting-row">
        <Text className="setting-label">Rotation</Text>
        <Text className="setting-value">{rotDeg}°</Text>
      </Box>
      <FlexRow sx={{ gap: "2px", ml: 1 }}>
        <ToolbarIconButton
          icon={<CheckIcon sx={{ fontSize: 18 }} />}
          tooltip="Commit (Enter)"
          tooltipPlacement="bottom"
          onClick={onCommit}
          sx={{ padding: "4px", color: "success.main" }}
        />
        <ToolbarIconButton
          icon={<CloseIcon sx={{ fontSize: 18 }} />}
          tooltip="Cancel (Esc)"
          tooltipPlacement="bottom"
          onClick={onCancel}
          sx={{ padding: "4px", color: "error.main" }}
        />
        <ToolbarIconButton
          icon={<RestartAltIcon sx={{ fontSize: 18 }} />}
          tooltip="Reset"
          tooltipPlacement="bottom"
          onClick={onReset}
          sx={{ padding: "4px", color: SKETCH_COLORS.textSecondary }}
        />
      </FlexRow>
    </>
  );
});

export const NoSettingsMessage = memo(function NoSettingsMessage() {
  return (
    <Text sx={{ ...sketchHintTextSx }}>
      No settings for this tool.
    </Text>
  );
});

export const CropSettingsPanel = memo(function CropSettingsPanel({
  hasPendingCrop,
  onApply,
  onCancel
}: {
  hasPendingCrop: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Text sx={{ ...sketchHintTextSx }}>
        Drag to outline the crop. Drag edges or corners to adjust. Press Enter
        or Apply to crop the canvas.
      </Text>
      <FlexRow sx={{ gap: "2px", ml: 1 }}>
        <ToolbarIconButton
          icon={<CheckIcon sx={{ fontSize: 18 }} />}
          tooltip="Apply crop (Enter)"
          tooltipPlacement="bottom"
          disabled={!hasPendingCrop}
          onClick={onApply}
          sx={{ padding: "4px", color: "success.main" }}
        />
        <ToolbarIconButton
          icon={<CloseIcon sx={{ fontSize: 18 }} />}
          tooltip="Cancel crop preview (Esc)"
          tooltipPlacement="bottom"
          disabled={!hasPendingCrop}
          onClick={onCancel}
          sx={{ padding: "4px", color: "error.main" }}
        />
      </FlexRow>
    </>
  );
});
