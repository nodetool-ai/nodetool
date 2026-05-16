import React, { memo, useState } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Slider,
  Typography
} from "@mui/material";
import {
  BlurSettings,
  CloneStampSampling,
  CloneStampSettings,
  colorToHex6,
  FillSettings,
  GradientSettings,
  mergeRgbHexIntoColor,
  ShapeSettings,
  ShapeToolType
} from "../types";
import {
  colorSwatchSx,
  sketchHintTextSx,
  sketchSliderSx,
  SKETCH_FONT
} from "../sketchStyles";
import ColorPickerPopover from "../ColorPickerPopover";
import { SketchModeToggle, SketchModeOption } from "./SketchModeToggle";

interface ShapeSettingsPanelProps {
  settings: ShapeSettings;
  onChange: (settings: Partial<ShapeSettings>) => void;
}

interface FillSettingsPanelProps {
  settings: FillSettings;
  onChange: (settings: Partial<FillSettings>) => void;
}

interface BlurSettingsPanelProps {
  settings: BlurSettings;
  onChange: (settings: Partial<BlurSettings>) => void;
}

interface GradientSettingsPanelProps {
  settings: GradientSettings;
  onChange: (settings: Partial<GradientSettings>) => void;
}

interface CloneStampSettingsPanelProps {
  settings: CloneStampSettings;
  onChange: (settings: Partial<CloneStampSettings>) => void;
}

const SHAPE_TYPES: { value: ShapeToolType; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "rectangle", label: "Rect" },
  { value: "ellipse", label: "Ellipse" },
  { value: "arrow", label: "Arrow" }
];

export const ShapeSettingsPanel = memo(function ShapeSettingsPanel({
  settings,
  onChange
}: ShapeSettingsPanelProps) {
  const canFill =
    settings.shapeType === "rectangle" || settings.shapeType === "ellipse";
  return (
    <>
      <SketchModeToggle
        value={settings.shapeType ?? "rectangle"}
        onChange={(_, v) => {
          if (v) {
            onChange({ shapeType: v as ShapeToolType });
          }
        }}
        sx={{ mb: "4px" }}
      >
        {SHAPE_TYPES.map(({ value, label }) => (
          <SketchModeOption key={value} value={value}>
            {label}
          </SketchModeOption>
        ))}
      </SketchModeToggle>
      <Box className="setting-row">
        <Typography className="setting-label">Stroke</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.strokeColor)}
          onChange={(e) =>
            onChange({
              strokeColor: mergeRgbHexIntoColor(
                e.target.value,
                settings.strokeColor
              )
            })
          }
        />
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Width</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={50}
          value={settings.strokeWidth}
          onChange={(_, v) => onChange({ strokeWidth: v as number })}
        />
        <Typography className="setting-value">
          {settings.strokeWidth}
        </Typography>
      </Box>
      {canFill && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={settings.filled}
                onChange={(e) => onChange({ filled: e.target.checked })}
              />
            }
            label={
              <Typography sx={{ fontSize: SKETCH_FONT.section }}>Fill</Typography>
            }
          />
          {settings.filled && (
            <Box className="setting-row">
              <Typography className="setting-label">Fill</Typography>
              <input
                type="color"
                className="color-input"
                value={colorToHex6(settings.fillColor)}
                onChange={(e) =>
                  onChange({
                    fillColor: mergeRgbHexIntoColor(
                      e.target.value,
                      settings.fillColor
                    )
                  })
                }
              />
            </Box>
          )}
        </>
      )}
    </>
  );
});

export const FillSettingsPanel = memo(function FillSettingsPanel({
  settings,
  onChange
}: FillSettingsPanelProps) {
  return (
    <Box className="setting-row">
      <Typography className="setting-label">Tolerance</Typography>
      <Slider
        sx={sketchSliderSx}
        size="small"
        min={0}
        max={128}
        value={settings.tolerance}
        onChange={(_, v) => onChange({ tolerance: v as number })}
      />
      <Typography className="setting-value">{settings.tolerance}</Typography>
    </Box>
  );
});

export const BlurSettingsPanel = memo(function BlurSettingsPanel({
  settings,
  onChange
}: BlurSettingsPanelProps) {
  return (
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
        <Typography className="setting-label">Strength</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={20}
          value={settings.strength}
          onChange={(_, v) => onChange({ strength: v as number })}
        />
        <Typography className="setting-value">{settings.strength}</Typography>
      </Box>
    </>
  );
});

export const GradientSettingsPanel = memo(function GradientSettingsPanel({
  settings,
  onChange
}: GradientSettingsPanelProps) {
  const [startAnchor, setStartAnchor] = useState<HTMLElement | null>(null);
  const [endAnchor, setEndAnchor] = useState<HTMLElement | null>(null);
  const [startInitial, setStartInitial] = useState(settings.startColor);
  const [endInitial, setEndInitial] = useState(settings.endColor);

  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Start</Typography>
        <Box
          sx={{ ...colorSwatchSx }}
          onClick={(e) => {
            setStartInitial(settings.startColor);
            setStartAnchor(e.currentTarget);
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundColor: settings.startColor
            }}
          />
        </Box>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">End</Typography>
        <Box
          sx={{ ...colorSwatchSx }}
          onClick={(e) => {
            setEndInitial(settings.endColor);
            setEndAnchor(e.currentTarget);
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundColor: settings.endColor
            }}
          />
        </Box>
      </Box>
      <SketchModeToggle
        value={settings.type}
        onChange={(_, v) => {
          if (v) {
            onChange({ type: v });
          }
        }}
      >
        <SketchModeOption value="linear">Linear</SketchModeOption>
        <SketchModeOption value="radial">Radial</SketchModeOption>
      </SketchModeToggle>

      <ColorPickerPopover
        anchorEl={startAnchor}
        color={settings.startColor}
        initialColor={startInitial}
        onColorChange={(c) => onChange({ startColor: c })}
        onClose={() => setStartAnchor(null)}
      />
      <ColorPickerPopover
        anchorEl={endAnchor}
        color={settings.endColor}
        initialColor={endInitial}
        onColorChange={(c) => onChange({ endColor: c })}
        onClose={() => setEndAnchor(null)}
      />
    </>
  );
});

export const CloneStampSettingsPanel = memo(function CloneStampSettingsPanel({
  settings,
  onChange
}: CloneStampSettingsPanelProps) {
  return (
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
      <Box className="setting-row">
        <Typography className="setting-label">Hardness</Typography>
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
      <SketchModeToggle
        value={settings.sampling}
        onChange={(_, v) => {
          if (v) {
            onChange({ sampling: v as CloneStampSampling });
          }
        }}
      >
        <SketchModeOption value="active_layer">Active Layer</SketchModeOption>
        <SketchModeOption value="composited">All Layers</SketchModeOption>
      </SketchModeToggle>
      <Typography sx={{ ...sketchHintTextSx, mt: 1 }}>
        Alt+click to set source point
      </Typography>
    </>
  );
});
