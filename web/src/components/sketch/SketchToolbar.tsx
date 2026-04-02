/**
 * SketchToolbar
 *
 * Narrow vertical icon toolbar for tool selection only.
 * Tools are arranged in a 2-column grid with section dividers.
 * Color controls live below the tools (always visible).
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
import { SketchTool } from "./types";
import { PAINTING_TOOLS, SHAPE_TOOLS, type ToolDefinition } from "./toolDefinitions";
import ColorSwatchPair from "./ColorSwatchPair";
import { SKETCH_SPACING, SKETCH_SIZE } from "./sketchStyles";

const BTN = 36; // button size px

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: SKETCH_SPACING.sm,
    padding: `${SKETCH_SPACING.md} ${SKETCH_SPACING.sm}`,
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
      padding: SKETCH_SPACING.sm,
      width: `${BTN}px`,
      height: `${BTN}px`,
      minWidth: `${BTN}px`,
      minHeight: `${BTN}px`,
      border: "none",
      borderRadius: `${SKETCH_SIZE.borderRadius} !important`,
      color: theme.vars.palette.grey[300],
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[50],
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        color: theme.vars.palette.grey[100],
      },
    },
    "& .MuiDivider-root": {
      borderColor: theme.vars.palette.grey[700],
      mx: SKETCH_SPACING.xs,
    },
  });

function renderToolButton(def: ToolDefinition) {
  const { tool, label, shortcut, Icon } = def;
  const tooltipText = shortcut ? `${label} (${shortcut})` : label;
  const tooltip =
    tool === "clone_stamp"
      ? `Clone Stamp (S) — Alt+click to set source`
      : tooltipText;

  return (
    <ToggleButton key={tool} value={tool} aria-label={label}>
      <Tooltip title={tooltip} placement="right">
        <Icon sx={{ fontSize: "20px" }} />
      </Tooltip>
    </ToggleButton>
  );
}

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

      {/* ── Painting + Transform ── */}
      <ToggleButtonGroup value={activeTool} exclusive onChange={handleToolChange} size="small" className="tool-group">
        {PAINTING_TOOLS.map(renderToolButton)}
      </ToggleButtonGroup>

      <Divider flexItem />

      {/* ── Shapes + Utilities ── */}
      <ToggleButtonGroup value={activeTool} exclusive onChange={handleToolChange} size="small" className="tool-group">
        {SHAPE_TOOLS.map(renderToolButton)}
      </ToggleButtonGroup>

      <Divider flexItem />

      {/* ── Colors ── */}
      <Box sx={{ px: SKETCH_SPACING.xs }}>
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
