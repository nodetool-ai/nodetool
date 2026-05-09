import React, { memo } from "react";
import {
  Box,
  Typography,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Button
} from "@mui/material";
import {
  BrushSettings,
  BrushType,
  createStrokeAssistPreset,
  EraserMode,
  EraserSettings,
  PencilSettings,
  resolveStrokeAssistSettings,
  StrokeAssistPreset,
  StrokeAssistSettings
} from "../types";
import { sketchSliderSx, toggleButtonSmallSx } from "../sketchStyles";
import { effectiveEraserMode } from "./shared";

interface BrushSettingsPanelProps {
  settings: BrushSettings;
  onChange: (settings: Partial<BrushSettings>) => void;
  /** Hide size + brush opacity (e.g. eraser uses `toolSettings.eraser` for those). */
  omitPaintSliders?: boolean;
  /** Hide stroke assist; eraser keeps assist on `toolSettings.eraser` only (see EraserEngine). */
  omitStrokeAssist?: boolean;
}

interface PencilSettingsPanelProps {
  settings: PencilSettings;
  onChange: (settings: Partial<PencilSettings>) => void;
  /** Hide size + pencil opacity (e.g. eraser uses `toolSettings.eraser` for those). */
  omitPaintSliders?: boolean;
  /** Hide stroke assist; eraser keeps assist on `toolSettings.eraser` only (see EraserEngine). */
  omitStrokeAssist?: boolean;
}

interface EraserSettingsPanelProps {
  settings: EraserSettings;
  onChange: (settings: Partial<EraserSettings>) => void;
}

interface StrokeAssistToolSettings {
  stabilizer: number;
  strokeAssist?: StrokeAssistSettings;
}

interface StrokeAssistSettingsPanelProps<T extends StrokeAssistToolSettings> {
  settings: T;
  onChange: (settings: Partial<T>) => void;
}

const STROKE_ASSIST_PRESETS: Array<{
  value: Exclude<StrokeAssistPreset, "custom">;
  label: string;
}> = [
  { value: "smooth", label: "Smooth" },
  { value: "lazy", label: "Lazy" },
  { value: "inking", label: "Ink" }
];

const STROKE_ASSIST_ANGLE_OPTIONS = [15, 30, 45, 90];

