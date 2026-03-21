/**
 * SketchToolbar
 *
 * Toolbar for the sketch editor with tool selection, settings panels for
 * brush/eraser/shape/fill, undo/redo, zoom, color swatches, and mirror toggle.
 *
 * Sections are collapsible with state persisted to localStorage.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  IconButton,
  Slider,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  Divider,
  Checkbox,
  FormControlLabel
} from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import CreateIcon from "@mui/icons-material/Create";
import AutoFixNormalIcon from "@mui/icons-material/AutoFixNormal";
import ColorizeIcon from "@mui/icons-material/Colorize";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import FlipIcon from "@mui/icons-material/Flip";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import MergeIcon from "@mui/icons-material/CallMerge";
import FlattenIcon from "@mui/icons-material/Layers";
import FlipCameraAndroidIcon from "@mui/icons-material/FlipCameraAndroid";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import GradientIcon from "@mui/icons-material/Gradient";
import CropIcon from "@mui/icons-material/Crop";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
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
  ColorMode,
  DEFAULT_SWATCHES,
  isShapeTool,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb
} from "./types";

// ─── Collapsible section persistence ──────────────────────────────────────

const COLLAPSED_SECTIONS_KEY = "nodetool-sketch-toolbar-collapsed";

type SectionKey =
  | "colors"
  | "toolSettings"
  | "actions"
  | "swatches"
  | "view"
  | "shortcuts"
  | "adjustments"
  | "canvasSize";

function loadCollapsedSections(): Record<SectionKey, boolean> {
  try {
    const stored = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (stored) {
      return JSON.parse(stored) as Record<SectionKey, boolean>;
    }
  } catch {
    // localStorage parse failed, use defaults
  }
  // Shortcuts collapsed by default to save vertical space — users can expand when needed
  return {
    colors: false,
    toolSettings: false,
    actions: false,
    swatches: false,
    view: false,
    shortcuts: true,
    adjustments: true,
    canvasSize: true
  };
}

function saveCollapsedSections(state: Record<SectionKey, boolean>): void {
  try {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(state));
  } catch {
    // localStorage write failed, ignore
  }
}

// ─── Collapsible ToolbarSection component ─────────────────────────────────

interface ToolbarSectionProps {
  title: string;
  sectionKey: SectionKey;
  collapsed: boolean;
  onToggle: (key: SectionKey) => void;
  children: React.ReactNode;
}

const ToolbarSection = memo(function ToolbarSection({
  title,
  sectionKey,
  collapsed,
  onToggle,
  children
}: ToolbarSectionProps) {
  const handleClick = useCallback(() => {
    onToggle(sectionKey);
  }, [sectionKey, onToggle]);

  return (
    <>
      <Box
        onClick={handleClick}
        sx={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          mt: "2px",
          "&:hover": {
            "& .section-label": { color: "grey.200" },
            "& .collapse-icon": { color: "grey.200" }
          }
        }}
      >
        {collapsed ? (
          <ChevronRightIcon
            className="collapse-icon"
            sx={{ fontSize: "0.85rem", color: "grey.500", mr: "2px" }}
          />
        ) : (
          <ExpandMoreIcon
            className="collapse-icon"
            sx={{ fontSize: "0.85rem", color: "grey.500", mr: "2px" }}
          />
        )}
        <Typography className="section-label">{title}</Typography>
      </Box>
      {!collapsed && children}
    </>
  );
});

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px",
    backgroundColor: theme.vars.palette.grey[800],
    borderRight: `1px solid ${theme.vars.palette.grey[700]}`,
    minWidth: "200px",
    maxWidth: "200px",
    overflowY: "auto",
    "& .section-label": {
      fontSize: "0.7rem",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[400],
      marginTop: "4px"
    },
    "& .tool-group": {
      display: "flex",
      flexWrap: "wrap",
      gap: "2px"
    },
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      "& .MuiSlider-root": {
        flex: 1
      },
      "& .setting-label": {
        fontSize: "0.7rem",
        minWidth: "40px",
        color: theme.vars.palette.grey[400]
      },
      "& .setting-value": {
        fontSize: "0.7rem",
        minWidth: "30px",
        textAlign: "right",
        color: theme.vars.palette.grey[300]
      }
    },
    "& .color-input": {
      width: "32px",
      height: "32px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      padding: 0,
      backgroundColor: "transparent"
    },
    "& .swatch-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      gap: "2px"
    },
    "& .swatch": {
      width: "20px",
      height: "20px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: "2px",
      cursor: "pointer",
      padding: 0,
      "&:hover": {
        transform: "scale(1.2)",
        zIndex: 1
      }
    },
    "& .user-presets-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(8, 1fr)",
      gap: "2px"
    },
    "& .user-preset": {
      width: "20px",
      height: "20px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: "2px",
      cursor: "pointer",
      padding: 0,
      position: "relative",
      "&:hover": {
        transform: "scale(1.2)",
        zIndex: 1
      },
      "&.empty": {
        border: `1px dashed ${theme.vars.palette.grey[600]}`,
        backgroundColor: "transparent"
      }
    },
    "& .fg-bg-container": {
      display: "flex",
      alignItems: "center",
      gap: "6px"
    },
    "& .fg-bg-swatches": {
      position: "relative",
      width: "44px",
      height: "44px",
      flexShrink: 0,
      "& .bg-swatch": {
        position: "absolute",
        right: 0,
        bottom: 0,
        width: "26px",
        height: "26px",
        border: `2px solid ${theme.vars.palette.grey[600]}`,
        borderRadius: "3px",
        cursor: "pointer"
      },
      "& .fg-swatch": {
        position: "absolute",
        left: 0,
        top: 0,
        width: "26px",
        height: "26px",
        border: `2px solid ${theme.vars.palette.grey[400]}`,
        borderRadius: "3px",
        cursor: "pointer",
        zIndex: 1
      }
    },
    "& .hex-input": {
      "& .MuiInputBase-root": {
        fontSize: "0.7rem",
        height: "28px"
      },
      "& .MuiInputBase-input": {
        padding: "4px 8px"
      }
    }
  });

function getToolSettingsLabel(tool: SketchTool): string {
  switch (tool) {
    case "brush": return "Brush";
    case "pencil": return "Pencil";
    case "eraser": return "Eraser";
    case "fill": return "Fill";
    case "blur": return "Blur Brush";
    case "gradient": return "Gradient";
    case "crop": return "Crop";
    case "line":
    case "rectangle":
    case "ellipse":
    case "arrow": return "Shape";
    default: return "Settings";
  }
}

export interface SketchToolbarProps {
  activeTool: SketchTool;
  brushSettings: BrushSettings;
  pencilSettings: PencilSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  fillSettings: FillSettings;
  blurSettings: BlurSettings;
  gradientSettings: GradientSettings;
  zoom: number;
  mirrorX: boolean;
  mirrorY: boolean;
  canUndo: boolean;
  canRedo: boolean;
  foregroundColor: string;
  backgroundColor: string;
  onToolChange: (tool: SketchTool) => void;
  onBrushSettingsChange: (settings: Partial<BrushSettings>) => void;
  onPencilSettingsChange: (settings: Partial<PencilSettings>) => void;
  onEraserSettingsChange: (settings: Partial<EraserSettings>) => void;
  onShapeSettingsChange: (settings: Partial<ShapeSettings>) => void;
  onFillSettingsChange: (settings: Partial<FillSettings>) => void;
  onBlurSettingsChange: (settings: Partial<BlurSettings>) => void;
  onGradientSettingsChange: (settings: Partial<GradientSettings>) => void;
  onMirrorXChange: (mirrorX: boolean) => void;
  onMirrorYChange: (mirrorY: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onClearLayer: () => void;
  onExportPng: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onMergeDown: () => void;
  onFlattenVisible: () => void;
  onForegroundColorChange: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onSwapColors: () => void;
  onResetColors: () => void;
  onApplyAdjustments: (brightness: number, contrast: number, saturation: number) => void;
  onResetAdjustments: () => void;
  onBackgroundPreset: (color: string) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  onImportImage?: (file: File) => void;
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  brushSettings,
  pencilSettings,
  eraserSettings,
  shapeSettings,
  fillSettings,
  blurSettings,
  gradientSettings,
  zoom,
  mirrorX,
  mirrorY,
  canUndo,
  canRedo,
  foregroundColor,
  backgroundColor,
  onToolChange,
  onBrushSettingsChange,
  onPencilSettingsChange,
  onEraserSettingsChange,
  onShapeSettingsChange,
  onFillSettingsChange,
  onBlurSettingsChange,
  onGradientSettingsChange,
  onMirrorXChange,
  onMirrorYChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onClearLayer,
  onExportPng,
  onFlipHorizontal,
  onFlipVertical,
  onMergeDown,
  onFlattenVisible,
  onForegroundColorChange,
  onBackgroundColorChange,
  onSwapColors,
  onResetColors,
  onApplyAdjustments,
  onResetAdjustments,
  onBackgroundPreset,
  colorMode,
  onColorModeChange,
  onImportImage
}) => {
  const theme = useTheme();

  // ─── Collapsible section state (persisted in localStorage) ────────
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>(
    loadCollapsedSections
  );

  const handleToggleSection = useCallback((key: SectionKey) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsedSections(next);
      return next;
    });
  }, []);

  // ─── Adjustment sliders state ─────────────────────────────────────
  const [adjBrightness, setAdjBrightness] = useState(0);
  const [adjContrast, setAdjContrast] = useState(0);
  const [adjSaturation, setAdjSaturation] = useState(0);
  const adjustDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-apply adjustments with 100ms debounce
  useEffect(() => {
    if (adjustDebounceRef.current !== null) {
      clearTimeout(adjustDebounceRef.current);
    }
    adjustDebounceRef.current = setTimeout(() => {
      onApplyAdjustments(adjBrightness, adjContrast, adjSaturation);
      adjustDebounceRef.current = null;
    }, 100);
    return () => {
      if (adjustDebounceRef.current !== null) {
        clearTimeout(adjustDebounceRef.current);
      }
    };
  }, [adjBrightness, adjContrast, adjSaturation, onApplyAdjustments]);

  // ─── User color presets (8 slots, persisted in localStorage) ──────
  const USER_PRESETS_KEY = "nodetool-sketch-color-presets";
  const PRESET_COUNT = 8;

  const [userPresets, setUserPresets] = useState<(string | null)[]>(() => {
    try {
      const stored = localStorage.getItem(USER_PRESETS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as (string | null)[];
        if (Array.isArray(parsed) && parsed.length === PRESET_COUNT) {
          return parsed;
        }
      }
    } catch {
      // localStorage parse failed, use defaults
    }
    return Array(PRESET_COUNT).fill(null) as (string | null)[];
  });

  useEffect(() => {
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets));
    } catch {
      // localStorage write failed, ignore
    }
  }, [userPresets]);

  const handleToolChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: string | null) => {
      if (value) {
        onToolChange(value as SketchTool);
      }
    },
    [onToolChange]
  );

  const handleSwatchClick = useCallback(
    (color: string) => {
      onForegroundColorChange(color);
      if (activeTool === "brush") {
        onBrushSettingsChange({ color });
      } else if (activeTool === "pencil") {
        onPencilSettingsChange({ color });
      } else if (activeTool === "fill") {
        onFillSettingsChange({ color });
      } else if (isShapeTool(activeTool)) {
        onShapeSettingsChange({ strokeColor: color });
      } else if (activeTool === "gradient") {
        onGradientSettingsChange({ startColor: color });
      } else {
        onBrushSettingsChange({ color });
      }
    },
    [activeTool, onBrushSettingsChange, onPencilSettingsChange, onFillSettingsChange, onShapeSettingsChange, onGradientSettingsChange, onForegroundColorChange]
  );

  const handlePresetClick = useCallback(
    (index: number) => {
      const color = userPresets[index];
      if (color) {
        handleSwatchClick(color);
      }
    },
    [userPresets, handleSwatchClick]
  );

  const handlePresetSave = useCallback(
    (index: number) => {
      setUserPresets((prev) => {
        const next = [...prev];
        next[index] = foregroundColor;
        return next;
      });
    },
    [foregroundColor]
  );

  const handleHexInput = useCallback(
    (hex: string) => {
      const cleaned = hex.startsWith("#") ? hex : `#${hex}`;
      if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
        handleSwatchClick(cleaned.toLowerCase());
      }
    },
    [handleSwatchClick]
  );

  // ─── RGB / HSL input handlers ─────────────────────────────────────
  const handleRgbInput = useCallback(
    (channel: "r" | "g" | "b", value: number) => {
      const rgb = hexToRgb(foregroundColor);
      rgb[channel] = Math.max(0, Math.min(255, value));
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      handleSwatchClick(hex);
    },
    [foregroundColor, handleSwatchClick]
  );

  const handleHslInput = useCallback(
    (channel: "h" | "s" | "l", value: number) => {
      const rgb = hexToRgb(foregroundColor);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      if (channel === "h") {
        hsl.h = Math.max(0, Math.min(360, value));
      } else if (channel === "s") {
        hsl.s = Math.max(0, Math.min(100, value));
      } else {
        hsl.l = Math.max(0, Math.min(100, value));
      }
      const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
      handleSwatchClick(hex);
    },
    [foregroundColor, handleSwatchClick]
  );

  // ─── Derived color values for RGB / HSL inputs ────────────────────
  const fgRgb = useMemo(() => hexToRgb(foregroundColor), [foregroundColor]);
  const fgHsl = useMemo(() => rgbToHsl(fgRgb.r, fgRgb.g, fgRgb.b), [fgRgb]);

  return (
    <Box css={styles(theme)}>
      {/* ── Tools (always visible, not collapsible) ───────────────── */}
      <Typography className="section-label">Tools</Typography>
      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
        <ToggleButton value="move" aria-label="Move">
          <Tooltip title="Move (V)">
            <OpenWithIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="select" aria-label="Select">
          <Tooltip title="Select">
            <SelectAllIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="brush" aria-label="Brush">
          <Tooltip title="Brush (B)">
            <BrushIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="pencil" aria-label="Pencil">
          <Tooltip title="Pencil (P)">
            <CreateIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="eraser" aria-label="Eraser">
          <Tooltip title="Eraser (E)">
            <AutoFixNormalIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="fill" aria-label="Fill">
          <Tooltip title="Fill (G)">
            <FormatColorFillIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="eyedropper" aria-label="Eyedropper">
          <Tooltip title="Eyedropper (I)">
            <ColorizeIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="blur" aria-label="Blur Brush">
          <Tooltip title="Blur Brush (Q)">
            <BlurOnIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
        <ToggleButton value="line" aria-label="Line">
          <Tooltip title="Line (L)">
            <HorizontalRuleIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="rectangle" aria-label="Rectangle">
          <Tooltip title="Rectangle (R)">
            <RectangleOutlinedIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="ellipse" aria-label="Ellipse">
          <Tooltip title="Ellipse (O)">
            <CircleOutlinedIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="arrow" aria-label="Arrow">
          <Tooltip title="Arrow (A)">
            <ArrowRightAltIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="gradient" aria-label="Gradient">
          <Tooltip title="Gradient (T)">
            <GradientIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="crop" aria-label="Crop">
          <Tooltip title="Crop (C)">
            <CropIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider />

      {/* ── Colors (collapsible) ──────────────────────────────────── */}
      <ToolbarSection
        title="Colors"
        sectionKey="colors"
        collapsed={collapsedSections.colors}
        onToggle={handleToggleSection}
      >
        <Box className="fg-bg-container">
          <Box className="fg-bg-swatches">
            <input
              type="color"
              className="fg-swatch"
              value={foregroundColor}
              onChange={(e) => {
                onForegroundColorChange(e.target.value);
                if (activeTool === "brush") {
                  onBrushSettingsChange({ color: e.target.value });
                } else if (activeTool === "pencil") {
                  onPencilSettingsChange({ color: e.target.value });
                } else if (activeTool === "fill") {
                  onFillSettingsChange({ color: e.target.value });
                } else if (isShapeTool(activeTool)) {
                  onShapeSettingsChange({ strokeColor: e.target.value });
                }
              }}
              title="Foreground Color"
            />
            <input
              type="color"
              className="bg-swatch"
              value={backgroundColor}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
              title="Background Color"
            />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <Tooltip title="Swap Colors (X)">
              <IconButton size="small" onClick={onSwapColors} sx={{ padding: "2px" }}>
                <SwapHorizIcon sx={{ fontSize: "16px" }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reset to B/W (D)">
              <IconButton size="small" onClick={onResetColors} sx={{ padding: "2px" }}>
                <Typography sx={{ fontSize: "0.6rem", fontWeight: 700, lineHeight: 1 }}>D</Typography>
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <ToggleButtonGroup
          value={colorMode}
          exclusive
          onChange={(_e, val) => { if (val) { onColorModeChange(val); } }}
          size="small"
          fullWidth
          sx={{ mt: "4px", "& .MuiToggleButton-root": { flex: 1, fontSize: "0.7rem", py: "4px" } }}
        >
          <ToggleButton value="hex" aria-label="HEX mode">HEX</ToggleButton>
          <ToggleButton value="rgb" aria-label="RGB mode">RGB</ToggleButton>
          <ToggleButton value="hsl" aria-label="HSL mode">HSL</ToggleButton>
        </ToggleButtonGroup>
        {colorMode === "hex" && (
          <TextField
            className="hex-input"
            size="small"
            placeholder="#ffffff"
            value={foregroundColor}
            onChange={(e) => handleHexInput(e.target.value)}
            inputProps={{ maxLength: 7 }}
            fullWidth
            sx={{ mt: "4px" }}
          />
        )}
        {colorMode === "rgb" && (
          <Box sx={{ display: "flex", gap: "4px", mt: "4px" }}>
            {(["r", "g", "b"] as const).map((ch) => (
              <TextField
                key={ch}
                className="hex-input"
                size="small"
                label={ch.toUpperCase()}
                type="number"
                value={fgRgb[ch]}
                onChange={(e) => handleRgbInput(ch, parseInt(e.target.value, 10) || 0)}
                inputProps={{ min: 0, max: 255, step: 1 }}
                sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: "0.65rem" } }}
              />
            ))}
          </Box>
        )}
        {colorMode === "hsl" && (
          <Box sx={{ display: "flex", gap: "4px", mt: "4px" }}>
            <TextField
              className="hex-input"
              size="small"
              label="H"
              type="number"
              value={fgHsl.h}
              onChange={(e) => handleHslInput("h", parseInt(e.target.value, 10) || 0)}
              inputProps={{ min: 0, max: 360, step: 1 }}
              sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: "0.65rem" } }}
            />
            <TextField
              className="hex-input"
              size="small"
              label="S"
              type="number"
              value={fgHsl.s}
              onChange={(e) => handleHslInput("s", parseInt(e.target.value, 10) || 0)}
              inputProps={{ min: 0, max: 100, step: 1 }}
              sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: "0.65rem" } }}
            />
            <TextField
              className="hex-input"
              size="small"
              label="L"
              type="number"
              value={fgHsl.l}
              onChange={(e) => handleHslInput("l", parseInt(e.target.value, 10) || 0)}
              inputProps={{ min: 0, max: 100, step: 1 }}
              sx={{ flex: 1, "& .MuiInputLabel-root": { fontSize: "0.65rem" } }}
            />
          </Box>
        )}
        <Box sx={{ display: "flex", gap: "4px", mt: "4px" }}>
          {([
            { label: "Black", color: "#000000" },
            { label: "White", color: "#ffffff" },
            { label: "Gray", color: "#808080" }
          ] as const).map(({ label, color }) => (
            <Tooltip key={color} title={`${label} Background`}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onBackgroundPreset(color)}
                sx={{ minWidth: 0, flex: 1, fontSize: "0.6rem", padding: "1px 4px", color: "grey.400", borderColor: "grey.600" }}
              >
                {label}
              </Button>
            </Tooltip>
          ))}
        </Box>
      </ToolbarSection>

      <Divider />

      {/* ── Tool Settings (collapsible, contextual) ───────────────── */}
      <ToolbarSection
        title={getToolSettingsLabel(activeTool)}
        sectionKey="toolSettings"
        collapsed={collapsedSections.toolSettings}
        onToggle={handleToggleSection}
      >
        {activeTool === "brush" && (
          <>
            <ToggleButtonGroup
              value={brushSettings.brushType || "round"}
              exclusive
              onChange={(_, v) => { if (v) { onBrushSettingsChange({ brushType: v as BrushType }); } }}
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
                value={brushSettings.color}
                onChange={(e) => onBrushSettingsChange({ color: e.target.value })}
              />
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Size</Typography>
              <Slider
                size="small" min={1} max={200}
                value={brushSettings.size}
                onChange={(_, v) => onBrushSettingsChange({ size: v as number })}
              />
              <Typography className="setting-value">{brushSettings.size}</Typography>
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Opacity</Typography>
              <Slider
                size="small" min={0} max={1} step={0.01}
                value={brushSettings.opacity}
                onChange={(_, v) => onBrushSettingsChange({ opacity: v as number })}
              />
              <Typography className="setting-value">
                {Math.round(brushSettings.opacity * 100)}%
              </Typography>
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Hard</Typography>
              <Slider
                size="small" min={0} max={1} step={0.01}
                value={brushSettings.hardness}
                onChange={(_, v) => onBrushSettingsChange({ hardness: v as number })}
              />
              <Typography className="setting-value">
                {Math.round(brushSettings.hardness * 100)}%
              </Typography>
            </Box>
          </>
        )}

        {activeTool === "pencil" && (
          <>
            <Box className="setting-row">
              <Typography className="setting-label">Color</Typography>
              <input
                type="color"
                className="color-input"
                value={pencilSettings.color}
                onChange={(e) => onPencilSettingsChange({ color: e.target.value })}
              />
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Size</Typography>
              <Slider
                size="small" min={1} max={10}
                value={pencilSettings.size}
                onChange={(_, v) => onPencilSettingsChange({ size: v as number })}
              />
              <Typography className="setting-value">{pencilSettings.size}</Typography>
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Opacity</Typography>
              <Slider
                size="small" min={0} max={1} step={0.01}
                value={pencilSettings.opacity}
                onChange={(_, v) => onPencilSettingsChange({ opacity: v as number })}
              />
              <Typography className="setting-value">
                {Math.round(pencilSettings.opacity * 100)}%
              </Typography>
            </Box>
          </>
        )}

        {activeTool === "eraser" && (
          <>
            <Box className="setting-row">
              <Typography className="setting-label">Size</Typography>
              <Slider
                size="small" min={1} max={200}
                value={eraserSettings.size}
                onChange={(_, v) => onEraserSettingsChange({ size: v as number })}
              />
              <Typography className="setting-value">{eraserSettings.size}</Typography>
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Opacity</Typography>
              <Slider
                size="small" min={0} max={1} step={0.01}
                value={eraserSettings.opacity}
                onChange={(_, v) => onEraserSettingsChange({ opacity: v as number })}
              />
              <Typography className="setting-value">
                {Math.round(eraserSettings.opacity * 100)}%
              </Typography>
            </Box>
          </>
        )}

        {isShapeTool(activeTool) && (
          <>
            <Box className="setting-row">
              <Typography className="setting-label">Stroke</Typography>
              <input
                type="color"
                className="color-input"
                value={shapeSettings.strokeColor}
                onChange={(e) => onShapeSettingsChange({ strokeColor: e.target.value })}
              />
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Width</Typography>
              <Slider
                size="small" min={1} max={50}
                value={shapeSettings.strokeWidth}
                onChange={(_, v) => onShapeSettingsChange({ strokeWidth: v as number })}
              />
              <Typography className="setting-value">{shapeSettings.strokeWidth}</Typography>
            </Box>
            {(activeTool === "rectangle" || activeTool === "ellipse") && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={shapeSettings.filled}
                      onChange={(e) => onShapeSettingsChange({ filled: e.target.checked })}
                    />
                  }
                  label={<Typography sx={{ fontSize: "0.75rem" }}>Fill</Typography>}
                />
                {shapeSettings.filled && (
                  <Box className="setting-row">
                    <Typography className="setting-label">Fill</Typography>
                    <input
                      type="color"
                      className="color-input"
                      value={shapeSettings.fillColor}
                      onChange={(e) => onShapeSettingsChange({ fillColor: e.target.value })}
                    />
                  </Box>
                )}
              </>
            )}
          </>
        )}

        {activeTool === "fill" && (
          <>
            <Box className="setting-row">
              <Typography className="setting-label">Color</Typography>
              <input
                type="color"
                className="color-input"
                value={fillSettings.color}
                onChange={(e) => onFillSettingsChange({ color: e.target.value })}
              />
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Tolerance</Typography>
              <Slider
                size="small" min={0} max={128}
                value={fillSettings.tolerance}
                onChange={(_, v) => onFillSettingsChange({ tolerance: v as number })}
              />
              <Typography className="setting-value">{fillSettings.tolerance}</Typography>
            </Box>
          </>
        )}

        {activeTool === "blur" && (
          <>
            <Box className="setting-row">
              <Typography className="setting-label">Size</Typography>
              <Slider
                size="small" min={1} max={200}
                value={blurSettings.size}
                onChange={(_, v) => onBlurSettingsChange({ size: v as number })}
              />
              <Typography className="setting-value">{blurSettings.size}</Typography>
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">Strength</Typography>
              <Slider
                size="small" min={1} max={20}
                value={blurSettings.strength}
                onChange={(_, v) => onBlurSettingsChange({ strength: v as number })}
              />
              <Typography className="setting-value">{blurSettings.strength}</Typography>
            </Box>
          </>
        )}

        {activeTool === "gradient" && (
          <>
            <Box className="setting-row">
              <Typography className="setting-label">Start</Typography>
              <input
                type="color"
                className="color-input"
                value={gradientSettings.startColor}
                onChange={(e) => onGradientSettingsChange({ startColor: e.target.value })}
              />
            </Box>
            <Box className="setting-row">
              <Typography className="setting-label">End</Typography>
              <input
                type="color"
                className="color-input"
                value={gradientSettings.endColor}
                onChange={(e) => onGradientSettingsChange({ endColor: e.target.value })}
              />
            </Box>
            <ToggleButtonGroup
              value={gradientSettings.type}
              exclusive
              onChange={(_, v) => { if (v) { onGradientSettingsChange({ type: v }); } }}
              size="small"
              fullWidth
            >
              <ToggleButton value="linear" sx={{ fontSize: "0.65rem", py: "2px" }}>
                Linear
              </ToggleButton>
              <ToggleButton value="radial" sx={{ fontSize: "0.65rem", py: "2px" }}>
                Radial
              </ToggleButton>
            </ToggleButtonGroup>
          </>
        )}

        {activeTool === "crop" && (
          <Typography sx={{ fontSize: "0.7rem", color: "grey.500", fontStyle: "italic" }}>
            Drag on canvas to select crop area.
          </Typography>
        )}

        {(activeTool === "move" || activeTool === "eyedropper") && (
          <Typography sx={{ fontSize: "0.7rem", color: "grey.500", fontStyle: "italic" }}>
            No settings for this tool.
          </Typography>
        )}
      </ToolbarSection>

      <Divider />

      {/* ── Actions (collapsible) — History + Layer ops ────────────── */}
      <ToolbarSection
        title="Actions"
        sectionKey="actions"
        collapsed={collapsedSections.actions}
        onToggle={handleToggleSection}
      >
        <Box sx={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={onUndo} disabled={!canUndo}>
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={onRedo} disabled={!canRedo}>
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Mirror Horizontal (M)">
            <IconButton
              size="small"
              onClick={() => onMirrorXChange(!mirrorX)}
              color={mirrorX ? "primary" : "default"}
            >
              <FlipIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Mirror Vertical">
            <IconButton
              size="small"
              onClick={() => onMirrorYChange(!mirrorY)}
              color={mirrorY ? "primary" : "default"}
            >
              <FlipIcon fontSize="small" sx={{ transform: "rotate(90deg)" }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          <Tooltip title="Clear Layer (Delete)">
            <IconButton size="small" onClick={onClearLayer}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export PNG (Ctrl+S)">
            <IconButton size="small" onClick={onExportPng}>
              <SaveAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flip Layer Horizontal">
            <IconButton size="small" onClick={onFlipHorizontal}>
              <FlipCameraAndroidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flip Layer Vertical">
            <IconButton size="small" onClick={onFlipVertical}>
              <FlipCameraAndroidIcon fontSize="small" sx={{ transform: "rotate(90deg)" }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <Tooltip title="Merge Down">
            <IconButton size="small" onClick={onMergeDown}>
              <MergeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flatten Visible">
            <IconButton size="small" onClick={onFlattenVisible}>
              <FlattenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </ToolbarSection>

      <Divider />

      {/* ── Swatches & Presets (collapsible) ──────────────────────── */}
      <ToolbarSection
        title="Swatches"
        sectionKey="swatches"
        collapsed={collapsedSections.swatches}
        onToggle={handleToggleSection}
      >
        <Box className="swatch-grid">
          {DEFAULT_SWATCHES.map((color) => (
            <button
              key={color}
              className="swatch"
              style={{ backgroundColor: color }}
              onClick={() => handleSwatchClick(color)}
              aria-label={`Color ${color}`}
            />
          ))}
        </Box>

        <Typography className="section-label" sx={{ mt: "4px" }}>
          Presets
          <Typography component="span" sx={{ fontSize: "0.55rem", color: "grey.500", ml: "4px" }}>
            right-click to save
          </Typography>
        </Typography>
        <Box className="user-presets-grid">
          {userPresets.map((color, idx) => (
            <button
              key={idx}
              className={`user-preset${color ? "" : " empty"}`}
              style={color ? { backgroundColor: color } : undefined}
              onClick={() => handlePresetClick(idx)}
              onContextMenu={(e) => {
                e.preventDefault();
                handlePresetSave(idx);
              }}
              aria-label={color ? `Preset color ${color}` : `Empty preset slot ${idx + 1}`}
            />
          ))}
        </Box>
      </ToolbarSection>

      <Divider />

      {/* ── View / Zoom (collapsible) ─────────────────────────────── */}
      <ToolbarSection
        title="View"
        sectionKey="view"
        collapsed={collapsedSections.view}
        onToggle={handleToggleSection}
      >
        <Box sx={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <Tooltip title="Zoom Out (−)">
            <IconButton size="small" onClick={onZoomOut}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography
            sx={{ fontSize: "0.75rem", minWidth: "40px", textAlign: "center" }}
          >
            {Math.round(zoom * 100)}%
          </Typography>
          <Tooltip title="Zoom In (+)">
            <IconButton size="small" onClick={onZoomIn}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset View (Ctrl+0)">
            <IconButton size="small" onClick={onZoomReset}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </ToolbarSection>

      <Divider />

      {/* ── Adjustments (collapsible) ──────────────────────────────── */}
      <ToolbarSection
        title="Adjustments"
        sectionKey="adjustments"
        collapsed={collapsedSections.adjustments}
        onToggle={handleToggleSection}
      >
        <Box className="setting-row">
          <Typography className="setting-label">Bright</Typography>
          <Slider
            size="small" min={-100} max={100}
            value={adjBrightness}
            onChange={(_, v) => setAdjBrightness(v as number)}
          />
          <Typography className="setting-value">{adjBrightness}</Typography>
        </Box>
        <Box className="setting-row">
          <Typography className="setting-label">Contrast</Typography>
          <Slider
            size="small" min={-100} max={100}
            value={adjContrast}
            onChange={(_, v) => setAdjContrast(v as number)}
          />
          <Typography className="setting-value">{adjContrast}</Typography>
        </Box>
        <Box className="setting-row">
          <Typography className="setting-label">Satur.</Typography>
          <Slider
            size="small" min={-100} max={100}
            value={adjSaturation}
            onChange={(_, v) => setAdjSaturation(v as number)}
          />
          <Typography className="setting-value">{adjSaturation}</Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          fullWidth
          onClick={() => {
            setAdjBrightness(0);
            setAdjContrast(0);
            setAdjSaturation(0);
            onResetAdjustments();
          }}
          sx={{ mt: "4px", fontSize: "0.7rem", py: "2px" }}
        >
          Reset
        </Button>
      </ToolbarSection>
    </Box>
  );
};

export default memo(SketchToolbar);
