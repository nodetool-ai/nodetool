/**
 * ToolSettingsPanels
 *
 * Extracted tool-specific settings panels for the sketch toolbar.
 * Each panel is memoized and receives only the settings + onChange it needs.
 */

import React, { memo } from "react";
import {
  sketchSliderSx,
  toggleButtonSmallSx,
  mergeHexPickerRgbPreserveAlpha as mergeColor
} from "./sketchStyles";
import {
  Box,
  Typography,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox,
  FormControlLabel,
  Button
} from "@mui/material";
import {
  SketchTool,
  ShapeToolType,
  BrushSettings,
  BrushType,
  PencilSettings,
  EraserSettings,
  EraserMode,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  CloneStampSampling,
  SelectSettings,
  SelectToolMode,
  SegmentSettings,
  SegmentPromptMode,
  SegmentSourceLayerAction,
  SegmentationStatus,
  parseColorToRgba,
  rgbaToCss,
  colorToHex6,
  DEFAULT_PRESSURE_MIN_SCALE,
  DEFAULT_PRESSURE_CURVE
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Reusable no-op function to avoid allocations in optional prop fallbacks. */
const noop = () => {};

export function getToolSettingsLabel(tool: SketchTool): string {
  switch (tool) {
    case "brush":
      return "Brush";
    case "pencil":
      return "Pencil";
    case "eraser":
      return "Eraser";
    case "fill":
      return "Fill";
    case "blur":
      return "Blur Brush";
    case "gradient":
      return "Gradient";
    case "crop":
      return "Crop";
    case "select":
      return "Selection";
    case "adjust":
      return "Adjustments";
    case "segment":
      return "Segment";
    case "shape":
      return "Shape";
    case "transform":
      return "Transform";
    default:
      return "Settings";
  }
}

// ─── Individual Panel Props ───────────────────────────────────────────────

interface BrushSettingsPanelProps {
  settings: BrushSettings;
  onChange: (settings: Partial<BrushSettings>) => void;
  /** Hide size + brush opacity (e.g. eraser uses `toolSettings.eraser` for those). */
  omitPaintSliders?: boolean;
}

interface PencilSettingsPanelProps {
  settings: PencilSettings;
  onChange: (settings: Partial<PencilSettings>) => void;
  /** Hide size + pencil opacity (e.g. eraser uses `toolSettings.eraser` for those). */
  omitPaintSliders?: boolean;
}

interface EraserSettingsPanelProps {
  settings: EraserSettings;
  onChange: (settings: Partial<EraserSettings>) => void;
}

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

interface SelectSettingsPanelProps {
  settings: SelectSettings;
  onChange: (settings: Partial<SelectSettings>) => void;
  hasActiveSelection: boolean;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
}

// ─── BrushSettingsPanel ───────────────────────────────────────────────────

export const BrushSettingsPanel = memo(function BrushSettingsPanel({
  settings,
  onChange,
  omitPaintSliders = false
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
      <Box className="setting-row" sx={{ alignItems: "center" }}>
        <Typography className="setting-label">Pressure</Typography>
        <Switch
          size="small"
          checked={settings.pressureSensitivity ?? true}
          onChange={(_, checked) => onChange({ pressureSensitivity: checked })}
        />
      </Box>
      {settings.pressureSensitivity !== false && (
        <Box sx={{ mb: "4px" }}>
          <ToggleButtonGroup
            value={settings.pressureAffects || "both"}
            exclusive
            onChange={(_, v) => {
              if (v) {
                onChange({
                  pressureAffects: v as "size" | "opacity" | "both"
                });
              }
            }}
            size="small"
          >
            <ToggleButton value="size" sx={toggleButtonSmallSx}>
              Size
            </ToggleButton>
            <ToggleButton value="opacity" sx={toggleButtonSmallSx}>
              Opacity
            </ToggleButton>
            <ToggleButton value="both" sx={toggleButtonSmallSx}>
              Both
            </ToggleButton>
          </ToggleButtonGroup>
          <Box className="setting-row">
            <Typography
              className="setting-label"
              title="Size/opacity at minimum pressure (lower = thinner light strokes, wider thin-to-thick range)"
            >
              Light end
            </Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0.02}
              max={0.55}
              step={0.01}
              value={settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE}
              onChange={(_, v) => onChange({ pressureMinScale: v as number })}
            />
            <Typography className="setting-value">
              {Math.round(
                (settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE) * 100
              )}
              %
            </Typography>
          </Box>
          <Box className="setting-row">
            <Typography
              className="setting-label"
              title="Pressure exponent before mapping: 1 = linear; higher = need firmer pressure for full size"
            >
              Curve
            </Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0.5}
              max={2.5}
              step={0.05}
              value={settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE}
              onChange={(_, v) => onChange({ pressureCurve: v as number })}
            />
            <Typography className="setting-value">
              {(settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE).toFixed(2)}
            </Typography>
          </Box>
        </Box>
      )}
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
      <Box className="setting-row">
        <Typography className="setting-label">Smooth</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.stabilizer ?? 0}
          onChange={(_, v) => onChange({ stabilizer: v as number })}
        />
        <Typography className="setting-value">
          {Math.round((settings.stabilizer ?? 0) * 100)}%
        </Typography>
      </Box>
    </>
  );
});

