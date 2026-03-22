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
  Divider
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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
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
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  ColorMode,
  DEFAULT_SWATCHES,
  isShapeTool,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  parseColorToRgba,
  rgbaToCss,
  colorToHex6
} from "./types";
import {
  ToolSettingsPanel,
  getToolSettingsLabel,
  mergeHexPickerRgbPreserveAlpha
} from "./ToolSettingsPanels";

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
      backgroundColor: "#2a2a2a",
      backgroundImage: `linear-gradient(45deg, #3a3a3a 25%, transparent 25%), linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a3a 75%), linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)`,
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
      borderRadius: "4px",
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

export interface SketchToolbarProps {
  activeTool: SketchTool;
  brushSettings: BrushSettings;
  pencilSettings: PencilSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  fillSettings: FillSettings;
  blurSettings: BlurSettings;
  gradientSettings: GradientSettings;
  cloneStampSettings: CloneStampSettings;
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
  onCloneStampSettingsChange: (settings: Partial<CloneStampSettings>) => void;
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
  cloneStampSettings,
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
  onCloneStampSettingsChange,
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
  const adjustDebounceRef = useRef<number | null>(null);

  // Auto-apply adjustments with 100ms debounce
  useEffect(() => {
    if (adjustDebounceRef.current !== null) {
      clearTimeout(adjustDebounceRef.current);
    }
    adjustDebounceRef.current = window.setTimeout(() => {
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

  // Hold-to-drag swatch interaction: press on a swatch, drag over others
  // to preview, release to confirm
  const swatchDraggingRef = useRef(false);

  const handleSwatchMouseDown = useCallback(
    (color: string) => {
      swatchDraggingRef.current = true;
      handleSwatchClick(color);
    },
    [handleSwatchClick]
  );

  const handleSwatchMouseEnter = useCallback(
    (color: string) => {
      if (swatchDraggingRef.current) {
        handleSwatchClick(color);
      }
    },
    [handleSwatchClick]
  );

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      swatchDraggingRef.current = false;
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const handleHexInput = useCallback(
    (hex: string) => {
      const cleaned = hex.startsWith("#") ? hex : `#${hex}`;
      if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
        const { a } = parseColorToRgba(foregroundColor);
        const { r, g, b } = parseColorToRgba(cleaned.toLowerCase());
        handleSwatchClick(rgbaToCss({ r, g, b, a }));
      }
    },
    [foregroundColor, handleSwatchClick]
  );

  // ─── RGB / HSL input handlers ─────────────────────────────────────
  const handleRgbInput = useCallback(
    (channel: "r" | "g" | "b", value: number) => {
      const { a } = parseColorToRgba(foregroundColor);
      const rgb = hexToRgb(foregroundColor);
      rgb[channel] = Math.max(0, Math.min(255, value));
      handleSwatchClick(rgbaToCss({ r: rgb.r, g: rgb.g, b: rgb.b, a }));
    },
    [foregroundColor, handleSwatchClick]
  );

  const handleHslInput = useCallback(
    (channel: "h" | "s" | "l", value: number) => {
      const { a } = parseColorToRgba(foregroundColor);
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
      handleSwatchClick(
        rgbaToCss({ r: newRgb.r, g: newRgb.g, b: newRgb.b, a })
      );
    },
    [foregroundColor, handleSwatchClick]
  );

  // ─── Derived color values for RGB / HSL inputs ────────────────────
  const fgRgb = useMemo(() => hexToRgb(foregroundColor), [foregroundColor]);
  const fgHsl = useMemo(() => rgbToHsl(fgRgb.r, fgRgb.g, fgRgb.b), [fgRgb]);
  const fgHex6 = useMemo(
    () => colorToHex6(foregroundColor),
    [foregroundColor]
  );

  return (
    <Box className="sketch-toolbar" css={styles(theme)}>
      {/* ── Tools (always visible, not collapsible) ───────────────── */}
      <Typography className="section-label sketch-toolbar__section-label">
        Tools
      </Typography>
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
        <ToggleButton value="clone_stamp" aria-label="Clone Stamp">
          <Tooltip title="Clone Stamp (S) — Alt+click to set source">
            <ContentCopyIcon fontSize="small" />
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
              value={fgHex6}
              onChange={(e) => {
                const c = mergeHexPickerRgbPreserveAlpha(
                  foregroundColor,
                  e.target.value
                );
                handleSwatchClick(c);
              }}
              title="Foreground Color"
            />
            <input
              type="color"
              className="bg-swatch"
              value={colorToHex6(backgroundColor)}
              onChange={(e) => {
                onBackgroundColorChange(
                  mergeHexPickerRgbPreserveAlpha(
                    backgroundColor,
                    e.target.value
                  )
                );
              }}
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
          sx={{
            mt: "6px",
            "& .MuiToggleButton-root": {
              flex: 1,
              fontSize: "0.75rem",
              fontWeight: 700,
              py: "5px",
              letterSpacing: "0.05em",
              borderColor: "grey.700",
              "&.Mui-selected": {
                bgcolor: "grey.700",
                color: "common.white",
                "&:hover": { bgcolor: "grey.600" }
              }
            }
          }}
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
            value={fgHex6}
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
        <Box sx={{ mt: "6px" }}>
          <Typography
            sx={{ fontSize: "0.65rem", color: "grey.500", mb: "2px" }}
          >
            Foreground opacity
          </Typography>
          <Slider
            size="small"
            min={0}
            max={100}
            step={1}
            value={Math.round(parseColorToRgba(foregroundColor).a * 100)}
            onChange={(_, v) => {
              const a = (v as number) / 100;
              const { r, g, b } = parseColorToRgba(foregroundColor);
              handleSwatchClick(rgbaToCss({ r, g, b, a }));
            }}
          />
        </Box>
        <Box sx={{ mt: "4px" }}>
          <Typography
            sx={{ fontSize: "0.65rem", color: "grey.500", mb: "2px" }}
          >
            Background opacity
          </Typography>
          <Slider
            size="small"
            min={0}
            max={100}
            step={1}
            value={Math.round(parseColorToRgba(backgroundColor).a * 100)}
            onChange={(_, v) => {
              const a = (v as number) / 100;
              const { r, g, b } = parseColorToRgba(backgroundColor);
              onBackgroundColorChange(rgbaToCss({ r, g, b, a }));
            }}
          />
        </Box>
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
        <ToolSettingsPanel
          activeTool={activeTool}
          brushSettings={brushSettings}
          pencilSettings={pencilSettings}
          eraserSettings={eraserSettings}
          shapeSettings={shapeSettings}
          fillSettings={fillSettings}
          blurSettings={blurSettings}
          gradientSettings={gradientSettings}
          cloneStampSettings={cloneStampSettings}
          onBrushSettingsChange={onBrushSettingsChange}
          onPencilSettingsChange={onPencilSettingsChange}
          onEraserSettingsChange={onEraserSettingsChange}
          onShapeSettingsChange={onShapeSettingsChange}
          onFillSettingsChange={onFillSettingsChange}
          onBlurSettingsChange={onBlurSettingsChange}
          onGradientSettingsChange={onGradientSettingsChange}
          onCloneStampSettingsChange={onCloneStampSettingsChange}
        />
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
              onMouseDown={() => handleSwatchMouseDown(color)}
              onMouseEnter={() => handleSwatchMouseEnter(color)}
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
              onMouseDown={() => { if (color) { handleSwatchMouseDown(color); } }}
              onMouseEnter={() => { if (color) { handleSwatchMouseEnter(color); } }}
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
