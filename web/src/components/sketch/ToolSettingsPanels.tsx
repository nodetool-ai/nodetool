/**
 * ToolSettingsPanels
 *
 * Extracted tool-specific settings panels for the sketch toolbar.
 * Each panel is memoized and receives only the settings + onChange it needs.
 */

import React, { memo, useState } from "react";
import {
  sketchSliderSx,
  toggleButtonSmallSx,
  sketchButtonSmallSx,
  sketchHintTextSx,
  SKETCH_FONT,
  SKETCH_COLORS,
  colorSwatchSx
} from "./sketchStyles";
import ColorPickerPopover from "./ColorPickerPopover";
import {
  Box,
  Typography,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox,
  FormControlLabel,
  Button,
  IconButton,
  Tooltip
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
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
  SegmentBackend,
  SegmentationStatus,
  TransformMode,
  PenPressureSettings,
  StrokeAssistSettings,
  StrokeAssistPreset,
  DEFAULT_PRESSURE_MIN_SCALE,
  DEFAULT_PRESSURE_CURVE,
  pressureMinScaleFromSliderUnit,
  pressureMinScaleToSliderUnit,
  resolveStrokeAssistSettings,
  createStrokeAssistPreset,
  colorToHex6,
  mergeRgbHexIntoColor
} from "./types";
import type { SamModelInfo } from "./sam";
import { LOCAL_SAM3_MODEL_ID } from "./sam";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Reusable no-op function to avoid allocations in optional prop fallbacks. */
const noop = () => {};

/** Matches {@link drawEraserStroke} / document migration so panel mode matches actual erase behavior. */
function effectiveEraserMode(
  settings: EraserSettings
): EraserMode {
  const raw = settings as EraserSettings & { tip?: EraserMode };
  return settings.mode ?? raw.tip ?? "brush";
}

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

interface PenPressureSettingsPanelProps {
  settings: PenPressureSettings;
  onChange: (settings: Partial<PenPressureSettings>) => void;
  /**
   * Hide the Pressure on/off switch (e.g. sketch modal header uses the stylus
   * icon as the only sensitivity toggle).
   */
  omitSensitivitySwitch?: boolean;
  /**
   * One horizontal strip: affects, then sliders left-to-right (tight chrome).
   */
  inlineRow?: boolean;
}

/** Global pen pressure (Brush/Pencil tool panels no longer duplicate these controls). */
export const PenPressureSettingsPanel = memo(function PenPressureSettingsPanel({
  settings,
  onChange,
  omitSensitivitySwitch = false,
  inlineRow = false
}: PenPressureSettingsPanelProps) {
  const affectsGroup = (
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
  );

  const minScale = settings.pressureMinScale ?? DEFAULT_PRESSURE_MIN_SCALE;
  const lightEndSlider = Math.round(pressureMinScaleToSliderUnit(minScale) * 100);

  const lightEndRow = (
    <Box className="setting-row">
      <Typography
        className="setting-label"
        title="Size/opacity at minimum pressure. Slider uses eased mapping so the upper range is easier to dial in."
      >
        Light end
      </Typography>
      <Slider
        sx={sketchSliderSx}
        size="small"
        min={0}
        max={100}
        step={1}
        value={lightEndSlider}
        onChange={(_, v) =>
          onChange({
            pressureMinScale: pressureMinScaleFromSliderUnit((v as number) / 100)
          })
        }
      />
      <Typography className="setting-value">
        {Math.round(minScale * 100)}%
      </Typography>
    </Box>
  );

  const curveRow = (
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
  );

  const advancedBlock =
    settings.pressureSensitivity !== false ? (
      inlineRow ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 12,
            rowGap: 4
          }}
        >
          {affectsGroup}
          {lightEndRow}
          {curveRow}
        </Box>
      ) : (
        <Box sx={{ mb: "4px" }}>
          {affectsGroup}
          {lightEndRow}
          {curveRow}
        </Box>
      )
    ) : null;

  return (
    <>
      {!omitSensitivitySwitch ? (
        <Box className="setting-row" sx={{ alignItems: "center" }}>
          <Typography className="setting-label">Pressure</Typography>
          <Switch
            size="small"
            checked={settings.pressureSensitivity ?? true}
            onChange={(_, checked) => onChange({ pressureSensitivity: checked })}
          />
        </Box>
      ) : null}
      {advancedBlock}
    </>
  );
});

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
  onInvertSelection: () => void;
  onFeatherSelection: () => void;
  onSmoothSelectionBorders: () => void;
  onStrokeSelectionBorder: () => void;
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

// ─── BrushSettingsPanel ───────────────────────────────────────────────────

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

