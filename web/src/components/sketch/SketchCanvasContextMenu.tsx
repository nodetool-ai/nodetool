/** @jsxImportSource @emotion/react */
import React, { memo, useEffect } from "react";
import { sketchSliderSx, mergeHexPickerRgbPreserveAlpha as mergeColor } from "./sketchStyles";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Box,
  ButtonBase,
  Chip,
  Divider,
  IconButton,
  Popover,
  Slider,
  Stack,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import {
  BrushSettings,
  BrushType,
  BlurSettings,
  CloneStampSettings,
  EraserSettings,
  FillSettings,
  GradientSettings,
  PencilSettings,
  ShapeSettings,
  SketchTool,
  colorToHex6,
  isShapeTool,
  parseColorToRgba,
  rgbaToCss
} from "./types";
import { CONTEXT_MENU_TOOLS, getToolDefinition, type ToolDefinition } from "./toolDefinitions";

const BRUSH_SIZE_PRESETS = [4, 12, 24, 48];
const PENCIL_SIZE_PRESETS = [1, 3, 5, 8];
const ERASER_SIZE_PRESETS = [8, 20, 48, 96];
const SHAPE_WIDTH_PRESETS = [1, 2, 4, 8];
const FILL_TOLERANCE_PRESETS = [0, 16, 32, 64];
const BLUR_SIZE_PRESETS = [10, 20, 40, 60];
const CLONE_STAMP_SIZE_PRESETS = [10, 20, 40, 80];
const OPACITY_PRESETS = [0.25, 0.5, 0.75, 1];
const STRENGTH_PRESETS = [2, 5, 10];

function getBrushTypeLabel(brushType: BrushType): string {
  switch (brushType) {
    case "airbrush":
      return "Air";
    case "spray":
      return "Spray";
    case "soft":
      return "Soft";
    case "round":
    default:
      return "Round";
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}


function getSummaryItems(
  activeTool: SketchTool,
  brushSettings: BrushSettings,
  pencilSettings: PencilSettings,
  eraserSettings: EraserSettings,
  shapeSettings: ShapeSettings,
  fillSettings: FillSettings,
  blurSettings: BlurSettings,
  gradientSettings: GradientSettings,
  cloneStampSettings?: CloneStampSettings
): string[] {
  if (activeTool === "brush") {
    return [
      `${brushSettings.size}px`,
      formatPercent(brushSettings.opacity),
      getBrushTypeLabel(brushSettings.brushType)
    ];
  }
  if (activeTool === "pencil") {
    return [`${pencilSettings.size}px`, formatPercent(pencilSettings.opacity)];
  }
  if (activeTool === "eraser") {
    return [
      `${eraserSettings.size}px`,
      formatPercent(eraserSettings.opacity),
      `${Math.round(eraserSettings.hardness * 100)}% hard`
    ];
  }
  if (isShapeTool(activeTool)) {
    return [
      `${shapeSettings.strokeWidth}px stroke`,
      shapeSettings.filled ? "Filled" : "Outline"
    ];
  }
  if (activeTool === "fill") {
    return [`Tolerance ${fillSettings.tolerance}`];
  }
  if (activeTool === "blur") {
    return [`${blurSettings.size}px`, `Strength ${blurSettings.strength}`];
  }
  if (activeTool === "clone_stamp" && cloneStampSettings) {
    return [
      `${cloneStampSettings.size}px`,
      formatPercent(cloneStampSettings.opacity)
    ];
  }
  if (activeTool === "gradient") {
    return [gradientSettings.type === "linear" ? "Linear" : "Radial"];
  }
  if (activeTool === "crop") {
    return ["Drag region"];
  }
  if (activeTool === "eyedropper") {
    return ["Sample color"];
  }
  if (activeTool === "select") {
    return ["Selection"];
  }
  return ["Pan canvas"];
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        mb: 1.05,
        fontSize: "0.72rem",
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "text.secondary"
      }}
    >
      {children}
    </Typography>
  );
}