// ─── PencilSettingsPanel ──────────────────────────────────────────────────

export const PencilSettingsPanel = memo(function PencilSettingsPanel({
  settings,
  onChange,
  omitPaintSliders = false
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
      <Box className="setting-row" sx={{ alignItems: "center" }}>
        <Typography className="setting-label">Pressure</Typography>
        <Switch
          size="small"
          checked={settings.pressureSensitivity ?? true}
          onChange={(_, checked) => onChange({ pressureSensitivity: checked })}
        />
      </Box>
      {settings.pressureSensitivity !== false && (
        <Box sx={{ mb: "4px" }}>
          <ToggleButtonGroup
            value={settings.pressureAffects || "both"}
            exclusive
            onChange={(_, v) => {
              if (v) {
                onChange({
                  pressureAffects: v as "size" | "opacity" | "both"
                });
              }
            }}
            size="small"
          >
            <ToggleButton value="size" sx={toggleButtonSmallSx}>
              Size
            </ToggleButton>
            <ToggleButton value="opacity" sx={toggleButtonSmallSx}>
              Opacity
            </ToggleButton>
            <ToggleButton value="both" sx={toggleButtonSmallSx}>
              Both
            </ToggleButton>
          </ToggleButtonGroup>
          <Box className="setting-row">
            <Typography
              className="setting-label"
              title="Size/opacity at minimum pressure (lower = thinner light strokes, wider thin-to-thick range)"
            >
              Light end
            </Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0.02}
              max={0.55}
              step={0.01}
              value={settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE}
              onChange={(_, v) => onChange({ pressureMinScale: v as number })}
            />
            <Typography className="setting-value">
              {Math.round(
                (settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE) * 100
              )}
              %
            </Typography>
          </Box>
          <Box className="setting-row">
            <Typography
              className="setting-label"
              title="Pressure exponent before mapping: 1 = linear; higher = need firmer pressure for full size"
            >
              Curve
            </Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0.5}
              max={2.5}
              step={0.05}
              value={settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE}
              onChange={(_, v) => onChange({ pressureCurve: v as number })}
            />
            <Typography className="setting-value">
              {(settings.pressureCurve ?? DEFAULT_PRESSURE_CURVE).toFixed(2)}
            </Typography>
          </Box>
        </Box>
      )}
      <Box className="setting-row">
        <Typography className="setting-label">Smooth</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.stabilizer ?? 0}
          onChange={(_, v) => onChange({ stabilizer: v as number })}
        />
        <Typography className="setting-value">
          {Math.round((settings.stabilizer ?? 0) * 100)}%
        </Typography>
      </Box>
    </>
  );
});

// ─── EraserSettingsPanel ──────────────────────────────────────────────────

export const EraserSettingsPanel = memo(function EraserSettingsPanel({
  settings,
  onChange
}: EraserSettingsPanelProps) {
  return (
    <>
      <ToggleButtonGroup
        value={settings.mode ?? "brush"}
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
      <Box className="setting-row">
        <Typography className="setting-label">Smooth</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.01}
          value={settings.stabilizer ?? 0}
          onChange={(_, v) => onChange({ stabilizer: v as number })}
        />
        <Typography className="setting-value">
          {Math.round((settings.stabilizer ?? 0) * 100)}%
        </Typography>
      </Box>
    </>
  );
});

