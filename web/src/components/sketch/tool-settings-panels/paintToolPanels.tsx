import React, { memo } from "react";
import { Box, Typography, Slider } from "@mui/material";
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
import { sketchSliderSx } from "../sketchStyles";
import { effectiveEraserMode } from "./shared";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";

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
      <SketchModeToggle
        value={assist.preset}
        onChange={(_, v) => {
          if (v) {
            pushAssist(createStrokeAssistPreset(v as StrokeAssistPreset));
          }
        }}
        sx={{ mb: "4px", flexWrap: "wrap" }}
      >
        {STROKE_ASSIST_PRESETS.map(({ value, label }) => (
          <SketchModeOption key={value} value={value}>
            {label}
          </SketchModeOption>
        ))}
      </SketchModeToggle>
      <SketchModeToggle
        value={assist.mode}
        onChange={(_, v) => {
          if (v) {
            updateAssist({ mode: v as StrokeAssistSettings["mode"] });
          }
        }}
        sx={{ mb: "4px" }}
      >
        <SketchModeOption value="stabilizer">Smooth</SketchModeOption>
        <SketchModeOption value="lazy">Lazy</SketchModeOption>
      </SketchModeToggle>
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
      <SketchModeToggle
        value={assist.snapMode}
        onChange={(_, v) => {
          if (v) {
            updateAssist({ snapMode: v as StrokeAssistSettings["snapMode"] });
          }
        }}
        sx={{ mb: "4px" }}
      >
        <SketchModeOption value="off">Free</SketchModeOption>
        <SketchModeOption value="angle">Angle</SketchModeOption>
      </SketchModeToggle>
      {assist.snapMode === "angle" ? (
        <>
          <SketchModeToggle
            value={assist.angleIncrement}
            onChange={(_, v) => {
              if (v) {
                updateAssist({ angleIncrement: v as number });
              }
            }}
            sx={{ mb: "4px" }}
          >
            {STROKE_ASSIST_ANGLE_OPTIONS.map((angle) => (
              <SketchModeOption key={angle} value={angle}>
                {angle}°
              </SketchModeOption>
            ))}
          </SketchModeToggle>
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
      <SketchModeToggle
        value={settings.brushType || "round"}
        onChange={(_, v) => {
          if (v) {
            onChange({ brushType: v as BrushType });
          }
        }}
        sx={{ mb: "4px" }}
      >
        <SketchModeOption value="round">Round</SketchModeOption>
        <SketchModeOption value="soft">Soft</SketchModeOption>
        <SketchModeOption value="airbrush">Air</SketchModeOption>
        <SketchModeOption value="spray">Spray</SketchModeOption>
      </SketchModeToggle>
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
      <SketchModeToggle
        value={mode}
        onChange={(_, v) => {
          if (v) {
            onChange({ mode: v as EraserMode });
          }
        }}
        sx={{ mb: "4px" }}
      >
        <SketchModeOption value="brush">Brush</SketchModeOption>
        <SketchModeOption value="pencil">Pencil</SketchModeOption>
      </SketchModeToggle>
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
