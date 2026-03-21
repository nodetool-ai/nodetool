/** @jsxImportSource @emotion/react */
import React, { memo, useEffect } from "react";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  IconButton,
  Popover,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import BrushIcon from "@mui/icons-material/Brush";
import CreateIcon from "@mui/icons-material/Create";
import AutoFixNormalIcon from "@mui/icons-material/AutoFixNormal";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import ColorizeIcon from "@mui/icons-material/Colorize";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import GradientIcon from "@mui/icons-material/Gradient";
import CropIcon from "@mui/icons-material/Crop";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import {
  BrushSettings,
  BrushType,
  BlurSettings,
  EraserSettings,
  FillSettings,
  GradientSettings,
  PencilSettings,
  ShapeSettings,
  SketchTool,
  isShapeTool
} from "./types";

type ToolIconComponent = React.ComponentType<SvgIconProps>;

interface ToolDefinition {
  tool: SketchTool;
  label: string;
  shortcut?: string;
  Icon: ToolIconComponent;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { tool: "move", label: "Move", shortcut: "V", Icon: OpenWithIcon },
  { tool: "select", label: "Select", Icon: SelectAllIcon },
  { tool: "brush", label: "Brush", shortcut: "B", Icon: BrushIcon },
  { tool: "pencil", label: "Pencil", shortcut: "P", Icon: CreateIcon },
  { tool: "eraser", label: "Eraser", shortcut: "E", Icon: AutoFixNormalIcon },
  { tool: "fill", label: "Fill", shortcut: "G", Icon: FormatColorFillIcon },
  { tool: "eyedropper", label: "Eyedropper", shortcut: "I", Icon: ColorizeIcon },
  { tool: "blur", label: "Blur", shortcut: "Q", Icon: BlurOnIcon },
  { tool: "line", label: "Line", shortcut: "L", Icon: HorizontalRuleIcon },
  { tool: "rectangle", label: "Rectangle", shortcut: "R", Icon: RectangleOutlinedIcon },
  { tool: "ellipse", label: "Ellipse", shortcut: "O", Icon: CircleOutlinedIcon },
  { tool: "arrow", label: "Arrow", shortcut: "A", Icon: ArrowRightAltIcon },
  { tool: "gradient", label: "Gradient", shortcut: "T", Icon: GradientIcon },
  { tool: "crop", label: "Crop", shortcut: "C", Icon: CropIcon }
];

const BRUSH_SIZE_PRESETS = [4, 12, 24, 48];
const PENCIL_SIZE_PRESETS = [1, 3, 5, 8];
const ERASER_SIZE_PRESETS = [8, 20, 48, 96];
const SHAPE_WIDTH_PRESETS = [1, 2, 4, 8];
const FILL_TOLERANCE_PRESETS = [0, 16, 32, 64];
const BLUR_SIZE_PRESETS = [10, 20, 40, 60];
const OPACITY_PRESETS = [0.25, 0.5, 0.75, 1];
const STRENGTH_PRESETS = [2, 5, 10];

function getToolDefinition(tool: SketchTool): ToolDefinition {
  return TOOL_DEFINITIONS.find((item) => item.tool === tool) ?? TOOL_DEFINITIONS[0];
}

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
  gradientSettings: GradientSettings
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
        mb: 1,
        fontSize: "0.66rem",
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
    <Box sx={{ mb: 1.25 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.5 }}
      >
        <Typography sx={{ fontSize: "0.76rem", fontWeight: 600, color: "text.primary" }}>
          {label}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {valueLabel}
        </Typography>
      </Stack>
      <Slider
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
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
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
            sx={{ fontWeight: selected ? 700 : 600 }}
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

interface ToolGridButtonProps {
  definition: ToolDefinition;
  selected: boolean;
  onClick: () => void;
}

function ToolGridButton({ definition, selected, onClick }: ToolGridButtonProps) {
  const theme = useTheme();
  const { Icon } = definition;
  const inactiveBg = theme.vars.palette.grey[800];
  const hoverBg = theme.vars.palette.grey[700];
  const shortcutBg = theme.vars.palette.grey[900];

  return (
    <ButtonBase
      onClick={onClick}
      aria-label={definition.label}
      sx={{
        position: "relative",
        minHeight: 58,
        borderRadius: "12px",
        border: "1px solid",
        borderColor: selected ? "primary.main" : theme.vars.palette.grey[700],
        backgroundColor: selected
          ? alpha(theme.palette.primary.main, 0.16)
          : inactiveBg,
        px: 0.85,
        py: 0.65,
        alignItems: "flex-start",
        justifyContent: "flex-start",
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
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
          fontSize: 18,
          color: selected ? "primary.light" : "text.primary"
        }}
      />
      <Typography
        sx={{
          mt: 0.8,
          fontSize: "0.68rem",
          fontWeight: selected ? 800 : 600,
          color: "text.primary"
        }}
      >
        {definition.label}
      </Typography>
    </ButtonBase>
  );
}