// ─── ShapeSettingsPanel ───────────────────────────────────────────────────

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
      <ToggleButtonGroup
        value={settings.shapeType ?? "rectangle"}
        exclusive
        onChange={(_, v) => {
          if (v) {
            onChange({ shapeType: v as ShapeToolType });
          }
        }}
        size="small"
        sx={{ mb: "4px" }}
      >
        {SHAPE_TYPES.map(({ value, label }) => (
          <ToggleButton key={value} value={value} sx={toggleButtonSmallSx}>
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Box className="setting-row">
        <Typography className="setting-label">Stroke</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.strokeColor)}
          onChange={(e) =>
            onChange({
              strokeColor: mergeColor(settings.strokeColor, e.target.value)
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
            label={<Typography sx={{ fontSize: "0.75rem" }}>Fill</Typography>}
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
                    fillColor: mergeColor(settings.fillColor, e.target.value)
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

// ─── FillSettingsPanel ────────────────────────────────────────────────────

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

// ─── BlurSettingsPanel ────────────────────────────────────────────────────

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

// ─── GradientSettingsPanel ────────────────────────────────────────────────

export const GradientSettingsPanel = memo(function GradientSettingsPanel({
  settings,
  onChange
}: GradientSettingsPanelProps) {
  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Start</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.startColor)}
          onChange={(e) =>
            onChange({
              startColor: mergeColor(settings.startColor, e.target.value)
            })
          }
        />
      </Box>
      <Box sx={{ px: "4px", mb: "4px" }}>
        <Typography sx={{ fontSize: "0.65rem", color: "grey.500" }}>
          Start opacity
        </Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={100}
          step={1}
          value={Math.round(parseColorToRgba(settings.startColor).a * 100)}
          onChange={(_, v) => {
            const a = (v as number) / 100;
            const { r, g, b } = parseColorToRgba(settings.startColor);
            onChange({ startColor: rgbaToCss({ r, g, b, a }) });
          }}
        />
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">End</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.endColor)}
          onChange={(e) =>
            onChange({
              endColor: mergeColor(settings.endColor, e.target.value)
            })
          }
        />
      </Box>
      <Box sx={{ px: "4px", mb: "4px" }}>
        <Typography sx={{ fontSize: "0.65rem", color: "grey.500" }}>
          End opacity
        </Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={100}
          step={1}
          value={Math.round(parseColorToRgba(settings.endColor).a * 100)}
          onChange={(_, v) => {
            const a = (v as number) / 100;
            const { r, g, b } = parseColorToRgba(settings.endColor);
            onChange({ endColor: rgbaToCss({ r, g, b, a }) });
          }}
        />
      </Box>
      <ToggleButtonGroup
        value={settings.type}
        exclusive
        onChange={(_, v) => {
          if (v) {
            onChange({ type: v });
          }
        }}
        size="small"
      >
        <ToggleButton value="linear" sx={toggleButtonSmallSx}>
          Linear
        </ToggleButton>
        <ToggleButton value="radial" sx={toggleButtonSmallSx}>
          Radial
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
});

// ─── CloneStampSettingsPanel ──────────────────────────────────────────────

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
      <ToggleButtonGroup
        value={settings.sampling}
        exclusive
        onChange={(_, v) => {
          if (v) {
            onChange({ sampling: v as CloneStampSampling });
          }
        }}
        size="small"
      >
        <ToggleButton value="active_layer" sx={toggleButtonSmallSx}>
          Active Layer
        </ToggleButton>
        <ToggleButton value="composited" sx={toggleButtonSmallSx}>
          All Layers
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography
        sx={{
          fontSize: "0.65rem",
          color: "grey.500",
          fontStyle: "italic",
          mt: 1
        }}
      >
        Alt+click to set source point
      </Typography>
    </>
  );
});

// ─── AdjustmentsSettingsPanel ─────────────────────────────────────────────

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
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "50px", flex: 1 }}
        >
          Apply
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasChanges}
          onClick={onCancel}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "50px", flex: 1 }}
        >
          Cancel
        </Button>
      </Box>
    </>
  );
});