function StrokeAssistSettingsPanel<T extends StrokeAssistToolSettings>({
  settings,
  onChange
}: StrokeAssistSettingsPanelProps<T>) {
  const assist = resolveStrokeAssistSettings(
    settings.stabilizer,
    settings.strokeAssist
  );

  const pushAssist = (nextAssist: StrokeAssistSettings) => {
    onChange({
      strokeAssist: nextAssist,
      stabilizer: nextAssist.mode === "stabilizer" ? nextAssist.strength : 0
    } as Partial<T>);
  };

  const updateAssist = (partial: Partial<StrokeAssistSettings>) => {
    pushAssist({
      ...assist,
      ...partial,
      preset: "custom"
    });
  };

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          mb: "4px"
        }}
      >
        {STROKE_ASSIST_PRESETS.map(({ value, label }) => (
          <Button
            key={value}
            variant={assist.preset === value ? "contained" : "outlined"}
            size="small"
            onClick={() => pushAssist(createStrokeAssistPreset(value))}
          >
            {label}
          </Button>
        ))}
      </Box>
      <ToggleButtonGroup
        value={assist.mode}
        exclusive
        onChange={(_, v) => {
          if (v) {
            updateAssist({ mode: v as StrokeAssistSettings["mode"] });
          }
        }}
        size="small"
        sx={{ mb: "4px" }}
      >
        <ToggleButton value="stabilizer" sx={toggleButtonSmallSx}>
          Smooth
        </ToggleButton>
        <ToggleButton value="lazy" sx={toggleButtonSmallSx}>
          Lazy
        </ToggleButton>
      </ToggleButtonGroup>
      <Box className="setting-row">
        <Typography className="setting-label">Assist</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={assist.strength}
          onChange={(_, v) => updateAssist({ strength: v as number })}
        />
        <Typography className="setting-value">
          {Math.round(assist.strength * 100)}%
        </Typography>
      </Box>
      <ToggleButtonGroup
        value={assist.snapMode}
        exclusive
        onChange={(_, v) => {
          if (v) {
            updateAssist({ snapMode: v as StrokeAssistSettings["snapMode"] });
          }
        }}
        size="small"
        sx={{ mb: "4px" }}
      >
        <ToggleButton value="off" sx={toggleButtonSmallSx}>
          Free
        </ToggleButton>
        <ToggleButton value="angle" sx={toggleButtonSmallSx}>
          Angle
        </ToggleButton>
      </ToggleButtonGroup>
      {assist.snapMode === "angle" ? (
        <>
          <ToggleButtonGroup
            value={assist.angleIncrement}
            exclusive
            onChange={(_, v) => {
              if (v) {
                updateAssist({ angleIncrement: v as number });
              }
            }}
            size="small"
            sx={{ mb: "4px" }}
          >
            {STROKE_ASSIST_ANGLE_OPTIONS.map((angle) => (
              <ToggleButton key={angle} value={angle} sx={toggleButtonSmallSx}>
                {angle}°
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Box className="setting-row">
            <Typography className="setting-label">Snap</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={1}
              step={0.01}
              value={assist.snapStrength}
              onChange={(_, v) => updateAssist({ snapStrength: v as number })}
            />
            <Typography className="setting-value">
              {Math.round(assist.snapStrength * 100)}%
            </Typography>
          </Box>
        </>
      ) : null}
    </>
  );
}

export const BrushSettingsPanel = memo(function BrushSettingsPanel({
  settings,
  onChange,
  omitPaintSliders = false,
  omitStrokeAssist = false
}: BrushSettingsPanelProps) {
  return (
    <>
      <ToggleButtonGroup
        value={settings.brushType || "round"}
        exclusive
        onChange={(_, v) => {
          if (v) {
            onChange({ brushType: v as BrushType });
          }
        }}
        size="small"
        sx={{ mb: "4px" }}
      >
        <ToggleButton value="round" sx={toggleButtonSmallSx}>
          Round
        </ToggleButton>
        <ToggleButton value="soft" sx={toggleButtonSmallSx}>
          Soft
        </ToggleButton>
        <ToggleButton value="airbrush" sx={toggleButtonSmallSx}>
          Air
        </ToggleButton>
        <ToggleButton value="spray" sx={toggleButtonSmallSx}>
          Spray
        </ToggleButton>
      </ToggleButtonGroup>
      {!omitPaintSliders && (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Size</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={1}
              max={200}
              value={settings.size}
              onChange={(_, v) => onChange({ size: v as number })}
            />
            <Typography className="setting-value">{settings.size}</Typography>
          </Box>
          <Box className="setting-row">
            <Typography className="setting-label">Opacity</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={1}
              step={0.01}
              value={settings.opacity}
              onChange={(_, v) => onChange({ opacity: v as number })}
            />
            <Typography className="setting-value">
              {Math.round(settings.opacity * 100)}%
            </Typography>
          </Box>
        </>
      )}
      <Box className="setting-row">
        <Typography className="setting-label">Hard</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.hardness}
          onChange={(_, v) => onChange({ hardness: v as number })}
        />
        <Typography className="setting-value">
          {Math.round(settings.hardness * 100)}%
        </Typography>
      </Box>
      {(settings.brushType === "round" || settings.brushType === "soft") && (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Round</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0.1}
              max={1}
              step={0.01}
              value={settings.roundness ?? 1.0}
              onChange={(_, v) => onChange({ roundness: v as number })}
            />
            <Typography className="setting-value">
              {Math.round((settings.roundness ?? 1.0) * 100)}%
            </Typography>
          </Box>
          <Box className="setting-row">
            <Typography className="setting-label">Angle</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={360}
              step={1}
              value={settings.angle ?? 0}
              onChange={(_, v) => onChange({ angle: v as number })}
            />
            <Typography className="setting-value">
              {settings.angle ?? 0}°
            </Typography>
          </Box>
        </>
      )}
      {!omitStrokeAssist ? (
        <StrokeAssistSettingsPanel settings={settings} onChange={onChange} />
      ) : null}
    </>
  );
});

export const PencilSettingsPanel = memo(function PencilSettingsPanel({
  settings,
  onChange,
  omitPaintSliders = false,
  omitStrokeAssist = false
}: PencilSettingsPanelProps) {
  return (
    <>
      {!omitPaintSliders && (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Size</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={1}
              max={10}
              value={settings.size}
              onChange={(_, v) => onChange({ size: v as number })}
            />
            <Typography className="setting-value">{settings.size}</Typography>
          </Box>
          <Box className="setting-row">
            <Typography className="setting-label">Opacity</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={1}
              step={0.01}
              value={settings.opacity}
              onChange={(_, v) => onChange({ opacity: v as number })}
            />
            <Typography className="setting-value">
              {Math.round(settings.opacity * 100)}%
            </Typography>
          </Box>
        </>
      )}
      {!omitStrokeAssist ? (
        <StrokeAssistSettingsPanel settings={settings} onChange={onChange} />
      ) : null}
    </>
  );
});

export const EraserSettingsPanel = memo(function EraserSettingsPanel({
  settings,
  onChange
}: EraserSettingsPanelProps) {
  const mode = effectiveEraserMode(settings);
  return (
    <>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, v) => {
          if (v) {
            onChange({ mode: v as EraserMode });
          }
        }}
        size="small"
        sx={{ mb: "4px" }}
      >
        <ToggleButton value="brush" sx={toggleButtonSmallSx}>
          Brush
        </ToggleButton>
        <ToggleButton value="pencil" sx={toggleButtonSmallSx}>
          Pencil
        </ToggleButton>
      </ToggleButtonGroup>
      <Box className="setting-row">
        <Typography className="setting-label">Size</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={200}
          value={settings.size}
          onChange={(_, v) => onChange({ size: v as number })}
        />
        <Typography className="setting-value">{settings.size}</Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Opacity</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.opacity}
          onChange={(_, v) => onChange({ opacity: v as number })}
        />
        <Typography className="setting-value">
          {Math.round(settings.opacity * 100)}%
        </Typography>
      </Box>
      <StrokeAssistSettingsPanel settings={settings} onChange={onChange} />
    </>
  );
});
