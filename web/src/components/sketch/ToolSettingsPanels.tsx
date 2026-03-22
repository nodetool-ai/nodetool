/**
 * ToolSettingsPanels
 *
 * Extracted tool-specific settings panels for the sketch toolbar.
 * Each panel is memoized and receives only the settings + onChange it needs.
 */

import React, { memo } from "react";
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
  BrushSettings,
  BrushType,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  CloneStampSampling,
  isShapeTool,
  parseColorToRgba,
  rgbaToCss,
  colorToHex6
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Reusable no-op function to avoid allocations in optional prop fallbacks. */
const noop = () => {};

/** Native color input returns #rrggbb; keep existing alpha from stored CSS color. */
export function mergeHexPickerRgbPreserveAlpha(
  stored: string,
  pickerHex: string
): string {
  const { a } = parseColorToRgba(stored);
  const { r, g, b } = parseColorToRgba(pickerHex);
  return rgbaToCss({ r, g, b, a });
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
    case "adjust":
      return "Adjustments";
    case "line":
    case "rectangle":
    case "ellipse":
    case "arrow":
      return "Shape";
    default:
      return "Settings";
  }
}

// ─── Individual Panel Props ───────────────────────────────────────────────

interface BrushSettingsPanelProps {
  settings: BrushSettings;
  onChange: (settings: Partial<BrushSettings>) => void;
}

interface PencilSettingsPanelProps {
  settings: PencilSettings;
  onChange: (settings: Partial<PencilSettings>) => void;
}

interface EraserSettingsPanelProps {
  settings: EraserSettings;
  onChange: (settings: Partial<EraserSettings>) => void;
}

interface ShapeSettingsPanelProps {
  settings: ShapeSettings;
  activeTool: SketchTool;
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

// ─── BrushSettingsPanel ───────────────────────────────────────────────────

export const BrushSettingsPanel = memo(function BrushSettingsPanel({
  settings,
  onChange
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
        fullWidth
        sx={{ mb: "4px" }}
      >
        <ToggleButton value="round" sx={{ fontSize: "0.6rem", py: "2px" }}>
          Round
        </ToggleButton>
        <ToggleButton value="soft" sx={{ fontSize: "0.6rem", py: "2px" }}>
          Soft
        </ToggleButton>
        <ToggleButton value="airbrush" sx={{ fontSize: "0.6rem", py: "2px" }}>
          Air
        </ToggleButton>
        <ToggleButton value="spray" sx={{ fontSize: "0.6rem", py: "2px" }}>
          Spray
        </ToggleButton>
      </ToggleButtonGroup>
      <Box className="setting-row">
        <Typography className="setting-label">Color</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.color)}
          onChange={(e) =>
            onChange({
              color: mergeHexPickerRgbPreserveAlpha(
                settings.color,
                e.target.value
              )
            })
          }
        />
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Size</Typography>
        <Slider
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
        <Typography className="setting-label">Hard</Typography>
        <Slider
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
          onChange={(_, checked) =>
            onChange({ pressureSensitivity: checked })
          }
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
            fullWidth
          >
            <ToggleButton
              value="size"
              sx={{ fontSize: "0.6rem", py: "2px" }}
            >
              Size
            </ToggleButton>
            <ToggleButton
              value="opacity"
              sx={{ fontSize: "0.6rem", py: "2px" }}
            >
              Opacity
            </ToggleButton>
            <ToggleButton
              value="both"
              sx={{ fontSize: "0.6rem", py: "2px" }}
            >
              Both
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}
      {(settings.brushType === "round" ||
        settings.brushType === "soft") && (
        <>
          <Box className="setting-row">
            <Typography className="setting-label">Round</Typography>
            <Slider
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
    </>
  );
});

// ─── PencilSettingsPanel ──────────────────────────────────────────────────

export const PencilSettingsPanel = memo(function PencilSettingsPanel({
  settings,
  onChange
}: PencilSettingsPanelProps) {
  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Color</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.color)}
          onChange={(e) =>
            onChange({
              color: mergeHexPickerRgbPreserveAlpha(
                settings.color,
                e.target.value
              )
            })
          }
        />
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Size</Typography>
        <Slider
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
  );
});

// ─── EraserSettingsPanel ──────────────────────────────────────────────────

export const EraserSettingsPanel = memo(function EraserSettingsPanel({
  settings,
  onChange
}: EraserSettingsPanelProps) {
  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Size</Typography>
        <Slider
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
  );
});

// ─── ShapeSettingsPanel ───────────────────────────────────────────────────

