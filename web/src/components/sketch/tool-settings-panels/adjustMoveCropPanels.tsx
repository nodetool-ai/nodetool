import React, { memo } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Slider,
  IconButton,
  Tooltip,
  Typography
} from "@mui/material";
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
        <Typography className="setting-label">Bright</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={-100}
          max={100}
          value={brightness}
          onChange={(_, v) => onBrightnessChange(v as number)}
        />
        <Typography className="setting-value">{brightness}</Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Contrast</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={-100}
          max={100}
          value={contrast}
          onChange={(_, v) => onContrastChange(v as number)}
        />
        <Typography className="setting-value">{contrast}</Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Satur.</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={-100}
          max={100}
          value={saturation}
          onChange={(_, v) => onSaturationChange(v as number)}
        />
        <Typography className="setting-value">{saturation}</Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <Button
          size="small"
          variant="outlined"
          color="primary"
          disabled={!hasChanges}
          onClick={onApply}
          sx={{ ...sketchButtonSmallSx, flex: 1 }}
        >
          Apply
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasChanges}
          onClick={onCancel}
          sx={{ ...sketchButtonSmallSx, flex: 1 }}
        >
          Cancel
        </Button>
      </Box>
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
        <Typography
          sx={{ ...SKETCH_FONT, fontSize: "0.75rem", userSelect: "none" }}
        >
          Auto-Select
        </Typography>
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
          <Typography
            sx={{ ...SKETCH_FONT, fontSize: "0.75rem", userSelect: "none" }}
          >
            Auto-Select
          </Typography>
        }
        sx={{ mr: 2, ml: 0 }}
      />
      <Box className="setting-row">
        <Typography className="setting-label">Mode</Typography>
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
        <Typography className="setting-label">Scale X</Typography>
        <Typography className="setting-value">
          {(scaleX * 100).toFixed(0)}%
        </Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Scale Y</Typography>
        <Typography className="setting-value">
          {(scaleY * 100).toFixed(0)}%
        </Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Rotation</Typography>
        <Typography className="setting-value">{rotDeg}°</Typography>
      </Box>
      <Box sx={{ display: "flex", gap: "2px", ml: 1 }}>
        <Tooltip title="Commit (Enter)" placement="bottom">
          <IconButton
            size="small"
            color="success"
            onClick={onCommit}
            sx={{ padding: "3px" }}
          >
            <CheckIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cancel (Esc)" placement="bottom">
          <IconButton
            size="small"
            color="error"
            onClick={onCancel}
            sx={{ padding: "3px" }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset" placement="bottom">
          <IconButton
            size="small"
            onClick={onReset}
            sx={{
              color: SKETCH_COLORS.textSecondary,
              padding: "3px"
            }}
          >
            <RestartAltIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </>
  );
});

export const NoSettingsMessage = memo(function NoSettingsMessage() {
  return (
    <Typography sx={{ ...sketchHintTextSx }}>
      No settings for this tool.
    </Typography>
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
      <Typography sx={{ ...sketchHintTextSx }}>
        Drag to outline the crop. Drag edges or corners to adjust. Press Enter
        or Apply to crop the canvas.
      </Typography>
      <Box sx={{ display: "flex", gap: "2px", ml: 1 }}>
        <Tooltip title="Apply crop (Enter)" placement="bottom">
          <IconButton
            size="small"
            color="success"
            disabled={!hasPendingCrop}
            onClick={onApply}
            sx={{ padding: "3px" }}
          >
            <CheckIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Cancel crop preview (Esc)" placement="bottom">
          <IconButton
            size="small"
            color="error"
            disabled={!hasPendingCrop}
            onClick={onCancel}
            sx={{ padding: "3px" }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </>
  );
});
