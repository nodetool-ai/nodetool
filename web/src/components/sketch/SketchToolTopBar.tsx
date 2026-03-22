/**
 * SketchToolTopBar
 *
 * Horizontal bar above the canvas containing all tool properties:
 * colors, tool-specific settings, actions, and view/zoom controls.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Divider,
  TextField
} from "@mui/material";
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
  isShapeTool,
  parseColorToRgba,
  rgbaToCss,
  colorToHex6
} from "./types";
import {
  ToolSettingsPanel,
  mergeHexPickerRgbPreserveAlpha
} from "./ToolSettingsPanels";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "8px",
    padding: "4px 8px",
    backgroundColor: theme.vars.palette.grey[800],
    borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
    minHeight: "40px",
    overflowX: "auto",
    flexShrink: 0,
    "& .setting-row": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      "& .MuiSlider-root": {
        width: "80px",
        minWidth: "60px"
      },
      "& .setting-label": {
        fontSize: "0.65rem",
        whiteSpace: "nowrap",
        color: theme.vars.palette.grey[400]
      },
      "& .setting-value": {
        fontSize: "0.65rem",
        minWidth: "24px",
        textAlign: "right",
        color: theme.vars.palette.grey[300]
      }
    },
    "& .color-input": {
      width: "24px",
      height: "24px",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      padding: 0,
      backgroundColor: "transparent"
    },
    "& .fg-bg-swatches": {
      position: "relative",
      width: "34px",
      height: "34px",
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
        width: "20px",
        height: "20px",
        border: `2px solid ${theme.vars.palette.grey[600]}`,
        borderRadius: "3px",
        cursor: "pointer"
      },
      "& .fg-swatch": {
        position: "absolute",
        left: 0,
        top: 0,
        width: "20px",
        height: "20px",
        border: `2px solid ${theme.vars.palette.grey[400]}`,
        borderRadius: "3px",
        cursor: "pointer",
        zIndex: 1
      }
    },
    "& .hex-input": {
      "& .MuiInputBase-root": {
        fontSize: "0.65rem",
        height: "26px"
      },
      "& .MuiInputBase-input": {
        padding: "2px 6px"
      }
    },
    "& .MuiToggleButtonGroup-root": {
      "& .MuiToggleButton-root": {
        padding: "2px 6px",
        fontSize: "0.6rem"
      }
    }
  });

export interface SketchToolTopBarProps {
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
  onImportImage?: (file: File) => void;
}

const SketchToolTopBar: React.FC<SketchToolTopBarProps> = ({
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
  onResetColors
}) => {
  const theme = useTheme();

  const fgHex6 = colorToHex6(foregroundColor);
  const bgHex6 = colorToHex6(backgroundColor);

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
    [
      activeTool,
      onBrushSettingsChange,
      onPencilSettingsChange,
      onFillSettingsChange,
      onShapeSettingsChange,
      onGradientSettingsChange,
      onForegroundColorChange
    ]
  );

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

  return (
    <Box className="sketch-tool-top-bar" css={styles(theme)}>
      {/* ── Color controls ────────────────────────────────────────── */}
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
          value={bgHex6}
          onChange={(e) => {
            onBackgroundColorChange(
              mergeHexPickerRgbPreserveAlpha(backgroundColor, e.target.value)
            );
          }}
          title="Background Color"
        />
      </Box>
      <Tooltip title="Swap Colors (X)">
        <IconButton size="small" onClick={onSwapColors} sx={{ padding: "2px" }}>
          <SwapHorizIcon sx={{ fontSize: "16px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Reset to B/W (D)">
        <IconButton size="small" onClick={onResetColors} sx={{ padding: "2px" }}>
          <Typography
            sx={{ fontSize: "0.6rem", fontWeight: 700, lineHeight: 1 }}
          >
            D
          </Typography>
        </IconButton>
      </Tooltip>
      <TextField
        className="hex-input"
        size="small"
        placeholder="#ffffff"
        value={fgHex6}
        onChange={(e) => handleHexInput(e.target.value)}
        inputProps={{ maxLength: 7 }}
        sx={{ width: "72px" }}
      />

      <Divider orientation="vertical" flexItem />

      {/* ── Tool-specific settings ────────────────────────────────── */}
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

      <Divider orientation="vertical" flexItem />

      {/* ── Actions ───────────────────────────────────────────────── */}
      <Tooltip title="Undo (Ctrl+Z)">
        <span>
          <IconButton size="small" onClick={onUndo} disabled={!canUndo}>
            <UndoIcon sx={{ fontSize: "18px" }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redo (Ctrl+Y)">
        <span>
          <IconButton size="small" onClick={onRedo} disabled={!canRedo}>
            <RedoIcon sx={{ fontSize: "18px" }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Mirror Horizontal (M)">
        <IconButton
          size="small"
          onClick={() => onMirrorXChange(!mirrorX)}
          color={mirrorX ? "primary" : "default"}
        >
          <FlipIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Mirror Vertical">
        <IconButton
          size="small"
          onClick={() => onMirrorYChange(!mirrorY)}
          color={mirrorY ? "primary" : "default"}
        >
          <FlipIcon sx={{ fontSize: "18px", transform: "rotate(90deg)" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Clear Layer (Delete)">
        <IconButton size="small" onClick={onClearLayer}>
          <DeleteOutlineIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Export PNG (Ctrl+S)">
        <IconButton size="small" onClick={onExportPng}>
          <SaveAltIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Flip Layer Horizontal">
        <IconButton size="small" onClick={onFlipHorizontal}>
          <FlipCameraAndroidIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Flip Layer Vertical">
        <IconButton size="small" onClick={onFlipVertical}>
          <FlipCameraAndroidIcon
            sx={{ fontSize: "18px", transform: "rotate(90deg)" }}
          />
        </IconButton>
      </Tooltip>
      <Tooltip title="Merge Down">
        <IconButton size="small" onClick={onMergeDown}>
          <MergeIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Flatten Visible">
        <IconButton size="small" onClick={onFlattenVisible}>
          <FlattenIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      {/* ── View / Zoom ───────────────────────────────────────────── */}
      <Tooltip title="Zoom Out (−)">
        <IconButton size="small" onClick={onZoomOut}>
          <ZoomOutIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Typography
        sx={{
          fontSize: "0.7rem",
          minWidth: "36px",
          textAlign: "center",
          color: "grey.300"
        }}
      >
        {Math.round(zoom * 100)}%
      </Typography>
      <Tooltip title="Zoom In (+)">
        <IconButton size="small" onClick={onZoomIn}>
          <ZoomInIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Reset View (Ctrl+0)">
        <IconButton size="small" onClick={onZoomReset}>
          <FitScreenIcon sx={{ fontSize: "18px" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default memo(SketchToolTopBar);