interface QuickSliderProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function QuickSlider({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onChange
}: QuickSliderProps) {
  return (
    <Box sx={{ mb: 0.6 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.6 }}
      >
        <Typography sx={{ fontSize: "0.82rem", fontWeight: 600, color: "text.primary" }}>
          {label}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {valueLabel}
        </Typography>
      </Stack>
      <Slider
        sx={sketchSliderSx}
        size="small"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_, nextValue) => onChange(nextValue as number)}
      />
    </Box>
  );
}

interface PresetChipRowProps<T extends number | string> {
  values: T[];
  selectedValue: T;
  format: (value: T) => string;
  onSelect: (value: T) => void;
}

function PresetChipRow<T extends number | string>({
  values,
  selectedValue,
  format,
  onSelect
}: PresetChipRowProps<T>) {
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.05 }}>
      {values.map((value) => {
        const selected = value === selectedValue;
        return (
          <Chip
            key={String(value)}
            label={format(value)}
            size="small"
            color={selected ? "primary" : "default"}
            variant={selected ? "filled" : "outlined"}
            onClick={() => onSelect(value)}
            sx={{
              fontSize: "0.8rem",
              fontWeight: selected ? 700 : 500
            }}
          />
        );
      })}
    </Stack>
  );
}

function ColorPreview({
  label,
  color
}: {
  label: string;
  color: string;
}) {
  return (
    <Stack spacing={0.4} alignItems="center">
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: "7px",
          border: "1px solid",
          borderColor: "divider",
          background: color
        }}
      />
      <Typography sx={{ fontSize: "0.62rem", fontWeight: 700, color: "text.secondary" }}>
        {label}
      </Typography>
    </Stack>
  );
}

function ColorSetting({
  label,
  color,
  onChange
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, color: "text.primary" }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1,
          py: 0.8,
          borderRadius: "9px",
          border: "1px solid",
          borderColor: "grey.700",
          backgroundColor: "grey.900"
        }}
      >
        <input
          type="color"
          aria-label={label}
          value={colorToHex6(color)}
          onChange={(event) => onChange(event.target.value)}
          style={{
            width: 28,
            height: 28,
            border: "none",
            borderRadius: "6px",
            padding: 0,
            background: "transparent",
            cursor: "pointer"
          }}
        />
        <Typography
          sx={{
            fontSize: "0.74rem",
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {colorToHex6(color).toUpperCase()}
        </Typography>
      </Box>
    </Stack>
  );
}

interface ToolGridButtonProps {
  definition: ToolDefinition;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

function ToolGridButton({
  definition,
  selected,
  onClick,
  onDoubleClick
}: ToolGridButtonProps) {
  const theme = useTheme();
  const { Icon } = definition;
  const inactiveBg = theme.vars.palette.grey[800];
  const hoverBg = theme.vars.palette.grey[700];
  const shortcutBg = theme.vars.palette.grey[900];

  return (
    <ButtonBase
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={definition.label}
      sx={{
        position: "relative",
        minHeight: 64,
        borderRadius: "8px",
        border: "1px solid",
        borderColor: selected ? "primary.main" : theme.vars.palette.grey[700],
        backgroundColor: selected
          ? alpha(theme.palette.primary.main, 0.16)
          : inactiveBg,
        px: 0.75,
        py: 0.8,
        alignItems: "center",
        justifyContent: "center",
        display: "flex",
        flexDirection: "column",
        textAlign: "center",
        transition: "all 120ms ease",
        "&:hover": {
          backgroundColor: selected
            ? alpha(theme.palette.primary.main, 0.22)
            : hoverBg,
          borderColor: selected ? "primary.main" : "text.secondary"
        }
      }}
    >
      {definition.shortcut && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            px: 0.45,
            py: 0.1,
            borderRadius: 1,
            backgroundColor: shortcutBg,
            fontSize: "0.56rem",
            fontWeight: 700,
            lineHeight: 1.2,
            color: "text.secondary"
          }}
        >
          {definition.shortcut}
        </Box>
      )}
      <Icon
        sx={{
          fontSize: 20,
          color: selected ? "primary.light" : "text.primary"
        }}
      />
      <Typography
        sx={{
          mt: 0.65,
          fontSize: "0.78rem",
          fontWeight: 400,
          color: "text.secondary"
        }}
      >
        {definition.label}
      </Typography>
    </ButtonBase>
  );
}