// ─── TransformSettingsPanel ───────────────────────────────────────────────

interface TransformSettingsPanelProps {
  scaleX: number;
  scaleY: number;
  rotation: number;
  onCommit: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export const TransformSettingsPanel = memo(function TransformSettingsPanel({
  scaleX,
  scaleY,
  rotation,
  onCommit,
  onCancel,
  onReset
}: TransformSettingsPanelProps) {
  const rotDeg = Math.round(((rotation * 180) / Math.PI) * 10) / 10;
  return (
    <>
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
      <Box sx={{ display: "flex", gap: "4px", ml: 1 }}>
        <Button
          size="small"
          variant="outlined"
          color="success"
          onClick={onCommit}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
        >
          ✓ Commit
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={onCancel}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
        >
          ✗ Cancel
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onReset}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
        >
          Reset
        </Button>
      </Box>
    </>
  );
});

// ─── NoSettingsMessage ────────────────────────────────────────────────────

export const NoSettingsMessage = memo(function NoSettingsMessage() {
  return (
    <Typography
      sx={{ fontSize: "0.7rem", color: "grey.500", fontStyle: "italic" }}
    >
      No settings for this tool.
    </Typography>
  );
});

// ─── CropSettingsMessage ──────────────────────────────────────────────────

export const CropSettingsMessage = memo(function CropSettingsMessage() {
  return (
    <Typography
      sx={{ fontSize: "0.7rem", color: "grey.500", fontStyle: "italic" }}
    >
      Drag on canvas to select crop area.
    </Typography>
  );
});

// ─── SelectSettingsPanel ──────────────────────────────────────────────────

export const SelectSettingsPanel = memo(function SelectSettingsPanel({
  settings,
  onChange,
  hasActiveSelection,
  onFeatherSelection,
  onSmoothSelectionBorders,
  onStrokeSelectionBorder
}: SelectSettingsPanelProps) {
  return (
    <>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={settings.mode}
        onChange={(_e, v: SelectToolMode | null) => {
          if (v != null) {
            onChange({ mode: v });
          }
        }}
      >
        <ToggleButton value="rectangle" sx={toggleButtonSmallSx}>
          Rect
        </ToggleButton>
        <ToggleButton value="ellipse" sx={toggleButtonSmallSx}>
          Ellipse
        </ToggleButton>
        <ToggleButton value="lasso" sx={toggleButtonSmallSx}>
          Lasso
        </ToggleButton>
        <ToggleButton value="lasso_polygon" sx={toggleButtonSmallSx}>
          Polygon
        </ToggleButton>
        <ToggleButton value="magic_wand" sx={toggleButtonSmallSx}>
          Wand
        </ToggleButton>
      </ToggleButtonGroup>
      {settings.mode === "magic_wand" ? (
        <Box className="setting-row">
          <Typography className="setting-label">Tol.</Typography>
          <Slider
            sx={sketchSliderSx}
            size="small"
            min={0}
            max={255}
            value={settings.magicWandTolerance}
            onChange={(_, v) => onChange({ magicWandTolerance: v as number })}
          />
          <Typography className="setting-value">
            {settings.magicWandTolerance}
          </Typography>
        </Box>
      ) : null}
      <Box className="setting-row">
        <Typography className="setting-label">Feather</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={64}
          value={settings.featherRadius}
          onChange={(_, v) => onChange({ featherRadius: v as number })}
        />
        <Typography className="setting-value">
          {settings.featherRadius}
        </Typography>
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Border</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={64}
          value={settings.borderWidth}
          onChange={(_, v) => onChange({ borderWidth: v as number })}
        />
        <Typography className="setting-value">
          {settings.borderWidth}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasActiveSelection}
          onClick={onFeatherSelection}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
        >
          Feather
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasActiveSelection}
          onClick={onSmoothSelectionBorders}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
        >
          Smooth
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasActiveSelection}
          onClick={onStrokeSelectionBorder}
          sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
        >
          Border
        </Button>
      </Box>
    </>
  );
});

// ─── SegmentSettingsPanel ──────────────────────────────────────────────────

function promptModeHelpText(mode: SegmentPromptMode): string {
  if (mode === "point") {
    return "Click: include · Alt+click: exclude";
  }
  if (mode === "box") {
    return "Drag to draw a bounding box";
  }
  return "Auto-detect prominent objects";
}