// ─── PencilSettingsPanel ──────────────────────────────────────────────────

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

// ─── EraserSettingsPanel ──────────────────────────────────────────────────

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
              strokeColor: mergeRgbHexIntoColor(e.target.value, settings.strokeColor)
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
            label={<Typography sx={{ fontSize: SKETCH_FONT.section }}>Fill</Typography>}
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
                    fillColor: mergeRgbHexIntoColor(e.target.value, settings.fillColor)
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
          <Box sx={{ position: "absolute", inset: 0, backgroundColor: settings.startColor }} />
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
          <Box sx={{ position: "absolute", inset: 0, backgroundColor: settings.endColor }} />
        </Box>
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
        sx={{ ...sketchHintTextSx, mt: 1 }}
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

// ─── MoveSettingsPanel ────────────────────────────────────────────────────

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
        <Typography sx={{ ...SKETCH_FONT, fontSize: "0.75rem", userSelect: "none" }}>
          Auto-Select
        </Typography>
      }
      sx={{ mr: 2, ml: 0 }}
    />
  );
});

// ─── TransformSettingsPanel ───────────────────────────────────────────────

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
          <Typography sx={{ ...SKETCH_FONT, fontSize: "0.75rem", userSelect: "none" }}>
            Auto-Select
          </Typography>
        }
        sx={{ mr: 2, ml: 0 }}
      />
      <Box className="setting-row">
        <Typography className="setting-label">Mode</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_, nextMode: TransformMode | null) => {
            if (nextMode) {
              onModeChange(nextMode);
            }
          }}
        >
          <ToggleButton value="auto" sx={toggleButtonSmallSx}>
            Auto
          </ToggleButton>
          <ToggleButton value="scale" sx={toggleButtonSmallSx}>
            Scale
          </ToggleButton>
          <ToggleButton value="distort" sx={toggleButtonSmallSx}>
            Distort
          </ToggleButton>
          <ToggleButton value="skew" sx={toggleButtonSmallSx}>
            Skew
          </ToggleButton>
          <Tooltip title="Perspective ties opposite edges together for linked corner drags.">
            <ToggleButton value="perspective" sx={toggleButtonSmallSx}>
              Persp
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Warp keeps each corner independently movable while using the shared quad rendering path.">
            <ToggleButton value="warp" sx={toggleButtonSmallSx}>
              Warp
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
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

// ─── NoSettingsMessage ────────────────────────────────────────────────────

export const NoSettingsMessage = memo(function NoSettingsMessage() {
  return (
    <Typography
      sx={{ ...sketchHintTextSx }}
    >
      No settings for this tool.
    </Typography>
  );
});

// ─── CropSettingsMessage ──────────────────────────────────────────────────

export const CropSettingsMessage = memo(function CropSettingsMessage() {
  return (
    <Typography
      sx={{ ...sketchHintTextSx }}
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
  onInvertSelection,
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
          onClick={onInvertSelection}
          sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
        >
          Invert
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasActiveSelection}
          onClick={onFeatherSelection}
          sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
        >
          Feather
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasActiveSelection}
          onClick={onSmoothSelectionBorders}
          sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
        >
          Smooth
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={!hasActiveSelection}
          onClick={onStrokeSelectionBorder}
          sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
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
  modelInfo: SamModelInfo | null;
  onRunSegmentation: () => void;
  onApplyResult: () => void;
  onDiscardResult: () => void;
  onCancelSegmentation: () => void;
  onClearPrompts: () => void;
  onCheckModel: () => void;
}