export const ShapeSettingsPanel = memo(function ShapeSettingsPanel({
  settings,
  activeTool,
  onChange
}: ShapeSettingsPanelProps) {
  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Stroke</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.strokeColor)}
          onChange={(e) =>
            onChange({
              strokeColor: mergeHexPickerRgbPreserveAlpha(
                settings.strokeColor,
                e.target.value
              )
            })
          }
        />
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Width</Typography>
        <Slider
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
      {(activeTool === "rectangle" || activeTool === "ellipse") && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={settings.filled}
                onChange={(e) =>
                  onChange({ filled: e.target.checked })
                }
              />
            }
            label={
              <Typography sx={{ fontSize: "0.75rem" }}>Fill</Typography>
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
                    fillColor: mergeHexPickerRgbPreserveAlpha(
                      settings.fillColor,
                      e.target.value
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

// ─── FillSettingsPanel ────────────────────────────────────────────────────

export const FillSettingsPanel = memo(function FillSettingsPanel({
  settings,
  onChange
}: FillSettingsPanelProps) {
  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Color</Typography>
        <input
          type="color"
          className="color-input"
          value={colorToHex6(settings.color)}
          onChange={(e) =>
            onChange({
              color: mergeHexPickerRgbPreserveAlpha(
                settings.color,
                e.target.value
              )
            })
          }
        />
      </Box>
      <Box className="setting-row">
        <Typography className="setting-label">Tolerance</Typography>
        <Slider
          size="small"
          min={0}
          max={128}
          value={settings.tolerance}
          onChange={(_, v) => onChange({ tolerance: v as number })}
        />
        <Typography className="setting-value">
          {settings.tolerance}
        </Typography>
      </Box>
    </>
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
          size="small"
          min={1}
          max={20}
          value={settings.strength}
          onChange={(_, v) => onChange({ strength: v as number })}
        />
        <Typography className="setting-value">
          {settings.strength}
        </Typography>
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
              startColor: mergeHexPickerRgbPreserveAlpha(
                settings.startColor,
                e.target.value
              )
            })
          }
        />
      </Box>
      <Box sx={{ px: "4px", mb: "4px" }}>
        <Typography sx={{ fontSize: "0.65rem", color: "grey.500" }}>
          Start opacity
        </Typography>
        <Slider
          size="small"
          min={0}
          max={100}
          step={1}
          value={Math.round(
            parseColorToRgba(settings.startColor).a * 100
          )}
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
              endColor: mergeHexPickerRgbPreserveAlpha(
                settings.endColor,
                e.target.value
              )
            })
          }
        />
      </Box>
      <Box sx={{ px: "4px", mb: "4px" }}>
        <Typography sx={{ fontSize: "0.65rem", color: "grey.500" }}>
          End opacity
        </Typography>
        <Slider
          size="small"
          min={0}
          max={100}
          step={1}
          value={Math.round(
            parseColorToRgba(settings.endColor).a * 100
          )}
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
        fullWidth
      >
        <ToggleButton
          value="linear"
          sx={{ fontSize: "0.65rem", py: "2px" }}
        >
          Linear
        </ToggleButton>
        <ToggleButton
          value="radial"
          sx={{ fontSize: "0.65rem", py: "2px" }}
        >
          Radial
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
});

// ─── CloneStampSettingsPanel ──────────────────────────────────────────────

export const CloneStampSettingsPanel = memo(
  function CloneStampSettingsPanel({
    settings,
    onChange
  }: CloneStampSettingsPanelProps) {
    return (
      <>
        <Box className="setting-row">
          <Typography className="setting-label">Size</Typography>
          <Slider
            size="small"
            min={1}
            max={200}
            value={settings.size}
            onChange={(_, v) => onChange({ size: v as number })}
          />
          <Typography className="setting-value">
            {settings.size}
          </Typography>
        </Box>
        <Box className="setting-row">
          <Typography className="setting-label">Opacity</Typography>
          <Slider
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
          fullWidth
        >
          <ToggleButton
            value="active_layer"
            sx={{ fontSize: "0.6rem", py: "2px" }}
          >
            Active Layer
          </ToggleButton>
          <ToggleButton
            value="composited"
            sx={{ fontSize: "0.6rem", py: "2px" }}
          >
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
  }
);

// ─── AdjustmentsSettingsPanel ─────────────────────────────────────────────

interface AdjustmentsSettingsPanelProps {
  brightness: number;
  contrast: number;
  saturation: number;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onReset: () => void;
}

export const AdjustmentsSettingsPanel = memo(function AdjustmentsSettingsPanel({
  brightness,
  contrast,
  saturation,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onReset
}: AdjustmentsSettingsPanelProps) {
  return (
    <>
      <Box className="setting-row">
        <Typography className="setting-label">Bright</Typography>
        <Slider
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
          size="small"
          min={-100}
          max={100}
          value={saturation}
          onChange={(_, v) => onSaturationChange(v as number)}
        />
        <Typography className="setting-value">{saturation}</Typography>
      </Box>
      <Button
        size="small"
        variant="outlined"
        onClick={onReset}
        sx={{ fontSize: "0.65rem", py: "2px", minWidth: "50px" }}
      >
        Reset
      </Button>
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
  onCloneStampSettingsChange: (
    settings: Partial<CloneStampSettings>
  ) => void;
  onAdjustBrightnessChange?: (value: number) => void;
  onAdjustContrastChange?: (value: number) => void;
  onAdjustSaturationChange?: (value: number) => void;
  onAdjustReset?: () => void;
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
  onAdjustBrightnessChange,
  onAdjustContrastChange,
  onAdjustSaturationChange,
  onAdjustReset
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
    return (
      <EraserSettingsPanel
        settings={eraserSettings}
        onChange={onEraserSettingsChange}
      />
    );
  }
  if (isShapeTool(activeTool)) {
    return (
      <ShapeSettingsPanel
        settings={shapeSettings}
        activeTool={activeTool}
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
  if (activeTool === "move" || activeTool === "eyedropper" || activeTool === "select") {
    return <NoSettingsMessage />;
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
        onReset={onAdjustReset ?? noop}
      />
    );
  }
  return null;
});