export interface SketchCanvasContextMenuProps {
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
  foregroundColor: string;
  backgroundColor: string;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
  onToolChange: (tool: SketchTool) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onPencilSettingsChange: (settings: Partial<PencilSettings>) => void;
  onEraserSettingsChange: (settings: Partial<EraserSettings>) => void;
  onShapeSettingsChange: (settings: Partial<ShapeSettings>) => void;
  onFillSettingsChange: (settings: Partial<FillSettings>) => void;
  onBlurSettingsChange: (settings: Partial<BlurSettings>) => void;
  onGradientSettingsChange: (settings: Partial<GradientSettings>) => void;
  onSwapColors: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearLayer: () => void;
  onExportPng: () => void;
}

const SketchCanvasContextMenu: React.FC<SketchCanvasContextMenuProps> = ({
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
  foregroundColor,
  backgroundColor,
  canUndo,
  canRedo,
  onClose,
  onToolChange,
  onBrushSettingsChange,
  onPencilSettingsChange,
  onEraserSettingsChange,
  onShapeSettingsChange,
  onFillSettingsChange,
  onBlurSettingsChange,
  onGradientSettingsChange,
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
    gradientSettings
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
            mt: -1,
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
            sx={{ mb: 1.5 }}
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

    if (isShapeTool(activeTool)) {
      return (
        <>
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
            sx={{ mb: 1.5 }}
          >
            <ToggleButton value="outline">Outline</ToggleButton>
            <ToggleButton value="filled">Filled</ToggleButton>
          </ToggleButtonGroup>
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

    if (activeTool === "gradient") {
      return (
        <>
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
            sx={{ mb: 1.5 }}
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
          sx: {
            width: 760,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: "16px",
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundImage: "none",
            backgroundColor: theme.vars.palette.grey[900],
            backdropFilter: "blur(16px)",
            boxShadow: theme.shadows[12],
            p: 1.25
          }
        }
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "180px minmax(0, 1fr) 220px",
          gap: 1.25,
          alignItems: "start"
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            borderRadius: "12px",
            border: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.28),
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            px: 1.1,
            py: 0.9
          }}
        >
          <Stack spacing={1}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.9 }}>
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: "9px",
                    display: "grid",
                    placeItems: "center",
                    backgroundColor: alpha(theme.palette.primary.main, 0.18),
                    color: "primary.light"
                  }}
                >
                  <ActiveIcon fontSize="small" />
                </Box>
                <Typography
                  sx={{
                    fontSize: "0.92rem",
                    fontWeight: 800,
                    color: "text.primary"
                  }}
                >
                  {activeDefinition.label}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {summaryItems.map((item) => (
                  <Box
                    key={item}
                    sx={{
                      px: 0.8,
                      py: 0.26,
                      borderRadius: "999px",
                      backgroundColor: theme.vars.palette.grey[800],
                      fontSize: "0.66rem",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      color: "text.secondary"
                    }}
                  >
                    {item}
                  </Box>
                ))}
              </Stack>
            </Box>

            <Divider />

            <Box>{renderColorContext()}</Box>
          </Stack>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            minHeight: 360,
            borderRadius: "12px",
            border: "1px solid",
            borderColor: theme.vars.palette.grey[700],
            backgroundColor: theme.vars.palette.grey[800],
            px: 1.15,
            py: 0.95
          }}
        >
          <SectionLabel>Quick Controls</SectionLabel>
          {renderQuickControls()}
        </Box>

        <Stack spacing={1.1} sx={{ minWidth: 0 }}>
          <Box
            sx={{
              borderRadius: "12px",
              border: "1px solid",
              borderColor: theme.vars.palette.grey[700],
              backgroundColor: theme.vars.palette.grey[800],
              px: 0.95,
              py: 0.95
            }}
          >
            <SectionLabel>Tools</SectionLabel>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 0.7
              }}
            >
              {TOOL_DEFINITIONS.map((definition) => (
                <ToolGridButton
                  key={definition.tool}
                  definition={definition}
                  selected={definition.tool === activeTool}
                  onClick={() => onToolChange(definition.tool)}
                />
              ))}
            </Box>
          </Box>

          <Box
            sx={{
              borderRadius: "12px",
              border: "1px solid",
              borderColor: theme.vars.palette.grey[700],
              backgroundColor: theme.vars.palette.grey[800],
              px: 0.95,
              py: 0.95
            }}
          >
            <SectionLabel>Canvas</SectionLabel>
            <Stack spacing={0.8}>
              <Stack direction="row" spacing={0.8}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<UndoIcon />}
                  onClick={onUndo}
                  disabled={!canUndo}
                  sx={{ minHeight: 30, fontSize: "0.7rem" }}
                >
                  Undo
                </Button>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<RedoIcon />}
                  onClick={onRedo}
                  disabled={!canRedo}
                  sx={{ minHeight: 30, fontSize: "0.7rem" }}
                >
                  Redo
                </Button>
              </Stack>
              <Stack direction="row" spacing={0.8}>
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => {
                    onClearLayer();
                    onClose();
                  }}
                  sx={{ minHeight: 30, fontSize: "0.68rem" }}
                >
                  Clear Layer
                </Button>
                <Button
                  fullWidth
                  size="small"
                  variant="contained"
                  startIcon={<SaveAltIcon />}
                  onClick={() => {
                    onExportPng();
                    onClose();
                  }}
                  sx={{ minHeight: 30, fontSize: "0.68rem" }}
                >
                  Export PNG
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Popover>
  );
};

export default memo(SketchCanvasContextMenu);