/** Returns a user-friendly status message for the current segmentation phase. */
function getSegmentationStatusMessage(status: SegmentationStatus): string {
  switch (status) {
    case "checking-model":
      return "Checking model…";
    case "encoding":
      return "Encoding image…";
    case "inferring":
      return "Segmenting…";
    default:
      return "Processing…";
  }
}

interface SegmentSettingsPanelProps {
  settings: SegmentSettings;
  onChange: (settings: Partial<SegmentSettings>) => void;
  segmentationStatus: SegmentationStatus;
  onRunSegmentation: () => void;
  onApplyResult: () => void;
  onDiscardResult: () => void;
  onCancelSegmentation: () => void;
  onClearPrompts: () => void;
}

export const SegmentSettingsPanel = memo(function SegmentSettingsPanel({
  settings,
  onChange,
  segmentationStatus,
  onRunSegmentation,
  onApplyResult,
  onDiscardResult,
  onCancelSegmentation,
  onClearPrompts
}: SegmentSettingsPanelProps) {
  const isRunning =
    segmentationStatus === "inferring" ||
    segmentationStatus === "encoding" ||
    segmentationStatus === "checking-model";
  const isPreviewing = segmentationStatus === "previewing";

  return (
    <>
      <ToggleButtonGroup
        value={settings.promptMode}
        exclusive
        onChange={(_, v) => {
          if (v) {
            onChange({ promptMode: v as SegmentPromptMode });
          }
        }}
        size="small"
        sx={{ mb: "4px" }}
      >
        <ToggleButton value="point" sx={toggleButtonSmallSx}>
          Point
        </ToggleButton>
        <ToggleButton value="box" sx={toggleButtonSmallSx}>
          Box
        </ToggleButton>
        <ToggleButton value="auto" sx={toggleButtonSmallSx}>
          Auto
        </ToggleButton>
      </ToggleButtonGroup>

      <Box className="setting-row">
        <Typography className="setting-label">Max Objects</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={1}
          max={20}
          value={settings.maxObjects}
          onChange={(_, v) => onChange({ maxObjects: v as number })}
        />
        <Typography className="setting-value">{settings.maxObjects}</Typography>
      </Box>

      <Box className="setting-row">
        <Typography className="setting-label">Confidence</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={1}
          step={0.05}
          value={settings.confidenceThreshold}
          onChange={(_, v) => onChange({ confidenceThreshold: v as number })}
        />
        <Typography className="setting-value">
          {settings.confidenceThreshold.toFixed(2)}
        </Typography>
      </Box>

      <Box className="setting-row">
        <Typography className="setting-label">Min Size</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={10000}
          step={100}
          value={settings.minObjectSize}
          onChange={(_, v) => onChange({ minObjectSize: v as number })}
        />
        <Typography className="setting-value">
          {settings.minObjectSize}
        </Typography>
      </Box>

      <Box className="setting-row">
        <Typography className="setting-label">Feather</Typography>
        <Slider
          sx={sketchSliderSx}
          size="small"
          min={0}
          max={20}
          step={1}
          value={settings.maskFeather}
          onChange={(_, v) => onChange({ maskFeather: v as number })}
        />
        <Typography className="setting-value">
          {settings.maskFeather}
        </Typography>
      </Box>

      <Box className="setting-row" sx={{ gap: "4px" }}>
        <Typography className="setting-label">Source Layer</Typography>
        <ToggleButtonGroup
          value={settings.sourceLayerAction}
          exclusive
          onChange={(_, v) => {
            if (v) {
              onChange({ sourceLayerAction: v as SegmentSourceLayerAction });
            }
          }}
          size="small"
        >
          <ToggleButton value="keep" sx={toggleButtonSmallSx}>
            Keep
          </ToggleButton>
          <ToggleButton value="hide" sx={toggleButtonSmallSx}>
            Hide
          </ToggleButton>
          <ToggleButton value="lock" sx={toggleButtonSmallSx}>
            Lock
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={settings.outputCutouts}
            onChange={(e) => onChange({ outputCutouts: e.target.checked })}
          />
        }
        label={
          <Typography sx={{ fontSize: "0.6rem" }}>
            {settings.outputCutouts ? "Cutout layers" : "Mask layers"}
          </Typography>
        }
        sx={{ mt: "2px", ml: 0 }}
      />

      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: "4px" }}>
        {!isRunning && !isPreviewing && (
          <>
            <Button
              size="small"
              variant="contained"
              onClick={onRunSegmentation}
              sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
            >
              Segment
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onClearPrompts}
              sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
            >
              Clear
            </Button>
          </>
        )}
        {isRunning && (
          <>
            <Typography
              sx={{
                fontSize: "0.6rem",
                color: "info.main",
                lineHeight: 1.3,
                mr: 0.5,
                display: "flex",
                alignItems: "center"
              }}
            >
              {getSegmentationStatusMessage(segmentationStatus)}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={onCancelSegmentation}
              sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
            >
              Cancel
            </Button>
          </>
        )}
        {isPreviewing && (
          <>
            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={onApplyResult}
              sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
            >
              Apply
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onDiscardResult}
              sx={{ fontSize: "0.65rem", py: "2px", minWidth: "56px" }}
            >
              Discard
            </Button>
          </>
        )}
      </Box>

      <Typography
        sx={{
          fontSize: "0.58rem",
          color: "grey.500",
          lineHeight: 1.3,
          maxWidth: 320,
          mt: "4px"
        }}
      >
        {promptModeHelpText(settings.promptMode)}
      </Typography>

      {segmentationStatus === "error" && (
        <Typography
          sx={{
            fontSize: "0.6rem",
            color: "error.main",
            lineHeight: 1.3,
            mt: "2px"
          }}
        >
          Segmentation failed. Check model availability and try again.
        </Typography>
      )}
    </>
  );
});