export interface SketchCanvasContextMenuProps {
  /** Applied to the menu paper (e.g. `sketch-editor__context-menu`). */
  className?: string;
  open: boolean;
  position: { x: number; y: number } | null;
  activeTool: SketchTool;
  brushSettings: BrushSettings;
  pencilSettings: PencilSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  fillSettings: FillSettings;
  blurSettings: BlurSettings;
  gradientSettings: GradientSettings;
  cloneStampSettings: CloneStampSettings;
  foregroundColor: string;
  backgroundColor: string;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
  onToolChange: (tool: SketchTool) => void;
  onForegroundColorChange: (color: string) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onPencilSettingsChange: (settings: Partial<PencilSettings>) => void;
  onEraserSettingsChange: (settings: Partial<EraserSettings>) => void;
  onShapeSettingsChange: (settings: Partial<ShapeSettings>) => void;
  onFillSettingsChange: (settings: Partial<FillSettings>) => void;
  onBlurSettingsChange: (settings: Partial<BlurSettings>) => void;
  onGradientSettingsChange: (settings: Partial<GradientSettings>) => void;
  onCloneStampSettingsChange: (settings: Partial<CloneStampSettings>) => void;
  onSwapColors: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearLayer: () => void;
  onExportPng: () => void;
}

const CONTEXT_MENU_HEADER_HEIGHT_PX = 52;