export const SegmentSettingsPanel = memo(function SegmentSettingsPanel({
  settings,
  onChange,
  segmentationStatus,
  modelInfo,
  onRunSegmentation,
  onApplyResult,
  onDiscardResult,
  onCancelSegmentation,
  onClearPrompts,
  onCheckModel
}: SegmentSettingsPanelProps) {
  const isRunning =
    segmentationStatus === "inferring" ||
    segmentationStatus === "encoding" ||
    segmentationStatus === "checking-model";
  const isPreviewing = segmentationStatus === "previewing";
  const localSam3Download = useModelDownloadStore(
    (state) => state.downloads[LOCAL_SAM3_MODEL_ID]
  );
  const isLocalSam3 = settings.backend === "local-sam3";
  const localSam3Downloading =
    localSam3Download &&
    (localSam3Download.status === "pending" ||
      localSam3Download.status === "running" ||
      localSam3Download.status === "start" ||
      localSam3Download.status === "progress");
  const localSam3Ready = isLocalSam3 && modelInfo?.status === "available";
  const canRunSegmentation = !isLocalSam3 || localSam3Ready;
  const visiblePromptModes: SegmentPromptMode[] = isLocalSam3
    ? ["auto"]
    : ["point", "box", "auto"];
  const modelStatusText =
    isLocalSam3 && localSam3Downloading
      ? "Local SAM3 is downloading"
      : localSam3Ready
        ? "Local SAM3 is ready"
        : modelInfo?.errorMessage;

  return (
    <>
      <Box className="setting-row" sx={{ gap: "4px" }}>
        <Typography className="setting-label">Backend</Typography>
        <ToggleButtonGroup
          value={settings.backend}
          exclusive
          onChange={(_, v) => {
            if (v) {
              onChange({
                backend: v as SegmentBackend,
                ...(v === "local-sam3" ? { promptMode: "auto" as const } : {})
              });
              onCheckModel();
            }
          }}
          size="small"
        >
          <ToggleButton value="fal" sx={toggleButtonSmallSx}>
            fal.ai
          </ToggleButton>
          <ToggleButton value="local-sam3" sx={toggleButtonSmallSx}>
            Local SAM3
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {modelInfo && (
        <Box sx={{ mb: "4px" }}>
          <Typography
            sx={{
              fontSize: SKETCH_FONT.xs,
              lineHeight: 1.3,
              color:
                modelInfo.status === "available"
                  ? "success.main"
                  : modelInfo.status === "error" ||
                      modelInfo.status === "not-installed"
                    ? "warning.main"
                    : SKETCH_COLORS.textFaint
            }}
          >
            {modelInfo.status === "available" &&
              (modelStatusText ?? `✓ ${modelInfo.modelName}`)}
            {modelInfo.status === "not-installed" &&
              (modelStatusText ?? "Model not available")}
            {modelInfo.status === "error" &&
              (modelStatusText ?? "Connection failed")}
            {modelInfo.status === "checking" && "Checking…"}
            {modelInfo.status === "downloading" &&
              `${modelStatusText ?? "Downloading…"} ${Math.round((modelInfo.downloadProgress ?? 0) * 100)}%`}
          </Typography>
        </Box>
      )}

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
        {visiblePromptModes.includes("point") && (
          <ToggleButton value="point" sx={toggleButtonSmallSx}>
            Point
          </ToggleButton>
        )}
        {visiblePromptModes.includes("box") && (
          <ToggleButton value="box" sx={toggleButtonSmallSx}>
            Box
          </ToggleButton>
        )}
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
          <Typography sx={{ fontSize: SKETCH_FONT.xs }}>
            {settings.outputCutouts ? "Cutout layers" : "Mask layers"}
          </Typography>
        }
        sx={{ mt: "2px", ml: 0 }}
      />

      {isLocalSam3 && (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Points / Side</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={4}
              max={128}
              step={4}
              value={settings.pointsPerSide}
              onChange={(_, value) => onChange({ pointsPerSide: value as number })}
            />
            <Typography className="setting-value">{settings.pointsPerSide}</Typography>
          </Box>

          <Box className="setting-row">
            <Typography className="setting-label">Pred IoU</Typography>
            <Slider
              sx={sketchSliderSx}
              size="small"
              min={0}
              max={1}
              step={0.01}
              value={settings.predIouThresh}
              onChange={(_, value) => onChange({ predIouThresh: value as number })}
            />
            <Typography className="setting-value">
              {settings.predIouThresh.toFixed(2)}
            </Typography>
          </Box>
        </>
      )}

      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: "4px" }}>
        {!isRunning && !isPreviewing && (
          <>
            <Button
              size="small"
              variant="contained"
              onClick={onRunSegmentation}
              disabled={!canRunSegmentation}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Segment
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onClearPrompts}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Clear
            </Button>
          </>
        )}
        {isRunning && (
          <>
            <Typography
              sx={{
                fontSize: SKETCH_FONT.xs,
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
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
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
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Apply
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={onDiscardResult}
              sx={{ ...sketchButtonSmallSx, minWidth: "56px" }}
            >
              Discard
            </Button>
          </>
        )}
      </Box>

      <Typography
        sx={{
          fontSize: SKETCH_FONT.xs,
          color: SKETCH_COLORS.textFaint,
          lineHeight: 1.3,
          maxWidth: 320,
          mt: "4px"
        }}
      >
        {isLocalSam3
          ? "Local SAM3 currently supports automatic layer split only."
          : promptModeHelpText(settings.promptMode)}
      </Typography>

      {segmentationStatus === "error" && (
        <Typography
          sx={{
            fontSize: SKETCH_FONT.xs,
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
  onInvertSelection: () => void;
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
        onInvertSelection={onInvertSelection}
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