// ─── ToolSettingsPanel (dispatcher) ───────────────────────────────────────

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
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
  onAdjustBrightnessChange?: (value: number) => void;
  onAdjustContrastChange?: (value: number) => void;
  onAdjustSaturationChange?: (value: number) => void;
  onAdjustApply?: () => void;
  onAdjustCancel?: () => void;
  transformScaleX?: number;
  transformScaleY?: number;
  transformRotation?: number;
  onTransformCommit?: () => void;
  onTransformCancel?: () => void;
  onTransformReset?: () => void;
  segmentSettings?: SegmentSettings;
  onSegmentSettingsChange?: (settings: Partial<SegmentSettings>) => void;
  segmentationStatus?: SegmentationStatus;
  onRunSegmentation?: () => void;
  onApplySegmentResult?: () => void;
  onDiscardSegmentResult?: () => void;
  onCancelSegmentation?: () => void;
  onClearSegmentPrompts?: () => void;
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
  onFeatherSelection,
  onSmoothSelectionBorders,
  onStrokeSelectionBorder,
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
  segmentSettings,
  onSegmentSettingsChange,
  segmentationStatus,
  onRunSegmentation,
  onApplySegmentResult,
  onDiscardSegmentResult,
  onCancelSegmentation,
  onClearSegmentPrompts
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
    const eraserMode = eraserSettings.mode ?? "brush";
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
          />
        ) : (
          <PencilSettingsPanel
            settings={pencilSettings}
            onChange={onPencilSettingsChange}
            omitPaintSliders
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
    return <CropSettingsMessage />;
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
        onFeatherSelection={onFeatherSelection}
        onSmoothSelectionBorders={onSmoothSelectionBorders}
        onStrokeSelectionBorder={onStrokeSelectionBorder}
      />
    );
  }
  if (activeTool === "move" || activeTool === "eyedropper") {
    return <NoSettingsMessage />;
  }
  if (activeTool === "transform") {
    return (
      <TransformSettingsPanel
        scaleX={transformScaleX ?? 1}
        scaleY={transformScaleY ?? 1}
        rotation={transformRotation ?? 0}
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
        onRunSegmentation={onRunSegmentation ?? noop}
        onApplyResult={onApplySegmentResult ?? noop}
        onDiscardResult={onDiscardSegmentResult ?? noop}
        onCancelSegmentation={onCancelSegmentation ?? noop}
        onClearPrompts={onClearSegmentPrompts ?? noop}
      />
    );
  }
  return null;
});