const SketchCanvasContextMenu: React.FC<SketchCanvasContextMenuProps> = ({
  className: paperClassName,
  open,
  position,
  activeTool,
  brushSettings,
  pencilSettings,
  eraserSettings,
  shapeSettings,
  fillSettings,
  blurSettings,
  gradientSettings,
  cloneStampSettings,
  foregroundColor,
  backgroundColor,
  canUndo,
  canRedo,
  onClose,
  onToolChange,
  onForegroundColorChange,
  onBrushSettingsChange,
  onPencilSettingsChange,
  onEraserSettingsChange,
  onShapeSettingsChange,
  onFillSettingsChange,
  onBlurSettingsChange,
  onGradientSettingsChange,
  onCloneStampSettingsChange,
  onSwapColors,
  onUndo,
  onRedo,
  onClearLayer,
  onExportPng
}) => {
  const theme = useTheme();
  const activeDefinition = getToolDefinition(activeTool);
  const surfaceSoft = theme.vars.palette.grey[800];
  const summaryItems = getSummaryItems(
    activeTool,
    brushSettings,
    pencilSettings,
    eraserSettings,
    shapeSettings,
    fillSettings,
    blurSettings,
    gradientSettings,
    cloneStampSettings
  );
  const ActiveIcon = activeDefinition.Icon;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  const renderColorContext = () => {
    if (isShapeTool(activeTool)) {
      return (
        <Stack direction="row" spacing={1}>
          <ColorPreview label="Stroke" color={shapeSettings.strokeColor} />
          <ColorPreview label="Fill" color={shapeSettings.fillColor} />
        </Stack>
      );
    }

    if (activeTool === "gradient") {
      return (
        <Stack direction="row" spacing={1}>
          <ColorPreview label="Start" color={gradientSettings.startColor} />
          <ColorPreview label="End" color={gradientSettings.endColor} />
        </Stack>
      );
    }

    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <ColorPreview label="FG" color={foregroundColor} />
        <ColorPreview label="BG" color={backgroundColor} />
        <IconButton
          size="small"
          onClick={onSwapColors}
          aria-label="Swap foreground and background colors"
          sx={{
            mt: 0,
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundColor: surfaceSoft,
            p: 0.5,
            "&:hover": {
              backgroundColor: alpha(theme.palette.primary.main, 0.14)
            }
          }}
        >
          <SwapHorizIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
    );
  };

  const renderQuickControls = () => {
    if (activeTool === "brush") {
      return (
        <>
          <ColorSetting
            label="Color"
            color={brushSettings.color}
            onChange={(value) => {
              const next = mergeColor(brushSettings.color, value);
              onForegroundColorChange(next);
              onBrushSettingsChange({ color: next });
            }}
          />
          <ToggleButtonGroup
            value={brushSettings.brushType}
            exclusive
            size="small"
            fullWidth
            onChange={(_, value) => {
              if (value) {
                onBrushSettingsChange({ brushType: value as BrushType });
              }
            }}
            sx={{ mb: 1.8, mt: 1.4 }}
          >
            <ToggleButton value="round">Round</ToggleButton>
            <ToggleButton value="soft">Soft</ToggleButton>
            <ToggleButton value="airbrush">Air</ToggleButton>
            <ToggleButton value="spray">Spray</ToggleButton>
          </ToggleButtonGroup>
          <QuickSlider
            label="Size"
            valueLabel={`${brushSettings.size}px`}
            value={brushSettings.size}
            min={1}
            max={200}
            onChange={(value) => onBrushSettingsChange({ size: value })}
          />
          <PresetChipRow
            values={BRUSH_SIZE_PRESETS}
            selectedValue={brushSettings.size}
            format={(value) => `${value}px`}
            onSelect={(value) => onBrushSettingsChange({ size: value })}
          />
          <QuickSlider
            label="Opacity"
            valueLabel={formatPercent(brushSettings.opacity)}
            value={brushSettings.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onBrushSettingsChange({ opacity: value })}
          />
          <PresetChipRow
            values={OPACITY_PRESETS}
            selectedValue={brushSettings.opacity}
            format={(value) => formatPercent(value)}
            onSelect={(value) => onBrushSettingsChange({ opacity: value })}
          />
          <QuickSlider
            label="Hardness"
            valueLabel={formatPercent(brushSettings.hardness)}
            value={brushSettings.hardness}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onBrushSettingsChange({ hardness: value })}
          />
        </>
      );
    }

    if (activeTool === "pencil") {
      return (
        <>
          <ColorSetting
            label="Color"
            color={pencilSettings.color}
            onChange={(value) => {
              const next = mergeColor(pencilSettings.color, value);
              onForegroundColorChange(next);
              onPencilSettingsChange({ color: next });
            }}
          />
          <QuickSlider
            label="Size"
            valueLabel={`${pencilSettings.size}px`}
            value={pencilSettings.size}
            min={1}
            max={10}
            onChange={(value) => onPencilSettingsChange({ size: value })}
          />
          <PresetChipRow
            values={PENCIL_SIZE_PRESETS}
            selectedValue={pencilSettings.size}
            format={(value) => `${value}px`}
            onSelect={(value) => onPencilSettingsChange({ size: value })}
          />
          <QuickSlider
            label="Opacity"
            valueLabel={formatPercent(pencilSettings.opacity)}
            value={pencilSettings.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onPencilSettingsChange({ opacity: value })}
          />
          <PresetChipRow
            values={OPACITY_PRESETS}
            selectedValue={pencilSettings.opacity}
            format={(value) => formatPercent(value)}
            onSelect={(value) => onPencilSettingsChange({ opacity: value })}
          />
        </>
      );
    }

    if (activeTool === "eraser") {
      return (
        <>
          <QuickSlider
            label="Size"
            valueLabel={`${eraserSettings.size}px`}
            value={eraserSettings.size}
            min={1}
            max={200}
            onChange={(value) => onEraserSettingsChange({ size: value })}
          />
          <PresetChipRow
            values={ERASER_SIZE_PRESETS}
            selectedValue={eraserSettings.size}
            format={(value) => `${value}px`}
            onSelect={(value) => onEraserSettingsChange({ size: value })}
          />
          <QuickSlider
            label="Opacity"
            valueLabel={formatPercent(eraserSettings.opacity)}
            value={eraserSettings.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onEraserSettingsChange({ opacity: value })}
          />
          <QuickSlider
            label="Hardness"
            valueLabel={formatPercent(eraserSettings.hardness)}
            value={eraserSettings.hardness}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onEraserSettingsChange({ hardness: value })}
          />
        </>
      );
    }

    if (activeTool === "shape") {
      const canFill = shapeSettings.shapeType === "rectangle" || shapeSettings.shapeType === "ellipse";
      return (
        <>
          <ToggleButtonGroup
            value={shapeSettings.shapeType ?? "rectangle"}
            exclusive
            size="small"
            fullWidth
            onChange={(_, value) => {
              if (value) {
                onShapeSettingsChange({ shapeType: value });
              }
            }}
            sx={{ mb: 1.4 }}
          >
            <ToggleButton value="line">Line</ToggleButton>
            <ToggleButton value="rectangle">Rect</ToggleButton>
            <ToggleButton value="ellipse">Ellipse</ToggleButton>
            <ToggleButton value="arrow">Arrow</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={1.2} sx={{ mb: 1.4 }}>
            <ColorSetting
              label="Stroke"
              color={shapeSettings.strokeColor}
              onChange={(value) => onShapeSettingsChange({ strokeColor: value })}
            />
            {canFill && (
              <ColorSetting
                label="Fill"
                color={shapeSettings.fillColor}
                onChange={(value) => onShapeSettingsChange({ fillColor: value })}
              />
            )}
          </Stack>
          {canFill && (
            <ToggleButtonGroup
              value={shapeSettings.filled ? "filled" : "outline"}
              exclusive
              size="small"
              fullWidth
              onChange={(_, value) => {
                if (value) {
                  onShapeSettingsChange({ filled: value === "filled" });
                }
              }}
              sx={{ mb: 1.8 }}
            >
              <ToggleButton value="outline">Outline</ToggleButton>
              <ToggleButton value="filled">Filled</ToggleButton>
            </ToggleButtonGroup>
          )}
          <QuickSlider
            label="Stroke"
            valueLabel={`${shapeSettings.strokeWidth}px`}
            value={shapeSettings.strokeWidth}
            min={1}
            max={50}
            onChange={(value) => onShapeSettingsChange({ strokeWidth: value })}
          />
          <PresetChipRow
            values={SHAPE_WIDTH_PRESETS}
            selectedValue={shapeSettings.strokeWidth}
            format={(value) => `${value}px`}
            onSelect={(value) => onShapeSettingsChange({ strokeWidth: value })}
          />
        </>
      );
    }

    if (activeTool === "fill") {
      return (
        <>
          <ColorSetting
            label="Color"
            color={fillSettings.color}
            onChange={(value) => {
              const next = mergeColor(fillSettings.color, value);
              onForegroundColorChange(next);
              onFillSettingsChange({ color: next });
            }}
          />
          <QuickSlider
            label="Tolerance"
            valueLabel={String(fillSettings.tolerance)}
            value={fillSettings.tolerance}
            min={0}
            max={128}
            onChange={(value) => onFillSettingsChange({ tolerance: value })}
          />
          <PresetChipRow
            values={FILL_TOLERANCE_PRESETS}
            selectedValue={fillSettings.tolerance}
            format={(value) => String(value)}
            onSelect={(value) => onFillSettingsChange({ tolerance: value })}
          />
        </>
      );
    }

    if (activeTool === "blur") {
      return (
        <>
          <QuickSlider
            label="Size"
            valueLabel={`${blurSettings.size}px`}
            value={blurSettings.size}
            min={1}
            max={200}
            onChange={(value) => onBlurSettingsChange({ size: value })}
          />
          <PresetChipRow
            values={BLUR_SIZE_PRESETS}
            selectedValue={blurSettings.size}
            format={(value) => `${value}px`}
            onSelect={(value) => onBlurSettingsChange({ size: value })}
          />
          <QuickSlider
            label="Strength"
            valueLabel={String(blurSettings.strength)}
            value={blurSettings.strength}
            min={1}
            max={20}
            onChange={(value) => onBlurSettingsChange({ strength: value })}
          />
          <PresetChipRow
            values={STRENGTH_PRESETS}
            selectedValue={blurSettings.strength}
            format={(value) => String(value)}
            onSelect={(value) => onBlurSettingsChange({ strength: value })}
          />
        </>
      );
    }

    if (activeTool === "clone_stamp") {
      return (
        <>
          <QuickSlider
            label="Size"
            valueLabel={`${cloneStampSettings.size}px`}
            value={cloneStampSettings.size}
            min={1}
            max={200}
            onChange={(value) => onCloneStampSettingsChange({ size: value })}
          />
          <PresetChipRow
            values={CLONE_STAMP_SIZE_PRESETS}
            selectedValue={cloneStampSettings.size}
            format={(value) => `${value}px`}
            onSelect={(value) => onCloneStampSettingsChange({ size: value })}
          />
          <QuickSlider
            label="Opacity"
            valueLabel={formatPercent(cloneStampSettings.opacity)}
            value={cloneStampSettings.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onCloneStampSettingsChange({ opacity: value })}
          />
          <PresetChipRow
            values={OPACITY_PRESETS}
            selectedValue={cloneStampSettings.opacity}
            format={formatPercent}
            onSelect={(value) => onCloneStampSettingsChange({ opacity: value })}
          />
          <Typography sx={{ fontSize: "0.76rem", color: "text.secondary", mt: 1 }}>
            Alt+click to set clone source.
          </Typography>
        </>
      );
    }

    if (activeTool === "gradient") {
      return (
        <>
          <Stack direction="row" spacing={1.2} sx={{ mb: 1.4 }}>
            <ColorSetting
              label="Start"
              color={gradientSettings.startColor}
              onChange={(value) => onGradientSettingsChange({ startColor: value })}
            />
            <ColorSetting
              label="End"
              color={gradientSettings.endColor}
              onChange={(value) => onGradientSettingsChange({ endColor: value })}
            />
          </Stack>
          <ToggleButtonGroup
            value={gradientSettings.type}
            exclusive
            size="small"
            fullWidth
            onChange={(_, value) => {
              if (value) {
                onGradientSettingsChange({
                  type: value as GradientSettings["type"]
                });
              }
            }}
            sx={{ mb: 1.8 }}
          >
            <ToggleButton value="linear">Linear</ToggleButton>
            <ToggleButton value="radial">Radial</ToggleButton>
          </ToggleButtonGroup>
          <Typography sx={{ fontSize: "0.76rem", color: "text.secondary" }}>
            Drag on the canvas to place and orient the gradient.
          </Typography>
        </>
      );
    }

    if (activeTool === "eyedropper") {
      return (
        <Typography sx={{ fontSize: "0.76rem", color: "text.secondary", lineHeight: 1.45 }}>
          Click to sample a color from the canvas.
        </Typography>
      );
    }

    if (activeTool === "crop") {
      return (
        <Typography sx={{ fontSize: "0.76rem", color: "text.secondary", lineHeight: 1.45 }}>
          Drag to define the crop region, then apply on the canvas.
        </Typography>
      );
    }

    if (activeTool === "select") {
      return (
        <Typography sx={{ fontSize: "0.76rem", color: "text.secondary", lineHeight: 1.45 }}>
          Selection tools are still lightweight here. Use the canvas for the actual interaction.
        </Typography>
      );
    }

    return (
      <Typography sx={{ fontSize: "0.76rem", color: "text.secondary", lineHeight: 1.45 }}>
        Use the canvas to pan and reposition your view.
      </Typography>
    );
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      transitionDuration={{ enter: 90, exit: 60 }}
      anchorReference="anchorPosition"
      transformOrigin={{
        vertical: "center",
        horizontal: "center"
      }}
      anchorPosition={
        open && position ? { top: position.y, left: position.x } : undefined
      }
      disableRestoreFocus
      slotProps={{
        paper: {
          className: ["sketch-context-menu", paperClassName].filter(Boolean).join(" "),
          sx: {
            width: 620,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: "12px",
            backgroundImage: "none",
            backgroundColor: theme.vars.palette.grey[900],
            backdropFilter: "blur(16px)",
            boxShadow: theme.shadows[12],
            p: 1.25
          }
        }
      }}
    >
      <Box className="sketch-context-menu__root" sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box
          className="sketch-context-menu__header"
          sx={{
            flex: "0 0 auto",
            height: CONTEXT_MENU_HEADER_HEIGHT_PX,
            minHeight: CONTEXT_MENU_HEADER_HEIGHT_PX,
            maxHeight: CONTEXT_MENU_HEADER_HEIGHT_PX,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0,
            borderRadius: "8px",
            border: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.28),
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            overflow: "hidden"
          }}
        >
          <Box
            className="sketch-context-menu__header-tool-icon"
            sx={{
              flex: "0 0 auto",
              width: 34,
              height: 34,
              borderRadius: "7px",
              display: "grid",
              placeItems: "center",
              backgroundColor: alpha(theme.palette.primary.main, 0.18),
              color: "primary.light"
            }}
          >
            <ActiveIcon sx={{ fontSize: 22 }} />
          </Box>
          <Typography
            className="sketch-context-menu__header-tool-label"
            component="span"
            sx={{
              flex: "0 0 auto",
              fontSize: "0.92rem",
              fontWeight: 700,
              color: "text.primary",
              whiteSpace: "nowrap"
            }}
          >
            {activeDefinition.label}
          </Typography>
          {activeDefinition.shortcut ? (
            <Box
              className="sketch-context-menu__header-shortcut"
              sx={{
                flex: "0 0 auto",
                px: 0.65,
                py: 0.2,
                borderRadius: "6px",
                border: "1px solid",
                borderColor: theme.vars.palette.grey[600],
                fontSize: "0.68rem",
                fontWeight: 700,
                lineHeight: 1.2,
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums"
              }}
            >
              {activeDefinition.shortcut}
            </Box>
          ) : null}
          <Stack
            className="sketch-context-menu__header-summary"
            direction="row"
            spacing={0.65}
            useFlexGap
            sx={{
              flex: "1 1 auto",
              minWidth: 0,
              alignItems: "center",
              flexWrap: "nowrap",
              overflowX: "auto",
              overflowY: "hidden",
              py: 0.25,
              "&::-webkit-scrollbar": { height: 4 },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: theme.vars.palette.grey[700],
                borderRadius: 2
              }
            }}
          >
            {summaryItems.map((item) => (
              <Box
                key={item}
                component="span"
                sx={{
                  flex: "0 0 auto",
                  px: 0.75,
                  py: 0.2,
                  borderRadius: "999px",
                  backgroundColor: theme.vars.palette.grey[800],
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: "text.secondary",
                  whiteSpace: "nowrap"
                }}
              >
                {item}
              </Box>
            ))}
          </Stack>
          <Divider
            orientation="vertical"
            flexItem
            sx={{ borderColor: alpha(theme.palette.primary.main, 0.22), my: 0.75 }}
          />
          <Box
            className="sketch-context-menu__header-colors"
            sx={{ flex: "0 0 auto", display: "flex", alignItems: "center" }}
          >
            {renderColorContext()}
          </Box>
        </Box>

        <Box
          className="sketch-context-menu__body"
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 220px",
            gap: 1.25,
            alignItems: "stretch",
            minWidth: 0,
            "& > *:first-of-type": {
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                top: 4,
                right: -10,
                bottom: 4,
                width: "1px",
                backgroundColor: theme.vars.palette.grey[800]
              }
            }
          }}
        >
        <Box
          className="sketch-context-menu__quick"
          sx={{
            minWidth: 0,
            minHeight: 360,
            height: "100%",
            borderRadius: "8px",
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundColor: theme.vars.palette.grey[800],
            px: 1.35,
            py: 1.2
          }}
        >
          <SectionLabel>Quick Controls</SectionLabel>
          {renderQuickControls()}
        </Box>

        <Stack className="sketch-context-menu__sidebar" spacing={1.1} sx={{ minWidth: 0 }}>
          <Box
            className="sketch-context-menu__tools"
            sx={{
              borderRadius: "8px",
              border: "1px solid",
              borderColor: theme.vars.palette.grey[700],
              backgroundColor: theme.vars.palette.grey[800],
              px: 1.15,
              py: 1.1
            }}
          >
            <SectionLabel>Tools</SectionLabel>
            <Box
              className="sketch-context-menu__tools-grid"
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 0.7
              }}
            >
              {CONTEXT_MENU_TOOLS.map((definition) => (
                <ToolGridButton
                  key={definition.tool}
                  definition={definition}
                  selected={definition.tool === activeTool}
                  onClick={() => onToolChange(definition.tool)}
                  onDoubleClick={() => {
                    onToolChange(definition.tool);
                    onClose();
                  }}
                />
              ))}
            </Box>
          </Box>

          <Box
            className="sketch-context-menu__canvas-actions"
            sx={{
              borderRadius: "8px",
              border: "1px solid",
              borderColor: theme.vars.palette.grey[700],
              backgroundColor: theme.vars.palette.grey[800],
              px: 1.15,
              py: 1.1
            }}
          >
            <SectionLabel>Canvas</SectionLabel>
            <Stack direction="row" spacing={0.8}>
              <Tooltip title="Undo">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => {
                      onUndo();
                      onClose();
                    }}
                    disabled={!canUndo}
                    aria-label="Undo"
                    sx={{
                      border: "1px solid",
                      borderColor: theme.vars.palette.grey[700],
                      borderRadius: "8px",
                      p: 0.65
                    }}
                  >
                    <UndoIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => {
                      onRedo();
                      onClose();
                    }}
                    disabled={!canRedo}
                    aria-label="Redo"
                    sx={{
                      border: "1px solid",
                      borderColor: theme.vars.palette.grey[700],
                      borderRadius: "8px",
                      p: 0.65
                    }}
                  >
                    <RedoIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Clear Layer">
                <IconButton
                  size="small"
                  onClick={() => {
                    onClearLayer();
                    onClose();
                  }}
                  aria-label="Clear layer"
                  sx={{
                    border: "1px solid",
                    borderColor: alpha(theme.palette.error.main, 0.45),
                    color: "error.main",
                    borderRadius: "8px",
                    p: 0.65
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export PNG">
                <IconButton
                  size="small"
                  onClick={() => {
                    onExportPng();
                    onClose();
                  }}
                  aria-label="Export PNG"
                  sx={{
                    border: "1px solid",
                    borderColor: alpha(theme.palette.primary.main, 0.45),
                    color: "primary.light",
                    borderRadius: "8px",
                    p: 0.65
                  }}
                >
                  <SaveAltIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>
        </Box>
      </Box>
    </Popover>
  );
};

export default memo(SketchCanvasContextMenu);
