/**
 * SketchToolbar
 *
 * Narrow vertical icon toolbar for tool selection only.
 * All tool settings, colors, actions, and view controls live in SketchToolTopBar.
 *
 * Uses shared PAINTING_TOOLS and SHAPE_TOOLS definitions from toolDefinitions.ts.
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

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "4px",
    backgroundColor: theme.vars.palette.grey[800],
    borderRight: `1px solid ${theme.vars.palette.grey[700]}`,
    width: "44px",
    overflowY: "auto",
    alignItems: "center",
    "& .tool-group": {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    "& .MuiToggleButtonGroup-root": {
      flexDirection: "column"
    },
    "& .MuiToggleButton-root": {
      padding: "6px",
      minWidth: "32px",
      minHeight: "32px"
    }
  });

function renderToolButton(def: ToolDefinition) {
  const { tool, label, shortcut, Icon } = def;
  const tooltipText = shortcut ? `${label} (${shortcut})` : label;
  // Special tooltip for clone stamp
  const tooltip =
    tool === "clone_stamp"
      ? `Clone Stamp (S) — Alt+click to set source`
      : tooltipText;

  return (
    <ToggleButton key={tool} value={tool} aria-label={label}>
      <Tooltip title={tooltip} placement="right">
        <Icon fontSize="small" />
      </Tooltip>
    </ToggleButton>
  );
}

export interface SketchToolbarProps {
  activeTool: SketchTool;
  onToolChange: (tool: SketchTool) => void;
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  onToolChange
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
      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
        {PAINTING_TOOLS.map(renderToolButton)}
      </ToggleButtonGroup>

      <Divider flexItem />

      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
        {SHAPE_TOOLS.map(renderToolButton)}
      </ToggleButtonGroup>
    </Box>
  );
};

export default memo(SketchToolbar);
