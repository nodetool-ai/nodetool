/**
 * SketchToolbar
 *
 * Narrow vertical icon toolbar for tool selection only.
 * Tools are arranged in a 2-column grid with section dividers.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
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
import BlurOnIcon from "@mui/icons-material/BlurOn";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GradientIcon from "@mui/icons-material/Gradient";
import CropIcon from "@mui/icons-material/Crop";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import TuneIcon from "@mui/icons-material/Tune";
import { SketchTool } from "./types";
import ColorSwatchPair from "./ColorSwatchPair";

const BTN = 32; // button size px

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "6px 4px",
    backgroundColor: theme.vars.palette.grey[800],
    borderRight: `1px solid ${theme.vars.palette.grey[700]}`,
    width: `${BTN * 2 + 8 + 2}px`, // 2 cols + gap + border
    overflowY: "auto",
    flexShrink: 0,
    "& .MuiToggleButtonGroup-root": {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 0,
      width: "100%",
    },
    "& .MuiToggleButton-root": {
      padding: "4px",
      width: `${BTN}px`,
      height: `${BTN}px`,
      minWidth: `${BTN}px`,
      minHeight: `${BTN}px`,
      border: "none",
      borderRadius: "4px !important",
      color: theme.vars.palette.grey[400],
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[100],
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        color: theme.vars.palette.grey[200],
      },
    },
    "& .MuiDivider-root": {
      borderColor: theme.vars.palette.grey[700],
      mx: "2px",
    },
  });

export interface SketchToolbarProps {
  activeTool: SketchTool;
  onToolChange: (tool: SketchTool) => void;
  foregroundColor: string;
  backgroundColor: string;
  onForegroundColorChange: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onSwapColors: () => void;
  onResetColors: () => void;
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  onToolChange,
  foregroundColor,
  backgroundColor,
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

  return (
    <Box className="sketch-toolbar" css={styles(theme)}>

      {/* ── Transform ── */}
      <ToggleButtonGroup value={activeTool} exclusive onChange={handleToolChange} size="small">
        <ToggleButton value="move" aria-label="Move">
          <Tooltip title="Move (V)" placement="right"><OpenWithIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="select" aria-label="Select">
          <Tooltip title="Select" placement="right"><SelectAllIcon fontSize="small" /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider flexItem />

      {/* ── Painting ── */}
      <ToggleButtonGroup value={activeTool} exclusive onChange={handleToolChange} size="small">
        <ToggleButton value="brush" aria-label="Brush">
          <Tooltip title="Brush (B)" placement="right"><BrushIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="pencil" aria-label="Pencil">
          <Tooltip title="Pencil (P)" placement="right"><CreateIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="eraser" aria-label="Eraser">
          <Tooltip title="Eraser (E)" placement="right"><AutoFixNormalIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="fill" aria-label="Fill">
          <Tooltip title="Fill (G)" placement="right"><FormatColorFillIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="eyedropper" aria-label="Eyedropper">
          <Tooltip title="Eyedropper (I)" placement="right"><ColorizeIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="blur" aria-label="Blur Brush">
          <Tooltip title="Blur Brush (Q)" placement="right"><BlurOnIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="clone_stamp" aria-label="Clone Stamp">
          <Tooltip title="Clone Stamp (S) — Alt+click to set source" placement="right"><ContentCopyIcon fontSize="small" /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider flexItem />

      {/* ── Shapes ── */}
      <ToggleButtonGroup value={activeTool} exclusive onChange={handleToolChange} size="small">
        <ToggleButton value="line" aria-label="Line">
          <Tooltip title="Line (L)" placement="right"><HorizontalRuleIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="rectangle" aria-label="Rectangle">
          <Tooltip title="Rectangle (R)" placement="right"><RectangleOutlinedIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="ellipse" aria-label="Ellipse">
          <Tooltip title="Ellipse (O)" placement="right"><CircleOutlinedIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="arrow" aria-label="Arrow">
          <Tooltip title="Arrow (A)" placement="right"><ArrowRightAltIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="gradient" aria-label="Gradient">
          <Tooltip title="Gradient (T)" placement="right"><GradientIcon fontSize="small" /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider flexItem />

      {/* ── Utilities ── */}
      <ToggleButtonGroup value={activeTool} exclusive onChange={handleToolChange} size="small">
        <ToggleButton value="crop" aria-label="Crop">
          <Tooltip title="Crop (C)" placement="right"><CropIcon fontSize="small" /></Tooltip>
        </ToggleButton>
        <ToggleButton value="adjust" aria-label="Adjustments">
          <Tooltip title="Adjustments (J)" placement="right"><TuneIcon fontSize="small" /></Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider flexItem />

      {/* ── Colors ── */}
      <Box sx={{ px: "2px" }}>
        <ColorSwatchPair
          foregroundColor={foregroundColor}
          backgroundColor={backgroundColor}
          onForegroundColorChange={onForegroundColorChange}
          onBackgroundColorChange={onBackgroundColorChange}
          onSwapColors={onSwapColors}
          onResetColors={onResetColors}
        />
      </Box>

    </Box>
  );
};

export default memo(SketchToolbar);
