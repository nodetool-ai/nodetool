/**
 * SketchToolbar
 *
 * Toolbar for the sketch editor with tool selection, settings panels for
 * brush/eraser/shape/fill, undo/redo, zoom, color swatches, and mirror toggle.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
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
import TextField from "@mui/material/TextField";
import {
  SketchTool,
  BrushSettings,
  PencilSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  DEFAULT_SWATCHES,
  CANVAS_PRESETS,
  isShapeTool
} from "./types";

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

export interface SketchToolbarProps {
  activeTool: SketchTool;
  brushSettings: BrushSettings;
  pencilSettings: PencilSettings;
  eraserSettings: EraserSettings;
  shapeSettings: ShapeSettings;
  fillSettings: FillSettings;
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
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  brushSettings,
  pencilSettings,
  eraserSettings,
  shapeSettings,
  fillSettings,
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
  onResetColors
}) => {
  const theme = useTheme();

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
      } else {
        onBrushSettingsChange({ color });
      }
    },
    [activeTool, onBrushSettingsChange, onPencilSettingsChange, onFillSettingsChange, onShapeSettingsChange, onForegroundColorChange]
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

  return (
    <Box css={styles(theme)}>
      {/* Move Tool */}
      <Typography className="section-label">Transform</Typography>
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
      </ToggleButtonGroup>

      {/* Drawing Tools */}
      <Typography className="section-label">Draw</Typography>
      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
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
      </ToggleButtonGroup>

      {/* Shape Tools */}
      <Typography className="section-label">Shapes</Typography>
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
      </ToggleButtonGroup>

      <Divider />

      {/* Undo / Redo / Mirror */}
      <Typography className="section-label">History</Typography>
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

      {/* Actions */}
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

      <Divider />

      {/* Foreground / Background Colors */}
      <Typography className="section-label">Colors</Typography>
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
      <TextField
        className="hex-input"
        size="small"
        placeholder="#ffffff"
        value={foregroundColor}
        onChange={(e) => handleHexInput(e.target.value)}
        inputProps={{ maxLength: 7 }}
        fullWidth
      />

      <Divider />

      {/* Tool-specific Settings */}
      {activeTool === "brush" && (
        <>
          <Typography className="section-label">Brush</Typography>
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
          <Typography className="section-label">Pencil</Typography>
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
          <Typography className="section-label">Eraser</Typography>
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
          <Typography className="section-label">Shape</Typography>
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
          <Typography className="section-label">Fill</Typography>
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

      <Divider />

      {/* Color Swatches */}
      <Typography className="section-label">Swatches</Typography>
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

      <Divider />

      {/* Zoom */}
      <Typography className="section-label">View</Typography>
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

      {/* Keyboard Shortcuts Reference */}
      <Divider />
      <Typography className="section-label">Shortcuts</Typography>
      <Typography sx={{ fontSize: "0.65rem", color: "grey.500", lineHeight: 1.6 }}>
        V — Move &nbsp; B — Brush &nbsp; P — Pencil<br />
        E — Eraser &nbsp; G — Fill &nbsp; I — Eyedropper<br />
        L — Line &nbsp; R — Rect &nbsp; O — Ellipse<br />
        M — Mirror &nbsp; X — Swap colors<br />
        D — Reset colors &nbsp; Tab — Toggle UI<br />
        [ / ] — Brush size &nbsp; Shift — Constrain<br />
        Space+Drag — Pan canvas<br />
        + / − — Zoom &nbsp; Ctrl+0 — Reset view<br />
        Delete — Clear layer &nbsp; Ctrl+S — Export
      </Typography>
    </Box>
  );
};

export default memo(SketchToolbar);
